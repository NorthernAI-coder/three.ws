/**
 * Forge — browser-facing text/image → 3D model generator + auto-rigger.
 *
 *   POST /api/forge             { prompt, aspect_ratio? }   → text→3D job
 *   POST /api/forge             { image_url, prompt? }      → image→3D job
 *   POST /api/forge?action=rig  { glb_url }                 → auto-rig a GLB
 *   GET  /api/forge?job=<id>                                → poll any job
 *
 * This is the public, auth-free twin of the 3D Studio MCP server
 * (api/mcp-3d.js): it drives the exact same real pipeline — a flux-schnell
 * text-to-image pass, then Microsoft TRELLIS mesh reconstruction on Replicate —
 * but over plain JSON so the /forge page can drive it straight from the
 * browser. There is no shared MCP/OAuth context here, so requests are rate
 * limited by client IP using the same generation/status limiters.
 *
 * No mock paths: if REPLICATE_API_TOKEN is absent the endpoint returns a clean
 * 503 with a configuration message and the page renders a designed "not
 * configured" state — it never fabricates a model.
 */

import { cors, json, method, readJson, wrap } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { textToImage } from './_mcp3d/text-to-image.js';
import { createRegenProvider } from './_providers/replicate.js';
import { createRegenProvider as createGcpProvider } from './_providers/gcp.js';
import { createMeshyProvider } from './_providers/meshy.js';
import { createTripoProvider } from './_providers/tripo.js';
import {
	PATHS,
	DEFAULT_PATH,
	TIER_IDS,
	DEFAULT_TIER,
	BACKENDS,
	resolveTier,
	resolveBackendId,
	backendIsConfigured,
	estimateEtaSeconds,
	estimateCredits,
	buildCatalog,
} from './_lib/forge-tiers.js';
import { getSessionUser } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { loadUserProviderKeys } from './_lib/provider-keys.js';
import {
	hashClient,
	hashIp,
	createCreation,
	materializeCreation,
	markFailed,
	findByJob,
} from './_lib/forge-store.js';

const VALID_ASPECT = new Set(['1:1', '4:3', '3:4', '16:9', '9:16']);

// Multi-view reconstruction accepts up to four calibrated views of one object
// (front / back / left / right). More than that yields diminishing returns and
// risks overrunning the model's input budget.
const MAX_VIEWS = 4;

// Guard for caller-supplied reference image / source GLB URLs. http(s) only,
// bounded length — we forward these to the reconstruction/rig provider, so we
// never accept data: URLs or unbounded strings.
const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i;

// A Replicate prediction id is a lowercase base32-ish token. Constrain the
// poll parameter to that shape so we never forward arbitrary strings upstream.
const JOB_ID_RE = /^[a-z0-9]{16,64}$/;

// Stable anonymous handle for the browser making the request (/forge has no
// login). Used to scope durable creations + the gallery to one client without
// trusting any of its other input.
function clientKeyFrom(req) {
	const raw = req.headers['x-forge-client'];
	return hashClient(Array.isArray(raw) ? raw[0] : raw);
}

// Resolve the requested generation path + quality tier from the body, falling
// back to the existing fast defaults (image-intermediate, standard tier).
function parsePath(body) {
	const p = typeof body?.path === 'string' ? body.path.trim() : '';
	return PATHS.includes(p) ? p : DEFAULT_PATH;
}
function parseTier(body) {
	const t = typeof body?.tier === 'string' ? body.tier.trim() : '';
	return TIER_IDS.includes(t) ? t : DEFAULT_TIER;
}

