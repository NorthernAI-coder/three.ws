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

	let provider;
	try {
		provider = createRegenProvider();
	} catch {
		return unconfigured(res);
	}

	try {
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

		const job = await provider.submit({
			mode: 'reconstruct',
			sourceUrl: referenceImageUrl,
			params: { images: views, prompt: prompt || undefined },
		});

		// How the job was actually conditioned. The provider reports back which
		// backend handled it and how many views it fused — these can differ from
		// what was requested when a single-view model is configured and we fall
		// back to the primary view. Surfaced so a downgrade is never silent.
		const viewsRequested = views.length;
		const viewsUsed = typeof job.viewsUsed === 'number' ? job.viewsUsed : viewsRequested;
		const multiview = Boolean(job.multiview);
		const backend = job.backend || 'replicate';

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
			backend,
		});

		return json(res, 200, {
			job_id: job.extJobId,
			creation_id: creationId,
			status: 'queued',
			mode: isImageMode ? 'image_to_3d' : 'text_to_3d',
			prompt: prompt || null,
			preview_image_url: referenceImageUrl,
			reference_image_urls: views,
			views_requested: viewsRequested,
			views_used: viewsUsed,
			multiview,
			backend,
			text_to_image_model: textToImageModel,
			eta_seconds: typeof job.eta === 'number' ? job.eta : null,
		});
	} catch (err) {
		if (err?.code === 'unconfigured') return unconfigured(res);
		// Upstream (Replicate) throttling is a transient 429, not a server fault —
		// return it as such with a retry hint so the page can show a "busy, try
		// again shortly" state instead of a hard error.
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
	if (!JOB_ID_RE.test(jobId)) {
		return json(res, 400, { error: 'invalid_job', message: 'Malformed job id.' });
	}

	const rl = await limits.mcp3dStatus(clientIp(req));
	if (!rl.success) {
		return json(res, 429, {
			error: 'rate_limited',
			retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
		});
	}

	let provider;
	try {
		provider = createRegenProvider();
	} catch {
		return unconfigured(res);
	}

	const clientKey = clientKeyFrom(req);

	// How this job was conditioned (view count + backend), recorded at submit
	// time. Surfaced on every poll so a caller that only polls still learns
	// whether multi-view was honored. Fail-soft: absent when the store is off.
	const meta = await findByJob({ replicateJobId: jobId, clientKey });
	const metaFields = meta
		? {
				views_requested: meta.views_requested ?? null,
				views_used: meta.views_used ?? null,
				multiview: meta.multiview ?? null,
				backend: meta.backend ?? null,
			}
		: {};

	const result = await provider.status(jobId);
	if (result.status === 'done' && result.resultGlbUrl) {
		// Copy the mesh + reference image into our own storage so the model is
		// permanent (Replicate delivery URLs expire in ~1h) and serve the durable
		// CDN url. Falls back to the provider url where the store is unavailable.
		const durable = await materializeCreation({
			replicateJobId: jobId,
			clientKey,
			glbUrl: result.resultGlbUrl,
		});
		return json(res, 200, {
			job_id: jobId,
			creation_id: durable?.id ?? null,
			status: 'done',
			glb_url: durable?.glbUrl ?? result.resultGlbUrl,
			durable: Boolean(durable),
			...metaFields,
		});
	}
	if (result.status === 'failed') {
		await markFailed({ replicateJobId: jobId, clientKey, error: result.error });
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

	const jobId = (url.searchParams.get('job') || '').trim();
	if (!jobId) {
		return json(res, 400, { error: 'missing_job', message: 'Pass ?job=<id> to poll a job.' });
	}
	return pollJob(req, res, jobId);
});
