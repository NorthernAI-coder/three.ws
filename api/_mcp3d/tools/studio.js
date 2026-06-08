// three.ws 3D Studio MCP — generation tools.
//
// text_to_3d / image_to_3d submit a reconstruction job and return a job handle.
//   Both accept a quality tier (draft/standard/high) and a generation path:
//   "image" (FLUX→TRELLIS, the platform-keyed default) or "geometry" (native
//   text/image→mesh via Meshy/Tripo, BYOK). generation_status polls any job —
//   it is provider-aware, decoding the forge job token to route geometry jobs.
// auto_rig_model adds a skeleton + skin weights to a static mesh (rerig).
// preview_3d renders any GLB inline. remove_background strips image backgrounds.
// remesh_model converts, simplifies, and repairs meshes.
// stylize_model applies one-click geometric filters (voxel/brick/voronoi/lowpoly).
// retexture_model paints a new texture onto a mesh from a text prompt.
// retexture_region (magic brush) repaints only a masked UV region, preserving the rest.
// pose_model maps a prompt to a deterministic pose-studio seed + joint rotations.
// direct_prompt (IBM Granite) rewrites a rough idea into an optimized 3D spec.
// generate_material (IBM Granite) emits a glTF PBR material from a description.

import { createHash } from 'node:crypto';
import { limits } from '../../_lib/rate-limit.js';
import { assertSafePublicUrl } from '../../_lib/ssrf-guard.js';
import { createRegenProvider as createReplicateProvider } from '../../_providers/replicate.js';
import { createRegenProvider as createGcpProvider } from '../../_providers/gcp.js';
import { createMeshyProvider } from '../../_providers/meshy.js';
import { createTripoProvider } from '../../_providers/tripo.js';
import { textToImage } from '../text-to-image.js';
import {
	PATHS,
	DEFAULT_PATH,
	TIER_IDS,
	DEFAULT_TIER,
	BACKENDS,
	resolveTier,
	resolveBackendId,
	estimateEtaSeconds,
	estimateCredits,
} from '../../_lib/forge-tiers.js';
import { resolveProviderKey } from '../../_lib/forge-provider-key.js';
import { encodeJobToken, decodeJobToken } from '../../_lib/forge-job-token.js';
import { watsonxConfig, watsonxChatComplete } from '../../_lib/watsonx.js';
import { createAvatar, storageKeyFor } from '../../_lib/avatars.js';
import { putObject } from '../../_lib/r2.js';
import { isValidGlbHeader, inspectGlb } from '../../_lib/glb-inspect.js';
import { env } from '../../_lib/env.js';
import { PRESETS, PRESET_GROUPS } from '../../../src/pose-presets.js';
import {
	renderModelViewerHtml,
	safeCssValue,
	safeCssLength,
	safeHttpsUrl,
} from '../../_mcp/render.js';

function rpcError(code, message, data) {
	const e = new Error(message);
	e.code = code;
	e.data = data;
	return e;
}

function rateKey(auth) {
	return auth.userId || auth.rateKey || 'anon';
}

async function enforce(limiter, auth) {
	const rl = await limiter(rateKey(auth));
	if (!rl.success) {
		throw rpcError(-32000, 'rate_limited', {
			retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
		});
	}
}

// Resolve the best available provider for a given mode.
// GCP takes priority when the service URL is configured for that mode;
// falls back to Replicate for the standard reconstruct/remesh/retex/rerig modes.
function regenProvider(mode = 'reconstruct') {
	const gcpKey = process.env?.GCP_RECONSTRUCTION_KEY;
	if (gcpKey) {
		try {
			const gcp = createGcpProvider();
			if (gcp.supportsMode(mode)) return gcp;
		} catch {
			// fall through to Replicate
		}
	}
	try {
		return createReplicateProvider();
	} catch (err) {
		throw rpcError(-32000, '3D generation is not configured', { reason: err.message });
	}
}

// Region (magic-brush) edits MUST run on the GCP texture worker — the Replicate
// path has no masked-inpaint model, so we never silently fall back to it and
// drop the mask. Require GCP explicitly and fail with a clear message otherwise.
function regionProvider() {
	if (process.env?.GCP_RECONSTRUCTION_KEY) {
		try {
			const gcp = createGcpProvider();
			if (gcp.supportsMode('retex_region')) return gcp;
		} catch {
			// fall through to the explicit error below
		}
	}
	throw rpcError(
		-32000,
		'Region retexture requires the GCP texture worker (set GCP_RECONSTRUCTION_KEY and GCP_TEXTURE_URL).',
	);
}

// Validate via the shared DNS-resolving SSRF guard: https-only, the hostname is
// resolved and every A/AAAA record is checked against the full private/loopback/
// link-local/ULA/IPv4-mapped/metadata blocklist (covering 172.16/12, [::1],
// fc00::/7, fe80::/10, ::ffff: and decimal/hex IP encodings the old ad-hoc
// prefix checks missed). Async because it performs DNS resolution.
async function isPublicHttpsUrl(s) {
	try {
		await assertSafePublicUrl(String(s), { allowHttp: false });
		return true;
	} catch {
		return false;
	}
}

const POLL_HINT =
	'Call generation_status with this job_id to check progress. ' +
	'Reconstruction typically finishes in 30–90 seconds.';

// Ceiling on a GLB copied into durable storage by save_avatar. Matches the
// reconstruct + forge pipelines so a runaway model can't ingest an unbounded blob.
const MAX_GLB_BYTES = 64 * 1024 * 1024;

// Fetch a provider GLB into a Buffer with a hard size cap, so save_avatar can
// persist its own durable copy before the provider's delivery URL expires.
async function fetchGlbBuffer(url) {
	const resp = await fetch(url);
	if (!resp.ok) throw rpcError(-32000, `Could not fetch the GLB (${resp.status}).`);
	const declared = Number(resp.headers.get('content-length') || 0);
	if (declared && declared > MAX_GLB_BYTES) {
		throw rpcError(-32000, `GLB too large to save (${declared} bytes; max ${MAX_GLB_BYTES}).`);
	}
	const buf = Buffer.from(await resp.arrayBuffer());
	if (buf.length > MAX_GLB_BYTES) {
		throw rpcError(-32000, `GLB too large to save (${buf.length} bytes; max ${MAX_GLB_BYTES}).`);
	}
	return buf;
}