// BYOK key resolution for the geometry providers (Meshy / Tripo). No platform
// key exists for these, so the key must come from the caller. Two real sources,
// in priority order:
//   1. An inline key on the request — header `x-forge-provider-key` (preferred,
//      kept out of URLs/logs) or `provider_key` in the POST body. Used
//      transiently and never persisted.
//   2. The signed-in user's stored, encrypted key (the dashboard BYOK store),
//      when the request carries a session cookie.
// Returns the plaintext key or null when none is available.
async function resolveProviderKey(req, body, providerName) {
	const header = req.headers['x-forge-provider-key'];
	const inline =
		(typeof header === 'string' && header) ||
		(Array.isArray(header) && header[0]) ||
		(typeof body?.provider_key === 'string' ? body.provider_key : '');
	if (inline && inline.trim()) return inline.trim();

	try {
		const session = await getSessionUser(req);
		if (session?.id) {
			const [row] = await sql`SELECT provider_keys FROM users WHERE id = ${session.id}`;
			const keys = await loadUserProviderKeys(row?.provider_keys);
			if (keys[providerName]) return keys[providerName];
		}
	} catch {
		// No DB / no session — fall through to "no key".
	}
	return null;
}

// Jobs from the geometry providers are polled on a different upstream than the
// default Replicate path, so we hand the browser an opaque token that records
// which provider + task-kind to poll. The legacy Replicate path keeps returning
// its bare prediction id (it matches JOB_ID_RE), so old links never break.
function encodeJobToken({ provider, kind, taskId }) {
	return `f1.${Buffer.from(JSON.stringify({ p: provider, k: kind, t: taskId }), 'utf8').toString('base64url')}`;
}
function decodeJobToken(token) {
	if (typeof token !== 'string' || !token.startsWith('f1.')) return null;
	try {
		const obj = JSON.parse(Buffer.from(token.slice(3), 'base64url').toString('utf8'));
		if (!obj?.p || !obj?.t) return null;
		return { provider: obj.p, kind: obj.k || null, taskId: String(obj.t) };
	} catch {
		return null;
	}
}

// "needs a BYOK key" — a designed, branchable state (mirrors rig_unconfigured)
// rather than a generic error, so the page can prompt for the key inline.
function needsKey(res, providerName) {
	const meta = BACKENDS[providerName];
	return json(res, 501, {
		error: 'needs_key',
		provider: providerName,
		message: `The geometry path uses ${meta?.label || providerName}, which needs your own API key. Add a ${meta?.byok || providerName} key to use it.`,
	});
}

// Normalize the caller's reference image input into an ordered, de-duplicated
// list of view URLs. Accepts the multi-view `image_urls: string[]` form and the
// legacy single `image_url: string` (backward compatible — a single string
// still works exactly as before). Empty/blank/duplicate entries are dropped.
function parseImageUrls(body) {
	let raw;
	if (Array.isArray(body?.image_urls)) raw = body.image_urls;
	else if (typeof body?.image_url === 'string') raw = [body.image_url];
	else raw = [];

	const seen = new Set();
	const out = [];
	for (const v of raw) {
		if (typeof v !== 'string') continue;
		const t = v.trim();
		if (!t || seen.has(t)) continue;
		seen.add(t);
		out.push(t);
	}
	return out;
}

function unconfigured(res) {
	return json(res, 503, {
		error: 'unconfigured',
		message:
			'Text-to-3D generation is not configured on this deployment (REPLICATE_API_TOKEN is missing).',
	});
}

async function startJob(req, res) {
	const ip = clientIp(req);
	const rl = await limits.mcp3dGenerate(ip);
	if (!rl.success) {
		return json(res, 429, {
			error: 'rate_limited',
			message: 'Generation limit reached. Try again shortly.',
			retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
		});
	}

	const body = await readJson(req, 8_000).catch(() => null);

	// Two reconstruction modes share this path:
	//   • image→3D — a caller supplies one or more reference views (image_url or
	//     image_urls[]); we reconstruct directly and skip the text-to-image stage.
	//     With >1 view the provider fuses them (multi-view conditioning). An
	//     optional prompt may still guide the model where it accepts one.
	//   • text→3D — no images; we synthesize the reference image from the prompt
	//     with FLUX first, then reconstruct.
	const imageUrls = parseImageUrls(body);
	const isImageMode = imageUrls.length > 0;
	const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';

	if (isImageMode) {
		if (imageUrls.length > MAX_VIEWS) {
			return json(res, 400, {
				error: 'invalid_image_urls',
				message: `Provide between 1 and ${MAX_VIEWS} reference images.`,
			});
		}
		// Validate every view at the boundary before any of them reach the model.
		for (const u of imageUrls) {
			if (!HTTP_URL_RE.test(u) || u.length > 2048) {
				return json(res, 400, {
					error: 'invalid_image_url',
					message: 'Each reference image must be an http(s) URL under 2048 characters.',
				});
			}
		}
		if (prompt.length > 1000) {
			return json(res, 400, {
				error: 'invalid_prompt',
				message: 'Optional guidance prompt must be 1000 characters or fewer.',
			});
		}
	} else if (prompt.length < 3 || prompt.length > 1000) {
		return json(res, 400, {
			error: 'invalid_prompt',
			message:
				'Describe one subject in 3–1000 characters, or pass image_url / image_urls for image-to-3D.',
		});
	}
	const aspect = VALID_ASPECT.has(body?.aspect_ratio) ? body.aspect_ratio : '1:1';

	// Two request axes beyond input mode: which generation path (image-
	// intermediate vs geometry-first) and which quality tier (poly budget).
	const path = parsePath(body);
	const tier = resolveTier(parseTier(body));
	const backendId = resolveBackendId({ path, backend: body?.backend });

	try {
		// ── Geometry-first path (Meshy / Tripo, BYOK) ───────────────────────────
		// A native 3D model emits mesh geometry directly — from the prompt
		// (text→geometry) or a single photo (image→3D) — with no synthesized
		// intermediate view, so detail isn't capped by one image. These backends
		// have no platform key; the caller supplies their own.
		if (path === 'geometry') {
			const providerName = BACKENDS[backendId].byok; // 'meshy' | 'tripo'
			const key = await resolveProviderKey(req, body, providerName);
			if (!key) return needsKey(res, backendId);

			let gp;
			try {
				gp = backendId === 'tripo' ? createTripoProvider(key) : createMeshyProvider(key);
			} catch {
				return needsKey(res, backendId);
			}

			let submitted;
			let previewImageUrl = null;
			if (isImageMode) {
				// The native image→3D endpoints reconstruct from a single primary
				// view; multi-view fusion stays on the image/TRELLIS path.
				previewImageUrl = imageUrls[0];
				submitted = await gp.imageTo3d({ imageUrl: previewImageUrl, prompt: prompt || undefined, tier });
			} else {
				submitted = await gp.textToGeometry({ prompt, tier });
			}

			const token = encodeJobToken({ provider: providerName, kind: submitted.kind, taskId: submitted.taskId });

			// Store the upstream task id as the job handle so findByJob/materialize
			// resolve it on poll, exactly like the Replicate path.
			const creationId = await createCreation({
				clientKey: clientKeyFrom(req),
				ipHash: hashIp(ip),
				prompt: prompt || (isImageMode ? 'image-to-3d' : ''),
				aspect: isImageMode ? null : aspect,
				previewImageUrl,
				replicateJobId: submitted.taskId,
				textToImageModel: null,
				viewsRequested: isImageMode ? imageUrls.length : 0,
				viewsUsed: isImageMode ? 1 : null,
				multiview: false,
				backend: backendId,
				tier: tier.id,
				path,
			});

			return json(res, 200, {
				job_id: token,
				creation_id: creationId,
				status: 'queued',
				mode: isImageMode ? 'image_to_3d' : 'text_to_3d',
				path,
				tier: tier.id,
				backend: backendId,
				prompt: prompt || null,
				preview_image_url: previewImageUrl,
				reference_image_urls: isImageMode ? [imageUrls[0]] : [],
				eta_seconds: estimateEtaSeconds({ backendId, tier }),
				estimated_credits: estimateCredits({ backendId, path, tier }),
			});
		}

		// ── Image-intermediate path (TRELLIS default, or Hunyuan3D self-host) ────
		let provider;
		try {
			provider = backendId === 'hunyuan3d' ? createGcpProvider() : createRegenProvider();
		} catch {
			// A selected-but-unconfigured self-host backend gets a branchable 501;
			// the default TRELLIS path keeps its existing "not configured" 503.
			if (backendId === 'hunyuan3d') {
				return json(res, 501, {
					error: 'backend_unconfigured',
					backend: 'hunyuan3d',
					message: 'Hunyuan3D self-host is not configured on this deployment.',
				});
			}
			return unconfigured(res);
		}

		// Resolve the reference views: supplied directly (image→3D) or a single
		// view synthesized from the prompt (text→3D). `referenceImageUrl` is the
		// primary view — the durable preview + the synthesis target.
		let referenceImageUrl;
		let textToImageModel;
		let views;
		if (isImageMode) {
			views = imageUrls;
			referenceImageUrl = imageUrls[0];
			textToImageModel = null;
		} else {
			const synthesized = await textToImage(prompt, { aspectRatio: aspect });
			referenceImageUrl = synthesized.imageUrl;
			textToImageModel = synthesized.model;
			views = [referenceImageUrl];
		}

		// Only poly-aware backends (Hunyuan3D self-host) accept a target budget;
		// TRELLIS validates its input schema and would 422 on an unknown field, so
		// the tier rides along as the recorded provenance only.
		const reconstructParams = { images: views, prompt: prompt || undefined };
		if (BACKENDS[backendId].polyControl) {
			reconstructParams.target_polycount = tier.polycount;
			reconstructParams.tier = tier.id;
			reconstructParams.path = path;
		}

		const job = await provider.submit({
			mode: 'reconstruct',
			sourceUrl: referenceImageUrl,
			params: reconstructParams,
		});

		// How the job was actually conditioned. The provider reports back which
		// backend handled it and how many views it fused — these can differ from
		// what was requested when a single-view model is configured and we fall
		// back to the primary view. Surfaced so a downgrade is never silent.
		const viewsRequested = views.length;
		const viewsUsed = typeof job.viewsUsed === 'number' ? job.viewsUsed : viewsRequested;
		const multiview = Boolean(job.multiview);

		// TRELLIS returns a bare Replicate prediction id (kept as the job handle
		// for backward compatibility); the GCP/Hunyuan3D provider returns its own
		// opaque envelope, which we wrap in a forge token so polling routes back to
		// the GCP provider. Either way the upstream id is what the store keys on.
		const jobHandle =
			backendId === 'hunyuan3d'
				? encodeJobToken({ provider: 'gcp', kind: null, taskId: job.extJobId })
				: job.extJobId;

		// Record the generation the moment it starts so the prompt + reference
		// image survive even if the mesh step later fails. Fail-soft: a missing
		// store just means no durable copy + no gallery entry for this run.
		const creationId = await createCreation({
			clientKey: clientKeyFrom(req),
			ipHash: hashIp(ip),
			prompt: prompt || (isImageMode ? 'image-to-3d' : ''),
			aspect,
			previewImageUrl: referenceImageUrl,
			replicateJobId: job.extJobId,
			textToImageModel,
			viewsRequested,
			viewsUsed,
			multiview,
			backend: backendId,
			tier: tier.id,
			path,
		});

		return json(res, 200, {
			job_id: jobHandle,
			creation_id: creationId,
			status: 'queued',
			mode: isImageMode ? 'image_to_3d' : 'text_to_3d',
			path,
			tier: tier.id,
			backend: backendId,
			prompt: prompt || null,
			preview_image_url: referenceImageUrl,
			reference_image_urls: views,
			views_requested: viewsRequested,
			views_used: viewsUsed,
			multiview,
			text_to_image_model: textToImageModel,
			eta_seconds: estimateEtaSeconds({ backendId, tier }),
			estimated_credits: estimateCredits({ backendId, path, tier }),
		});
	} catch (err) {
		if (err?.code === 'unconfigured') return unconfigured(res);
		if (err?.code === 'invalid_key') {
			return json(res, 401, {
				error: 'invalid_key',
				message: err.message || 'The provider rejected this API key.',
			});
		}
		if (err?.code === 'insufficient_credits') {
			return json(res, 402, {
				error: 'insufficient_credits',
				message: err.message || 'The provider account is out of credits.',
			});
		}
		// Upstream throttling is a transient 429, not a server fault — return it as
		// such with a retry hint so the page can show a "busy, try again" state.
		if (err?.code === 'rate_limited' || err?.providerStatus === 429) {
			return json(res, 429, {
				error: 'rate_limited',
				message: 'The 3D generator is busy right now. Try again in a few seconds.',
				retry_after: typeof err?.retryAfter === 'number' ? err.retryAfter : 10,
			});
		}
		return json(res, 502, {
			error: 'generation_failed',
			message: err?.message || 'The generator could not start this job.',
		});
	}
}