function viewerArtifact({ glbUrl, name, options = {} }) {
	const html = renderModelViewerHtml({
		src: glbUrl,
		name: name || '3D model',
		poster: safeHttpsUrl(options.poster),
		background: safeCssValue(options.background, 'transparent'),
		height: safeCssLength(options.height, '480px'),
		width: safeCssLength(options.width, '100%'),
		autoRotate: options.auto_rotate !== false,
		ar: options.ar !== false,
		cameraOrbit: safeCssValue(options.camera_orbit, ''),
	});
	return {
		type: 'resource',
		resource: { uri: glbUrl, mimeType: 'text/html', text: html },
	};
}

// ── Quality tier + generation path/backend (shared by text_to_3d/image_to_3d) ──
// Mirrors the /api/forge axes: `path` ("image" vs "geometry"), `tier`
// (draft/standard/high poly budget), `backend` (trellis/meshy/tripo/hunyuan3d).
// The default — path "image", backend "trellis" — keeps the existing fast
// platform-keyed reconstruction untouched.
function parsePathArg(args) {
	const p = typeof args?.path === 'string' ? args.path.trim() : '';
	return PATHS.includes(p) ? p : DEFAULT_PATH;
}
function parseTierArg(args) {
	const t = typeof args?.tier === 'string' ? args.tier.trim() : '';
	return TIER_IDS.includes(t) ? t : DEFAULT_TIER;
}

const TIER_PROP = {
	type: 'string',
	enum: TIER_IDS,
	default: DEFAULT_TIER,
	description:
		'Quality tier: draft (~12k poly, fast), standard (~30k, balanced), high (~200k + PBR, slower). Honoured by poly-aware backends (Meshy/Tripo/Hunyuan3D); the TRELLIS default records it as provenance.',
};
const PATH_PROP = {
	type: 'string',
	enum: PATHS,
	default: DEFAULT_PATH,
	description:
		'Generation path: "image" (FLUX→TRELLIS reference-image reconstruction, the platform-keyed default) or "geometry" (native text/image→mesh via Meshy/Tripo — cleaner topology, but BYOK: needs your own provider key).',
};
const BACKEND_PROP = {
	type: 'string',
	enum: Object.keys(BACKENDS),
	description:
		'Force a specific backend (trellis, meshy, tripo, hunyuan3d). Defaults to the best one for the chosen path. Backends outside the path are ignored.',
};

// "needs a BYOK key" — a designed, branchable result (mirrors /api/forge's
// needs_key state), not an error: the geometry providers have no platform key,
// so a caller without one is told exactly how to enable the path.
function needsKeyResult(backendId) {
	const meta = BACKENDS[backendId];
	return {
		content: [
			{
				type: 'text',
				text:
					`The geometry path uses ${meta?.label || backendId}, which needs your own API key. ` +
					`Send it as the "x-forge-provider-key" request header (or store a ${meta?.byok || backendId} key on your three.ws account) and retry, ` +
					'or use the default image path (omit "path", or set path="image").',
			},
		],
		structuredContent: {
			status: 'needs_key',
			backend: backendId,
			provider: meta?.byok || backendId,
		},
		isError: true,
	};
}

// Submit a native geometry-first job (Meshy/Tripo, BYOK) and shape the MCP
// response. Returns a needs_key result when no key is available. The job handle
// is a forge token so generation_status routes the poll back to this provider.
async function submitGeometryJob({
	req,
	args,
	backendId,
	isImageMode,
	prompt,
	primaryImage,
	tier,
	path,
}) {
	const providerName = BACKENDS[backendId].byok; // 'meshy' | 'tripo'
	const key = await resolveProviderKey(req, args, providerName);
	if (!key) return needsKeyResult(backendId);

	let gp;
	try {
		gp = backendId === 'tripo' ? createTripoProvider(key) : createMeshyProvider(key);
	} catch {
		return needsKeyResult(backendId);
	}

	const submitted = isImageMode
		? await gp.imageTo3d({ imageUrl: primaryImage, prompt: prompt || undefined, tier })
		: await gp.textToGeometry({ prompt, tier });
	const token = encodeJobToken({
		provider: providerName,
		kind: submitted.kind,
		taskId: submitted.taskId,
	});

	return {
		content: [
			{
				type: 'text',
				text:
					`Started ${isImageMode ? 'image-to-3D' : 'text-to-3D'} on ${BACKENDS[backendId].label} ` +
					`(${path} path, ${tier.id} tier).\nJob ID: ${token}\n${POLL_HINT}`,
			},
		],
		structuredContent: {
			job_id: token,
			status: 'queued',
			mode: isImageMode ? 'image_to_3d' : 'text_to_3d',
			path,
			tier: tier.id,
			backend: backendId,
			prompt: prompt || null,
			source_image_url: isImageMode ? primaryImage : null,
			eta_seconds: estimateEtaSeconds({ backendId, tier }),
			estimated_credits: estimateCredits({ backendId, path, tier }),
		},
	};
}

// Poll whichever upstream owns a job. A bare id (legacy / image-TRELLIS path)
// polls Replicate. A forge token (f1.*) decodes to the geometry provider
// (Meshy/Tripo, BYOK re-resolved per poll) or the self-hosted GCP backend.
async function pollAnyProvider(req, jobId) {
	const token = decodeJobToken(jobId);
	if (token) {
		if (token.provider === 'meshy' || token.provider === 'tripo') {
			const key = await resolveProviderKey(req, null, token.provider);
			if (!key) {
				return {
					status: 'failed',
					error: 'Your provider API key is required to check this job. Send it as the x-forge-provider-key header and retry.',
				};
			}
			const gp =
				token.provider === 'tripo' ? createTripoProvider(key) : createMeshyProvider(key);
			return gp.status({ kind: token.kind, taskId: token.taskId });
		}
		if (token.provider === 'gcp') {
			let gcp;
			try {
				gcp = createGcpProvider();
			} catch {
				return {
					status: 'failed',
					error: 'The self-hosted reconstruction backend is not configured.',
				};
			}
			return gcp.status(token.taskId);
		}
		return regenProvider().status(token.taskId);
	}
	return regenProvider().status(jobId);
}