// Auto-rig an existing GLB mesh: skeleton + skin weights via the provider's
// `rerig` mode (VAST-AI UniRig by default). Takes a GLB URL, returns a job id
// that polls through the same GET ?job=<id> path — provider.status() is
// mode-agnostic, so the rigged GLB surfaces exactly like a reconstruction.
async function startRigJob(req, res) {
	const ip = clientIp(req);
	const rl = await limits.mcp3dGenerate(ip);
	if (!rl.success) {
		return json(res, 429, {
			error: 'rate_limited',
			message: 'Rigging limit reached. Try again shortly.',
			retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
		});
	}

	const body = await readJson(req, 8_000).catch(() => null);
	const glbUrl = typeof body?.glb_url === 'string' ? body.glb_url.trim() : '';
	if (!HTTP_URL_RE.test(glbUrl) || glbUrl.length > 2048) {
		return json(res, 400, {
			error: 'invalid_glb_url',
			message: 'glb_url must be an http(s) URL to a GLB mesh, under 2048 characters.',
		});
	}

	let provider;
	try {
		provider = createRegenProvider();
	} catch {
		return unconfigured(res);
	}

	// Rigging stays dormant until a rerig model is configured — surface a clean
	// 501 rather than a generic provider error so callers can branch on it.
	if (!provider.supportsMode('rerig')) {
		return json(res, 501, {
			error: 'rig_unconfigured',
			message:
				'Auto-rigging is not configured on this deployment (REPLICATE_RERIG_MODEL is not set).',
		});
	}

	try {
		const job = await provider.submit({ mode: 'rerig', sourceUrl: glbUrl, params: {} });
		const creationId = await createCreation({
			clientKey: clientKeyFrom(req),
			ipHash: hashIp(ip),
			prompt: 'auto-rig',
			aspect: null,
			previewImageUrl: null,
			replicateJobId: job.extJobId,
			textToImageModel: null,
		});
		return json(res, 200, {
			job_id: job.extJobId,
			creation_id: creationId,
			status: 'queued',
			mode: 'rig',
			source_glb_url: glbUrl,
			eta_seconds: typeof job.eta === 'number' ? job.eta : null,
		});
	} catch (err) {
		if (err?.code === 'mode_unconfigured') {
			return json(res, 501, { error: 'rig_unconfigured', message: err.message });
		}
		if (err?.code === 'rate_limited' || err?.providerStatus === 429) {
			return json(res, 429, {
				error: 'rate_limited',
				message: 'The rigger is busy right now. Try again in a few seconds.',
				retry_after: 10,
			});
		}
		return json(res, 502, {
			error: 'rig_failed',
			message: err?.message || 'The rigger could not start this job.',
		});
	}
}