// ── pose_model: deterministic preset selection (ported from the pose-seed tool) ─
function poseTokensOf(str) {
	return String(str || '')
		.toLowerCase()
		.split(/[^a-z0-9]+/g)
		.filter(Boolean);
}
const POSE_INDEX = PRESETS.map((preset) => {
	const idTokens = poseTokensOf(preset.id);
	const labelTokens = poseTokensOf(preset.label);
	const groupTokens = poseTokensOf(preset.group);
	return {
		preset,
		all: new Set([...idTokens, ...labelTokens, ...groupTokens]),
		idTokens,
		labelTokens,
	};
});
function scorePosePreset(promptTokens, entry) {
	let score = 0;
	for (const t of promptTokens) {
		if (entry.all.has(t)) score += 3;
		else {
			for (const tok of [...entry.idTokens, ...entry.labelTokens]) {
				if (tok.includes(t) || t.includes(tok)) {
					score += 1;
					break;
				}
			}
		}
	}
	return score;
}
function pickPosePreset(prompt) {
	const tokens = poseTokensOf(prompt);
	const deterministic = () => {
		const hash = createHash('sha256').update(String(prompt)).digest();
		return {
			entry: POSE_INDEX[hash.readUInt32BE(0) % POSE_INDEX.length],
			score: 0,
			reason: 'no-match-deterministic-pick',
		};
	};
	if (tokens.length === 0) return deterministic();
	let best = null;
	let bestScore = -1;
	for (const entry of POSE_INDEX) {
		const sc = scorePosePreset(tokens, entry);
		if (sc > bestScore) {
			best = entry;
			bestScore = sc;
		}
	}
	if (bestScore <= 0) return deterministic();
	return { entry: best, score: bestScore, reason: 'token-match' };
}
const POSE_PREVIEW_BASE = process.env.MCP_POSE_PREVIEW_BASE || 'https://three.ws/pose';

// ── IBM Granite (watsonx.ai) config guard for direct_prompt / generate_material ─
function graniteConfigOrThrow() {
	const cfg = watsonxConfig();
	if (!cfg.configured) {
		throw rpcError(
			-32000,
			'IBM watsonx.ai is not configured on this server (set WATSONX_API_KEY and WATSONX_PROJECT_ID).',
		);
	}
	return cfg;
}
function stripJsonFence(text) {
	const raw = String(text || '').trim();
	return raw.startsWith('```') ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '') : raw;
}

export const toolDefs = [
	{
		name: 'text_to_3d',
		title: 'Generate a 3D model from a text prompt',
		description:
			'Turn a text description into a textured 3D model (GLB). Runs a fast text-to-image pass, then reconstructs a mesh from that image with Microsoft TRELLIS. Returns a job_id (poll with generation_status) plus the intermediate preview image. Best results: a single, clearly described object — "a worn leather armchair", "a low-poly red fox", "a sci-fi helmet".',
		inputSchema: {
			type: 'object',
			properties: {
				prompt: {
					type: 'string',
					minLength: 3,
					maxLength: 1000,
					description: 'What to generate. Describe one subject clearly.',
				},
				aspect_ratio: {
					type: 'string',
					enum: ['1:1', '4:3', '3:4', '16:9', '9:16'],
					default: '1:1',
					description:
						'Aspect ratio of the intermediate reference image (image path only).',
				},
				tier: TIER_PROP,
				path: PATH_PROP,
				backend: BACKEND_PROP,
				__ASPECT_CLOSE__: {},
			},
			required: ['prompt'],
			additionalProperties: false,
		},
		async handler(args, auth, req) {
			await enforce(limits.mcp3dGenerate, auth);
			const path = parsePathArg(args);
			const tier = resolveTier(parseTierArg(args));
			const backendId = resolveBackendId({ path, backend: args.backend });

			// Geometry-first path (Meshy/Tripo, BYOK) — native text→mesh.
			if (path === 'geometry') {
				return submitGeometryJob({
					req,
					args,
					backendId,
					isImageMode: false,
					prompt: args.prompt,
					primaryImage: null,
					tier,
					path,
				});
			}

			// Image path (default): synthesize a reference image, then reconstruct.
			const provider = regenProvider();
			const { imageUrl, model } = await textToImage(args.prompt, {
				aspectRatio: args.aspect_ratio || '1:1',
			});
			// Only poly-aware backends accept a budget; TRELLIS would 422 on an
			// unknown field, so the tier rides along as provenance only there.
			const params = { image: imageUrl, prompt: args.prompt };
			if (BACKENDS[backendId].polyControl) {
				params.target_polycount = tier.polycount;
				params.tier = tier.id;
			}
			const job = await provider.submit({ mode: 'reconstruct', params });
			return {
				content: [
					{
						type: 'text',
						text:
							`Started generating a 3D model for "${args.prompt}" (${tier.id} tier).\n` +
							`Reference image: ${imageUrl}\n` +
							`Job ID: ${job.extJobId}\n${POLL_HINT}`,
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					prompt: args.prompt,
					path,
					tier: tier.id,
					backend: backendId,
					preview_image_url: imageUrl,
					text_to_image_model: model,
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'image_to_3d',
		title: 'Reconstruct a 3D model from one or more images',
		description:
			'Reconstruct a textured 3D model (GLB) from a reference image using Microsoft TRELLIS. Pass a single image_url, or image_urls (2–4 views of the SAME object from different angles — front/back/left/right) for multi-view reconstruction, which removes the back-of-object hallucination of single-image reconstruction. Returns a job_id to poll with generation_status, plus how many views were fused and which backend handled it. The cleaner the inputs — one subject, plain background, even lighting — the better the mesh.',
		inputSchema: {
			type: 'object',
			properties: {
				image_url: {
					type: 'string',
					format: 'uri',
					description:
						'Public https URL of the reference image (PNG/JPG/WebP). Use image_urls for multi-view.',
				},
				image_urls: {
					type: 'array',
					items: { type: 'string', format: 'uri' },
					minItems: 1,
					maxItems: 4,
					description:
						'1–4 public https URLs of the same object from different angles. Takes precedence over image_url; >1 enables multi-view reconstruction.',
				},
				prompt: {
					type: 'string',
					maxLength: 1000,
					description: 'Optional text hint passed to the reconstruction model.',
				},
				tier: TIER_PROP,
				path: PATH_PROP,
				backend: BACKEND_PROP,
			},
			additionalProperties: false,
		},
		async handler(args, auth, req) {
			await enforce(limits.mcp3dGenerate, auth);

			// Merge the multi-view array form with the single image_url, de-duped
			// and order-preserving. image_urls wins when both are present.
			const rawViews = Array.isArray(args.image_urls)
				? args.image_urls
				: typeof args.image_url === 'string'
					? [args.image_url]
					: [];
			const seen = new Set();
			const views = [];
			for (const v of rawViews) {
				if (typeof v !== 'string') continue;
				const t = v.trim();
				if (!t || seen.has(t)) continue;
				seen.add(t);
				views.push(t);
			}
			if (views.length === 0) {
				return {
					content: [
						{ type: 'text', text: 'Error: provide image_url or image_urls (1–4).' },
					],
					isError: true,
				};
			}
			if (views.length > 4) {
				return {
					content: [{ type: 'text', text: 'Error: provide between 1 and 4 images.' }],
					isError: true,
				};
			}
			for (const v of views) {
				if (!(await isPublicHttpsUrl(v))) {
					return {
						content: [
							{
								type: 'text',
								text: 'Error: every image URL must be a public https URL.',
							},
						],
						isError: true,
					};
				}
			}

			const path = parsePathArg(args);
			const tier = resolveTier(parseTierArg(args));
			const backendId = resolveBackendId({ path, backend: args.backend });

			// Geometry-first path (Meshy/Tripo, BYOK) reconstructs from the primary
			// view; multi-view fusion stays on the image/TRELLIS path below.
			if (path === 'geometry') {
				return submitGeometryJob({
					req,
					args,
					backendId,
					isImageMode: true,
					prompt: args.prompt,
					primaryImage: views[0],
					tier,
					path,
				});
			}

			const provider = regenProvider();
			const reconstructParams = { images: views, prompt: args.prompt };
			if (BACKENDS[backendId].polyControl) {
				reconstructParams.target_polycount = tier.polycount;
				reconstructParams.tier = tier.id;
			}
			const job = await provider.submit({
				mode: 'reconstruct',
				sourceUrl: views[0],
				params: reconstructParams,
			});
			const viewsUsed = typeof job.viewsUsed === 'number' ? job.viewsUsed : views.length;
			const multiview = Boolean(job.multiview);
			const summary =
				views.length > 1
					? `Started multi-view reconstruction from ${views.length} views (${viewsUsed} fused${multiview ? '' : ', single-view fallback'}).`
					: 'Started reconstructing a 3D model from the image.';
			return {
				content: [
					{
						type: 'text',
						text: `${summary}\nJob ID: ${job.extJobId}\n${POLL_HINT}`,
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_image_url: views[0],
					source_image_urls: views,
					views_requested: views.length,
					views_used: viewsUsed,
					multiview,
					path,
					tier: tier.id,
					backend: job.backend ?? backendId ?? null,
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'generation_status',
		title: 'Check a 3D generation job',
		description:
			'Poll a text_to_3d or image_to_3d job by its job_id. While running it reports the status; when finished it returns the GLB download URL and an inline <model-viewer> artifact — display that text/html resource as an interactive 3D artifact.',
		inputSchema: {
			type: 'object',
			properties: {
				job_id: {
					type: 'string',
					minLength: 1,
					maxLength: 200,
					description: 'The job_id returned by text_to_3d or image_to_3d.',
				},
			},
			required: ['job_id'],
			additionalProperties: false,
		},
		async handler(args, auth, req) {
			await enforce(limits.mcp3dStatus, auth);
			const result = await pollAnyProvider(req, args.job_id);

			if (result.status === 'done' && result.resultGlbUrl) {
				const glbUrl = result.resultGlbUrl;
				// A segmentation job carries a parts manifest — surface the named,
				// addressable parts (and where to inspect them) alongside the GLB.
				if (Array.isArray(result.parts) && result.parts.length) {
					const partLines = result.parts
						.map((p) => `  • ${p.id} — ${p.name} (${p.face_count} faces, ${p.color})`)
						.join('\n');
					return {
						content: [
							{
								type: 'text',
								text:
									`Segmented into ${result.partCount || result.parts.length} parts.\n` +
									`Segmented GLB (each part is a named node): ${glbUrl}\n` +
									(result.manifestUrl
										? `Parts manifest: ${result.manifestUrl}\n`
										: '') +
									`Parts:\n${partLines}\n` +
									'Display the attached text/html resource as an inline 3D artifact.',
							},
							viewerArtifact({ glbUrl, name: 'Segmented 3D model' }),
						],
						structuredContent: {
							job_id: args.job_id,
							status: 'done',
							glb_url: glbUrl,
							manifest_url: result.manifestUrl || null,
							part_count: result.partCount || result.parts.length,
							parts: result.parts,
							source_faces: result.sourceFaces ?? null,
							method: result.segmentMethod || null,
						},
					};
				}
				return {
					content: [
						{
							type: 'text',
							text:
								`Your 3D model is ready.\nGLB: ${glbUrl}\n` +
								'Display the attached text/html resource as an inline 3D artifact.',
						},
						viewerArtifact({ glbUrl, name: '3D model' }),
					],
					structuredContent: { job_id: args.job_id, status: 'done', glb_url: glbUrl },
				};
			}

			if (result.status === 'failed') {
				return {
					content: [
						{
							type: 'text',
							text: `Generation failed: ${result.error || 'unknown error'}`,
						},
					],
					structuredContent: {
						job_id: args.job_id,
						status: 'failed',
						error: result.error || null,
					},
					isError: true,
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: `Still ${result.status}. ${POLL_HINT}`,
					},
				],
				structuredContent: { job_id: args.job_id, status: result.status },
			};
		},
	},
	{
		name: 'preview_3d',
		title: 'Preview any GLB as an interactive 3D artifact',
		description:
			'Render any public GLB URL as an inline <model-viewer> HTML artifact — orbit controls, AR on mobile, auto-rotate. Display the returned text/html resource as an inline 3D artifact. Use it to view a generated model, or any GLB on the web.',
		inputSchema: {
			type: 'object',
			properties: {
				glb_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of a .glb file.',
				},
				auto_rotate: { type: 'boolean', default: true },
				ar: { type: 'boolean', default: true },
				background: {
					type: 'string',
					default: 'transparent',
					description: 'CSS background color or gradient.',
				},
				height: { type: 'string', default: '480px' },
				width: { type: 'string', default: '100%' },
				camera_orbit: {
					type: 'string',
					description: 'model-viewer camera-orbit value, e.g. "0deg 80deg 2m".',
				},
			},
			required: ['glb_url'],
			additionalProperties: false,
		},
		async handler(args) {
			if (!(await isPublicHttpsUrl(args.glb_url))) {
				return {
					content: [{ type: 'text', text: 'Error: glb_url must be a public https URL.' }],
					isError: true,
				};
			}
			return {
				content: [
					{
						type: 'text',
						text: 'Display the attached text/html resource as an inline 3D artifact.',
					},
					viewerArtifact({ glbUrl: args.glb_url, name: '3D model', options: args }),
				],
				structuredContent: { glb_url: args.glb_url },
			};
		},
	},
	{
		name: 'remove_background',
		title: 'Remove the background from an image',
		description:
			'Strip the background from a photo or illustration using BRIA RMBG-2.0 (Apache-2.0). Returns a PNG with a transparent background — useful for preparing clean inputs before image_to_3d reconstruction.',
		inputSchema: {
			type: 'object',
			properties: {
				image_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the source image (PNG/JPG/WebP).',
				},
				model: {
					type: 'string',
					enum: ['rmbg2', 'u2net', 'isnet', 'u2net_human_seg', 'silueta'],
					default: 'rmbg2',
					description:
						'Background removal model. rmbg2 is highest quality; u2net_human_seg is optimised for people.',
				},
			},
			required: ['image_url'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.image_url))) {
				return {
					content: [
						{ type: 'text', text: 'Error: image_url must be a public https URL.' },
					],
					isError: true,
				};
			}
			const provider = regenProvider('rembg');
			const job = await provider.submit({
				mode: 'rembg',
				sourceUrl: args.image_url,
				params: { model: args.model || 'rmbg2' },
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Background removal started.\nJob ID: ${job.extJobId}\n` +
							'Poll with generation_status. Typically completes in 3–10 seconds.',
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_image_url: args.image_url,
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'remesh_model',
		title: 'Remesh, simplify, repair, or convert a 3D model',
		description:
			'Process an existing GLB/OBJ/STL/PLY mesh: fix holes and degenerate geometry, reduce face count via quadric decimation, or convert to a different format (including FBX with skeleton for Unity/Unreal — a convert of a rigged GLB keeps its bones, skin weights, and blendshapes). Returns a clean GLB (or the requested format) job_id to poll with generation_status.',
		inputSchema: {
			type: 'object',
			properties: {
				mesh_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the source mesh (GLB/OBJ/FBX/STL/PLY).',
				},
				operation: {
					type: 'string',
					enum: ['full', 'simplify', 'repair', 'convert'],
					default: 'full',
					description:
						'full = repair + simplify; simplify = face reduction only; repair = hole-fill + normal fix; convert = format change only.',
				},
				target_faces: {
					type: 'integer',
					minimum: 1000,
					maximum: 500000,
					default: 50000,
					description: 'Target polygon count for simplification.',
				},
				output_format: {
					type: 'string',
					enum: ['glb', 'obj', 'stl', 'ply', 'usdz', '3mf', 'fbx'],
					default: 'glb',
					description:
						"Target format. fbx + operation=convert preserves a rigged GLB's skeleton, skin weights, and blendshapes (for Unity/Unreal); other operations produce a static fbx.",
				},
			},
			required: ['mesh_url'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.mesh_url))) {
				return {
					content: [
						{ type: 'text', text: 'Error: mesh_url must be a public https URL.' },
					],
					isError: true,
				};
			}
			const provider = regenProvider('remesh');
			const job = await provider.submit({
				mode: 'remesh',
				sourceUrl: args.mesh_url,
				params: {
					operation: args.operation || 'full',
					target_faces: args.target_faces || 50_000,
					output_format: args.output_format || 'glb',
				},
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Mesh processing started (${args.operation || 'full'}).\nJob ID: ${job.extJobId}\n` +
							'Poll with generation_status. Typically completes in 10–60 seconds.',
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_mesh_url: args.mesh_url,
					operation: args.operation || 'full',
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'stylize_model',
		title: 'Apply a one-click geometric stylization filter to a 3D model',
		description:
			'Transform any GLB/OBJ/STL/PLY mesh into a stylized variant with a single geometry pass — ' +
			'no model inference, fast and cheap. Styles: "voxel" (blocky cubes on a grid), "brick" ' +
			'(voxels + studs, LEGO-like), "voronoi" (open strut-and-node lattice shell), "lowpoly" ' +
			'(decimated + hard flat-shaded facets). Source color is preserved where the style allows. ' +
			'Returns a job_id to poll with generation_status; typically completes in 10–40 seconds.',
		inputSchema: {
			type: 'object',
			properties: {
				mesh_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the source mesh (GLB/OBJ/FBX/STL/PLY).',
				},
				style: {
					type: 'string',
					enum: ['voxel', 'brick', 'voronoi', 'lowpoly'],
					default: 'voxel',
					description:
						'voxel = blocky cubes; brick = voxels + studs (LEGO-like); voronoi = open lattice shell; lowpoly = faceted flat-shaded.',
				},
				resolution: {
					type: 'integer',
					minimum: 8,
					maximum: 120,
					description:
						'Style-specific density (clamped per style): voxel/brick = grid resolution, voronoi = cell density, lowpoly = detail level. Omit for a sensible per-style default.',
				},
				output_format: {
					type: 'string',
					enum: ['glb', 'obj', 'stl', 'ply'],
					default: 'glb',
				},
			},
			required: ['mesh_url'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.mesh_url))) {
				return {
					content: [
						{ type: 'text', text: 'Error: mesh_url must be a public https URL.' },
					],
					isError: true,
				};
			}
			const provider = regenProvider('stylize');
			const style = args.style || 'voxel';
			const job = await provider.submit({
				mode: 'stylize',
				sourceUrl: args.mesh_url,
				params: {
					style,
					resolution: Number.isInteger(args.resolution) ? args.resolution : null,
					output_format: args.output_format || 'glb',
				},
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Stylization started (${style}).\nJob ID: ${job.extJobId}\n` +
							'Poll with generation_status. Typically completes in 10–40 seconds.',
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_mesh_url: args.mesh_url,
					style,
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'segment_model',
		title: 'Split a 3D model into named, separable parts',
		description:
			'Segment a GLB/OBJ/STL/PLY mesh into meaningful parts with clean boundaries — head/torso/limbs on a character, body/wheels on a vehicle. Splits at physically disconnected shells and at concave creases (the minima rule), then names each part by region and tints it a distinct colour. Returns a GLB whose nodes ARE the parts (so each can be hidden, recoloured, replaced, or exported on its own) plus a parts manifest. Poll with generation_status; the result lists every part with its id, name, face count, and colour. Pass only_part to export a single part on its own.',
		inputSchema: {
			type: 'object',
			properties: {
				mesh_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the source mesh (GLB/OBJ/FBX/STL/PLY).',
				},
				method: {
					type: 'string',
					enum: ['auto', 'connected', 'crease'],
					default: 'auto',
					description:
						'auto = disconnected shells + concave-crease splitting inside each shell (best); connected = split only at disconnected shells; crease = minima-rule crease splitting over the whole mesh.',
				},
				max_parts: {
					type: 'integer',
					minimum: 2,
					maximum: 64,
					default: 24,
					description:
						'Upper bound on parts. Smaller fragments are merged into neighbours until the count fits.',
				},
				min_part_faces: {
					type: 'integer',
					minimum: 4,
					maximum: 100000,
					default: 64,
					description:
						'Parts smaller than this many faces are merged into their largest neighbour.',
				},
				crease_angle: {
					type: 'number',
					minimum: 5,
					maximum: 170,
					default: 40,
					description:
						'Dihedral angle (degrees) above which a concave edge is treated as a part boundary. Lower = more parts.',
				},
				only_part: {
					type: 'string',
					maxLength: 64,
					description:
						'Optional: export just this part by id ("part_03") or name ("upper-left"). Run once without it to discover part ids.',
				},
			},
			required: ['mesh_url'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.mesh_url))) {
				return {
					content: [
						{ type: 'text', text: 'Error: mesh_url must be a public https URL.' },
					],
					isError: true,
				};
			}
			const provider = regenProvider('segment');
			const job = await provider.submit({
				mode: 'segment',
				sourceUrl: args.mesh_url,
				params: {
					method: args.method || 'auto',
					max_parts: args.max_parts || 24,
					min_part_faces: args.min_part_faces || 64,
					crease_angle: args.crease_angle ?? 40,
					only_part: args.only_part,
				},
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Segmentation started (${args.method || 'auto'}).\nJob ID: ${job.extJobId}\n` +
							'Poll with generation_status — when done it lists every named part. Typically completes in 10–60 seconds.',
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_mesh_url: args.mesh_url,
					method: args.method || 'auto',
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'retexture_model',
		title: 'Paint a new texture onto a 3D model from a text prompt',
		description:
			'Generate a fresh texture for an untextured or poorly-textured GLB using SDXL + ControlNet depth. Renders the mesh from 8 viewpoints, generates coherent texture views guided by your prompt, and back-projects them onto the UV atlas. Returns a job_id to poll with generation_status.',
		inputSchema: {
			type: 'object',
			properties: {
				mesh_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the source GLB mesh.',
				},
				prompt: {
					type: 'string',
					minLength: 3,
					maxLength: 500,
					description:
						'Texture description, e.g. "worn leather armour, dark brown, scratched metal buckles".',
				},
				negative_prompt: {
					type: 'string',
					maxLength: 200,
					default: 'blurry, low quality, distorted, watermark',
				},
				num_views: {
					type: 'integer',
					enum: [4, 8],
					default: 8,
					description: '4 = faster; 8 = better coverage.',
				},
				texture_size: {
					type: 'integer',
					enum: [512, 1024, 2048],
					default: 1024,
				},
			},
			required: ['mesh_url', 'prompt'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.mesh_url))) {
				return {
					content: [
						{ type: 'text', text: 'Error: mesh_url must be a public https URL.' },
					],
					isError: true,
				};
			}
			const provider = regenProvider('retex');
			const job = await provider.submit({
				mode: 'retex',
				sourceUrl: args.mesh_url,
				params: {
					prompt: args.prompt,
					negative_prompt: args.negative_prompt,
					num_views: args.num_views || 8,
					texture_size: args.texture_size || 1024,
				},
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Texture generation started for "${args.prompt}".\nJob ID: ${job.extJobId}\n` +
							'Poll with generation_status. Typically completes in 2–5 minutes.',
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_mesh_url: args.mesh_url,
					prompt: args.prompt,
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'retexture_region',
		title: "Repaint one masked region of a model's texture (magic brush)",
		description:
			'Surgically repaint ONLY a region of an existing texture from a prompt and/or colour, ' +
			'leaving the rest of the surface untouched and feathering the seam so the edit is invisible. ' +
			'Real SDXL inpainting in UV space — fix a seam, recolour one panel, add a logo to a chest plate. ' +
			"Supply mask_url: a UV-space mask PNG in the model's own UV layout where WHITE marks the area to " +
			'repaint and black is preserved. Safe to run repeatedly — chain passes by feeding the previous ' +
			'result GLB back in as mesh_url. Returns a job_id to poll with generation_status.',
		inputSchema: {
			type: 'object',
			properties: {
				mesh_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the textured GLB to edit.',
				},
				mask_url: {
					type: 'string',
					format: 'uri',
					description:
						'Public https URL of the UV-space mask PNG (white = repaint, black = keep), ' +
						'in the same UV layout as the mesh.',
				},
				prompt: {
					type: 'string',
					maxLength: 500,
					description:
						'What to paint into the masked region, e.g. "weathered copper plate".',
				},
				color: {
					type: 'string',
					pattern: '^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$',
					description: 'Optional target colour as a hex value, e.g. "#1e90ff".',
				},
				negative_prompt: {
					type: 'string',
					maxLength: 300,
					default: 'blurry, low quality, distorted, watermark, seam',
				},
				texture_size: {
					type: 'integer',
					enum: [512, 1024, 2048],
					default: 1024,
				},
				strength: {
					type: 'number',
					minimum: 0.2,
					maximum: 1,
					default: 0.85,
					description:
						'How aggressively to regenerate the region (higher = more change).',
				},
				feather: {
					type: 'integer',
					minimum: 1,
					maximum: 128,
					default: 24,
					description: 'Seam feather radius in atlas pixels — larger blends softer.',
				},
			},
			required: ['mesh_url', 'mask_url'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.mesh_url))) {
				return {
					content: [
						{ type: 'text', text: 'Error: mesh_url must be a public https URL.' },
					],
					isError: true,
				};
			}
			if (!(await isPublicHttpsUrl(args.mask_url))) {
				return {
					content: [
						{ type: 'text', text: 'Error: mask_url must be a public https URL.' },
					],
					isError: true,
				};
			}
			if (!args.prompt && !args.color) {
				return {
					content: [
						{
							type: 'text',
							text: 'Error: provide a prompt and/or a color for the region.',
						},
					],
					isError: true,
				};
			}
			const provider = regionProvider();
			const job = await provider.submit({
				mode: 'retex_region',
				sourceUrl: args.mesh_url,
				params: {
					prompt: args.prompt || '',
					negative_prompt: args.negative_prompt,
					mask: args.mask_url,
					color: args.color || null,
					texture_size: args.texture_size || 1024,
					strength: args.strength ?? 0.85,
					feather: args.feather ?? 24,
				},
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Region retexture started${args.prompt ? ` for "${args.prompt}"` : ''}.\n` +
							`Job ID: ${job.extJobId}\n` +
							'Poll with generation_status. Typically completes in 30–90 seconds. ' +
							'To stack edits, feed the resulting GLB back in as mesh_url.',
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_mesh_url: args.mesh_url,
					mask_url: args.mask_url,
					prompt: args.prompt || null,
					color: args.color || null,
					eta_seconds: job.eta,
				},
			};
		},
	},
	{
		name: 'auto_rig_model',
		title: 'Auto-rig a static 3D model (skeleton + skin weights)',
		description:
			'Turn a static GLB mesh into an animation-ready character: adds a humanoid skeleton and per-vertex skin weights via the three.ws rig pipeline (VAST-AI UniRig). Pairs with text_to_3d / image_to_3d — generate a mesh, then rig it, then drive it with apply_animation or pose_model. Returns a job_id; poll generation_status for the rigged GLB.',
		inputSchema: {
			type: 'object',
			properties: {
				glb_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the static GLB mesh to rig.',
				},
			},
			required: ['glb_url'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			if (!(await isPublicHttpsUrl(args.glb_url))) {
				return {
					content: [{ type: 'text', text: 'Error: glb_url must be a public https URL.' }],
					isError: true,
				};
			}
			const provider = regenProvider('rerig');
			if (!provider.supportsMode('rerig')) {
				return {
					content: [
						{
							type: 'text',
							text: 'Auto-rigging is not configured on this deployment.',
						},
					],
					isError: true,
				};
			}
			const job = await provider.submit({
				mode: 'rerig',
				sourceUrl: args.glb_url,
				params: {},
			});
			return {
				content: [
					{
						type: 'text',
						text:
							`Auto-rigging started.\nJob ID: ${job.extJobId}\n` +
							'Poll with generation_status — when done it returns a rigged, animation-ready GLB. Typically completes in 30–90 seconds.',
					},
				],
				structuredContent: {
					job_id: job.extJobId,
					status: 'queued',
					source_glb_url: args.glb_url,
					eta_seconds: typeof job.eta === 'number' ? job.eta : null,
				},
			};
		},
	},
	{
		name: 'pose_model',
		title: 'Resolve a text prompt to a pose-studio seed + joint rotations',
		description:
			'Map a natural-language pose description to a deterministic pose-studio seed and the full Euler joint-rotation map for the three.ws humanoid mannequin, picked from the in-repo preset library. Returns the preset id, the complete pose (radians per joint), a stable seed, and a previewUrl on three.ws/pose. Deterministic and free — the same prompt always yields the same pose. Pair with auto_rig_model to pose a rigged character.',
		inputSchema: {
			type: 'object',
			properties: {
				prompt: {
					type: 'string',
					minLength: 1,
					maxLength: 500,
					description:
						'Pose description, e.g. "warrior stance", "wave hello", "sitting cross-legged".',
				},
			},
			required: ['prompt'],
			additionalProperties: false,
		},
		async handler(args) {
			const picked = pickPosePreset(args.prompt);
			const preset = picked.entry.preset;
			const seed = createHash('sha256')
				.update(`${args.prompt}|${preset.id}`)
				.digest('hex')
				.slice(0, 16);
			const previewUrl = `${POSE_PREVIEW_BASE}?seed=${encodeURIComponent(seed)}&preset=${encodeURIComponent(preset.id)}`;
			return {
				content: [
					{
						type: 'text',
						text: `Pose "${preset.label}" (${preset.group}) — seed ${seed}.\nPreview: ${previewUrl}`,
					},
				],
				structuredContent: {
					seed,
					preset_id: preset.id,
					preset_label: preset.label,
					group: preset.group,
					parameters: preset.pose,
					preview_url: previewUrl,
					match: { score: picked.score, reason: picked.reason },
					groups: PRESET_GROUPS,
				},
			};
		},
	},
	{
		name: 'direct_prompt',
		title: 'Optimize a rough idea into a 3D-generation prompt (IBM Granite)',
		description:
			'Rewrite a rough idea into an optimized text_to_3d prompt using IBM Granite. Returns one clean single-subject description plus structured directives (subject, style, materials, colors, detail) that produce cleaner meshes. Run before text_to_3d when a prompt is vague, conflicting, or multi-subject. Requires IBM watsonx.ai credentials on the server.',
		inputSchema: {
			type: 'object',
			properties: {
				idea: {
					type: 'string',
					minLength: 1,
					maxLength: 2000,
					description:
						'The rough idea or prompt to optimize, e.g. "some kind of cool dragon thing".',
				},
				style: {
					type: 'string',
					maxLength: 200,
					description:
						'Optional style hint, e.g. "low-poly", "realistic", "stylized PBR".',
				},
			},
			required: ['idea'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			const cfg = graniteConfigOrThrow();
			const system =
				'You are a 3D-generation prompt director. Given a rough idea, produce a prompt that yields a single, clearly-described object for image-to-3D reconstruction. Return ONLY valid JSON with keys: "prompt" (one concise sentence describing ONE subject), "subject", "style", "materials" (array), "colors" (array), "detail" (one of draft|standard|high), "notes". No markdown, no prose outside the JSON.';
			const user = args.style ? `${args.idea}\n\nPreferred style: ${args.style}` : args.idea;
			const result = await watsonxChatComplete(cfg, {
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
				maxTokens: 700,
				temperature: 0.3,
			});
			let parsed = null;
			try {
				parsed = JSON.parse(stripJsonFence(result.text));
			} catch {
				// Granite didn't return clean JSON — surface the raw text below.
			}
			if (!parsed || typeof parsed.prompt !== 'string') {
				return {
					content: [{ type: 'text', text: result.text }],
					structuredContent: {
						ok: true,
						optimized_prompt: null,
						raw_response: result.text,
						model: result.model,
					},
				};
			}
			return {
				content: [{ type: 'text', text: `Optimized prompt: ${parsed.prompt}` }],
				structuredContent: {
					ok: true,
					optimized_prompt: parsed.prompt,
					spec: parsed,
					model: result.model,
					usage: result.usage,
				},
			};
		},
	},
	{
		name: 'generate_material',
		title: 'Generate a glTF PBR material from a description (IBM Granite)',
		description:
			'Generate a physically-based (PBR) glTF 2.0 material from a text description using IBM Granite — base color, metallic, roughness, and emissive factors. Returns a pbrMetallicRoughness material object you can attach to a generated mesh. Requires IBM watsonx.ai credentials on the server.',
		inputSchema: {
			type: 'object',
			properties: {
				description: {
					type: 'string',
					minLength: 3,
					maxLength: 500,
					description:
						'Material to describe, e.g. "worn copper, scratched, slightly oxidized".',
				},
				name: {
					type: 'string',
					maxLength: 100,
					description: 'Optional material name.',
				},
			},
			required: ['description'],
			additionalProperties: false,
		},
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);
			const cfg = graniteConfigOrThrow();
			const system =
				'You are a 3D material author. Given a description, return ONLY a valid glTF 2.0 material JSON object with keys: "name", "pbrMetallicRoughness" { "baseColorFactor": [r,g,b,a] (0-1), "metallicFactor" (0-1), "roughnessFactor" (0-1) }, "emissiveFactor": [r,g,b] (0-1), "doubleSided" (bool), and a "_notes" string. No markdown, no prose outside the JSON.';
			const user = args.name
				? `Name: ${args.name}\nMaterial: ${args.description}`
				: args.description;
			const result = await watsonxChatComplete(cfg, {
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
				maxTokens: 600,
				temperature: 0.2,
			});
			let material = null;
			try {
				material = JSON.parse(stripJsonFence(result.text));
			} catch {
				// Fall through to raw text when Granite returns non-JSON.
			}
			if (!material || typeof material !== 'object') {
				return {
					content: [{ type: 'text', text: result.text }],
					structuredContent: {
						ok: true,
						material: null,
						raw_response: result.text,
						model: result.model,
					},
				};
			}
			if (args.name && !material.name) material.name = args.name;
			return {
				content: [
					{
						type: 'text',
						text: `Generated glTF material${material.name ? ` "${material.name}"` : ''}.`,
					},
				],
				structuredContent: { ok: true, material, model: result.model, usage: result.usage },
			};
		},
	},
	{
		name: 'save_avatar',
		title: 'Save a generated GLB as a durable, named avatar',
		description:
			'Persist a generated GLB (e.g. the glb_url returned by generation_status) as a durable avatar in your three.ws library. The mesh is copied into our own storage so it survives the provider URL expiring, then registered as a named avatar you own. Returns avatar_id, slug, model_url, and a view_url. This is the bridge from the studio to the avatar system: after saving, get_avatar, render_avatar_image, embeds, and on-chain identity all work on the result. Requires you to be signed in.',
		inputSchema: {
			type: 'object',
			properties: {
				glb_url: {
					type: 'string',
					format: 'uri',
					description: 'Public https URL of the GLB to save (e.g. from generation_status).',
				},
				name: {
					type: 'string',
					minLength: 1,
					maxLength: 80,
					description: 'A name for the avatar, 1–80 characters.',
				},
				visibility: {
					type: 'string',
					enum: ['public', 'unlisted', 'private'],
					default: 'unlisted',
					description:
						'public = listed in the gallery; unlisted = anyone with the link; private = only you.',
				},
				source_prompt: {
					type: 'string',
					maxLength: 1000,
					description: 'Optional: the prompt that generated this model, kept as provenance.',
				},
				tags: {
					type: 'array',
					items: { type: 'string', minLength: 1, maxLength: 40 },
					maxItems: 20,
					description: 'Optional tags for organizing and searching your library.',
				},
			},
			required: ['glb_url', 'name'],
			additionalProperties: false,
		},
		scope: 'avatars:write',
		async handler(args, auth) {
			await enforce(limits.mcp3dGenerate, auth);

			if (!auth.userId) {
				return {
					content: [
						{
							type: 'text',
							text:
								'Sign in to save an avatar. Saving writes to your three.ws library, ' +
								'so it needs a signed-in account (an OAuth bearer token), not an ' +
								'anonymous pay-per-call session.',
						},
					],
					structuredContent: { status: 'sign_in_required' },
					isError: true,
				};
			}

			if (!(await isPublicHttpsUrl(args.glb_url))) {
				return {
					content: [{ type: 'text', text: 'Error: glb_url must be a public https URL.' }],
					isError: true,
				};
			}

			const buf = await fetchGlbBuffer(args.glb_url);
			const info = isValidGlbHeader(buf) ? inspectGlb(buf) : null;
			if (!info) {
				return {
					content: [
						{
							type: 'text',
							text: 'Error: that URL did not return a valid GLB (binary glTF). Pass a .glb model URL.',
						},
					],
					isError: true,
				};
			}

			const visibility = ['public', 'unlisted', 'private'].includes(args.visibility)
				? args.visibility
				: 'unlisted';
			const name = String(args.name).trim().slice(0, 80);
			const slug = `studio-${createHash('sha256')
				.update(`${auth.userId}|${name}|${args.glb_url}`)
				.digest('hex')
				.slice(0, 8)}`;
			const storageKey = storageKeyFor({ userId: auth.userId, slug });

			await putObject({
				key: storageKey,
				body: buf,
				contentType: 'model/gltf-binary',
				metadata: { source: 'studio', user_id: auth.userId },
			});

			const tags = Array.isArray(args.tags)
				? args.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
				: [];

			const avatar = await createAvatar({
				userId: auth.userId,
				storageKey,
				input: {
					slug,
					name,
					description: null,
					size_bytes: buf.length,
					content_type: 'model/gltf-binary',
					source: 'studio',
					source_meta: {
						source_glb_url: args.glb_url,
						source_prompt: args.source_prompt ?? null,
						is_rigged: info.isRigged ?? null,
						mesh_count: info.meshCount ?? null,
						animation_count: info.animationCount ?? null,
					},
					visibility,
					tags,
					checksum_sha256: null,
					parent_avatar_id: null,
				},
			});

			const viewUrl = `${env.APP_ORIGIN}/discover/avatar/${avatar.id}`;
			return {
				content: [
					{
						type: 'text',
						text:
							`Saved "${avatar.name}" to your library (${visibility}).\n` +
							`Avatar ID: ${avatar.id}\nView: ${viewUrl}\n` +
							'Render it with render_avatar_image, or fetch it with get_avatar.',
					},
				],
				structuredContent: {
					avatar_id: avatar.id,
					slug: avatar.slug,
					model_url: avatar.model_url,
					view_url: viewUrl,
					visibility,
				},
			};
		},
	},
];