async function pollJob(req, res, jobId) {
	// A job handle is either a bare Replicate prediction id (legacy / image-
	// TRELLIS path) or a forge token encoding the geometry/GCP provider + the
	// upstream task id. Decode to learn which provider to poll.
	const token = decodeJobToken(jobId);
	if (!token && !JOB_ID_RE.test(jobId)) {
		return json(res, 400, { error: 'invalid_job', message: 'Malformed job id.' });
	}

	const rl = await limits.mcp3dStatus(clientIp(req));
	if (!rl.success) {
		return json(res, 429, {
			error: 'rate_limited',
			retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
		});
	}

	const provider = token?.provider || 'replicate';
	const upstreamId = token?.taskId || jobId;
	const clientKey = clientKeyFrom(req);

	// How this job was conditioned (path + tier + backend + view count), recorded
	// at submit time. Surfaced on every poll so a caller that only polls still
	// learns the provenance. Fail-soft: absent when the store is off.
	const meta = await findByJob({ replicateJobId: upstreamId, clientKey });
	const metaFields = meta
		? {
				views_requested: meta.views_requested ?? null,
				views_used: meta.views_used ?? null,
				multiview: meta.multiview ?? null,
				backend: meta.backend ?? null,
				tier: meta.tier ?? null,
				path: meta.path ?? null,
			}
		: {};

	// Poll the provider that owns this job. BYOK providers re-resolve the key per
	// poll (the client resends it, or it loads from the session store).
	let result;
	try {
		if (provider === 'meshy' || provider === 'tripo') {
			const key = await resolveProviderKey(req, null, provider);
			if (!key) {
				return json(res, 200, {
					job_id: jobId,
					status: 'failed',
					error: 'Your API key is required to check this job. Re-enter it and retry.',
					...metaFields,
				});
			}
			const gp = provider === 'tripo' ? createTripoProvider(key) : createMeshyProvider(key);
			result = await gp.status({ kind: token.kind, taskId: upstreamId });
		} else if (provider === 'gcp') {
			let gcp;
			try {
				gcp = createGcpProvider();
			} catch {
				return json(res, 501, {
					error: 'backend_unconfigured',
					message: 'Hunyuan3D self-host is not configured on this deployment.',
				});
			}
			result = await gcp.status(upstreamId);
		} else {
			let rep;
			try {
				rep = createRegenProvider();
			} catch {
				return unconfigured(res);
			}
			result = await rep.status(jobId);
		}
	} catch {
		// A transient poll error shouldn't fail the job — report running so the
		// client's loop retries.
		return json(res, 200, { job_id: jobId, status: 'running', ...metaFields });
	}

	if (result.status === 'done' && result.resultGlbUrl) {
		// Copy the mesh into our own storage so the model is permanent (provider
		// delivery URLs expire) and serve the durable CDN url. Falls back to the
		// provider url where the store is unavailable.
		const durable = await materializeCreation({
			replicateJobId: upstreamId,
			clientKey,
			glbUrl: result.resultGlbUrl,
		});
		return json(res, 200, {
			job_id: jobId,
			creation_id: durable?.id ?? meta?.id ?? null,
			status: 'done',
			glb_url: durable?.glbUrl ?? result.resultGlbUrl,
			durable: Boolean(durable),
			...metaFields,
		});
	}
	if (result.status === 'failed') {
		await markFailed({ replicateJobId: upstreamId, clientKey, error: result.error });
		return json(res, 200, {
			job_id: jobId,
			status: 'failed',
			error: result.error || 'Generation failed.',
			...metaFields,
		});
	}
	return json(res, 200, { job_id: jobId, status: result.status || 'running', ...metaFields });
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS' })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	const url = new URL(req.url, 'http://localhost');

	if (req.method === 'POST') {
		// ?action=rig auto-rigs an existing GLB; the default POST reconstructs a
		// mesh from a prompt (text→3D) or a reference image (image→3D).
		if ((url.searchParams.get('action') || '').trim() === 'rig') {
			return startRigJob(req, res);
		}
		return startJob(req, res);
	}

	// ?catalog — the tier + backend + cost/time matrix the composer renders.
	// Public, no secrets; lets the UI communicate the time/cost trade-off and
	// which backends are live before the user commits.
	if (url.searchParams.has('catalog')) {
		return json(res, 200, buildCatalog());
	}

	const jobId = (url.searchParams.get('job') || '').trim();
	if (!jobId) {
		return json(res, 400, { error: 'missing_job', message: 'Pass ?job=<id> to poll a job.' });
	}
	return pollJob(req, res, jobId);
});
