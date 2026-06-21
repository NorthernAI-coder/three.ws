// `forge_avatar` — paid MCP tool: text/image → rigged, ANIMATION-READY avatar.
//
// Pricing: $0.45 USDC, settled `exact` on Solana. That is the sum of the two
// production ops it bundles — generation (mesh_forge, $0.25) + auto-rig
// (rig_mesh, $0.20) — with no hidden margin. One call does what previously took
// two: prompt → textured GLB → humanoid skeleton + skin weights → a model that
// drops straight into the three.ws pose studio and drives the canonical
// idle/walk clip library.
//
// Like mesh_forge / rig_mesh, this is a thin x402-gated client over the three.ws
// prod pipeline (/api/forge). It holds NO generation or rigging credentials; the
// USDC payment gates the call and all GPU work runs on prod.
//
// Money safety (real users, real funds):
//   • A humanoid gate runs BEFORE any paid work. Rigging assumes a humanoid
//     skeleton, so a confidently non-humanoid prompt (furniture, a vehicle, a
//     quadruped) returns a toolError — which the x402 wrapper treats as a
//     failure and CANCELS the payment. The caller is not charged and is pointed
//     at mesh_forge / forge_free for non-characters. Pass allow_non_humanoid to
//     override the gate deliberately.
//   • Every downstream failure (generation error/timeout, rig error/timeout)
//     also returns a toolError, so a caller is NEVER charged for a bundle that
//     did not produce a rigged avatar. When generation succeeded but rigging
//     failed, the generated (unrigged) mesh URL is returned in the error payload
//     so the work is not lost — the caller keeps the mesh and can retry rig_mesh.
//
// Environment (all optional — sensible prod defaults):
//   MESH_FORGE_API_BASE       — three.ws origin. Default https://three.ws
//   FORGE_AVATAR_DIRECTOR     — "0" to skip the Granite prompt-director stage.
//   FORGE_AVATAR_GEN_TIMEOUT_MS — generation poll budget. Default 180000.
//   FORGE_AVATAR_RIG_TIMEOUT_MS — rig poll budget. Default 180000.
//   FORGE_AVATAR_POLL_MS      — poll interval for both stages. Default 3000.

import { z } from 'zod';

import { paid, toolError } from '../payments.js';
import { jsonSchemaFromZod } from './_shared.js';
import { classifyHumanoidPrompt } from './_humanoid.js';

const TOOL_NAME = 'forge_avatar';
const TOOL_DESCRIPTION =
	'Generate a rigged, ANIMATION-READY 3D avatar from a single text prompt or reference image(s) — in ONE call. ' +
	'Chains the full three.ws pipeline: an IBM Granite prompt director optimizes the prompt, FLUX + TRELLIS/Hunyuan3D ' +
	'reconstruct a textured GLB, then the auto-rigger (VAST-AI UniRig) adds a humanoid skeleton and skin weights so the ' +
	'model loads straight into the three.ws pose studio and plays the canonical idle/walk animation library. ' +
	'Accepts a text prompt, a single image_url, or 1–4 image_urls (front/back/left/right) for higher-fidelity multi-view ' +
	'reconstruction. A humanoid gate runs first: a clearly non-humanoid subject (furniture, vehicle, quadruped) is ' +
	'rejected WITHOUT charge (use mesh_forge or forge_free for those) unless allow_non_humanoid is set. Returns the rigged ' +
	'GLB URL, the intermediate mesh URL, a pose-studio link, the directed prompt, and per-stage timing. Paid: $0.45 USDC ' +
	'(generation + rig bundled; you are not charged if no rigged avatar is produced).';

const VALID_ASPECT = new Set(['1:1', '4:3', '3:4', '16:9', '9:16']);

function env(k, def) {
	const v = process.env[k];
	return v && String(v).trim() ? String(v).trim() : def;
}

function apiBase() {
	return env('MESH_FORGE_API_BASE', 'https://three.ws').replace(/\/$/, '');
}

// Granite art-director instruction — same lever mesh_forge uses, tuned for
// characters: a single isolated full-body figure in a neutral A/T-ish pose so
// the rigger gets clean, separable limbs.
const DIRECTOR_INSTRUCTION =
	'You are a 3D character art director. Rewrite the user\'s idea into ONE concise prompt for a text-to-3D ' +
	'generator that will be auto-rigged. Describe a SINGLE full-body humanoid character standing in a neutral ' +
	'pose with arms slightly away from the body, on a plain background. Name the body type, outfit, materials, ' +
	'colors, and key features. No scene, no props held across the body, no multiple characters, no text or logos. ' +
	'Output ONLY the rewritten prompt as a single line — no preamble, no quotes.';

// Drive /api/chat (provider=watsonx, IBM Granite) to refine the prompt. Returns
// the refined string, or null on any failure (fail-soft — the original prompt is
// used unchanged and `directed:false` is reported, never fabricated).
async function directPrompt(rawPrompt) {
	const base = apiBase();
	let res;
	try {
		res = await fetch(`${base}/api/chat`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
			body: JSON.stringify({
				provider: 'watsonx',
				message: `${DIRECTOR_INSTRUCTION}\n\nIdea: ${rawPrompt}`,
			}),
			signal: AbortSignal.timeout(30_000),
		});
	} catch {
		return null;
	}
	if (!res.ok || !res.body) return null;

	let acc = '';
	try {
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buf = '';
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buf += decoder.decode(value, { stream: true });
			const lines = buf.split('\n');
			buf = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				let evt;
				try {
					evt = JSON.parse(line.slice(6));
				} catch {
					continue;
				}
				if (evt.type === 'chunk' && typeof evt.text === 'string') acc += evt.text;
				else if (evt.type === 'error') return null;
				else if (evt.type === 'done' && typeof evt.text === 'string' && !acc) acc = evt.text;
			}
		}
	} catch {
		return null;
	}

	const refined = acc.trim().replace(/^["']|["']$/g, '').split('\n')[0].trim();
	return refined.length >= 3 && refined.length <= 1000 ? refined : null;
}

async function startForge({ prompt, aspect, imageUrls }) {
	const base = apiBase();
	const payload =
		Array.isArray(imageUrls) && imageUrls.length
			? { image_urls: imageUrls, prompt: prompt || undefined, aspect_ratio: aspect }
			: { prompt, aspect_ratio: aspect };
	const res = await fetch(`${base}/api/forge`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(30_000),
	});
	const data = await res.json().catch(() => ({}));
	if (res.status === 503) {
		const e = new Error(data?.message || 'text-to-3D is not configured on the three.ws deployment');
		e.code = 'not_configured';
		throw e;
	}
	if (res.status === 429) {
		const e = new Error(data?.message || 'the 3D generator is busy; try again shortly');
		e.code = 'rate_limited';
		e.retryAfter = data?.retry_after;
		throw e;
	}
	if (!res.ok || !(data?.job_id || (data?.status === 'done' && data?.glb_url))) {
		const e = new Error(data?.message || `forge returned ${res.status}`);
		e.code = 'provider_error';
		throw e;
	}
	return data;
}

async function startRig(glbUrl) {
	const base = apiBase();
	const res = await fetch(`${base}/api/forge?action=rig`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ glb_url: glbUrl }),
		signal: AbortSignal.timeout(30_000),
	});
	const data = await res.json().catch(() => ({}));
	if (res.status === 503 || res.status === 501) {
		const e = new Error(data?.message || 'auto-rigging is not enabled on the three.ws deployment');
		e.code = 'not_configured';
		throw e;
	}
	if (res.status === 429) {
		const e = new Error(data?.message || 'the rigger is busy; try again shortly');
		e.code = 'rate_limited';
		e.retryAfter = data?.retry_after;
		throw e;
	}
	if (!res.ok || !data?.job_id) {
		const e = new Error(data?.message || `rig start returned ${res.status}`);
		e.code = 'provider_error';
		throw e;
	}
	return data;
}

// Poll /api/forge?job=<id> to a terminal state. Used for both the generation and
// the rig jobs — both report the same { status, glb_url } contract. `failCode`
// distinguishes which stage failed in the surfaced error.
async function pollJob(jobId, { timeoutMs, intervalMs, failCode }) {
	const base = apiBase();
	const deadline = Date.now() + timeoutMs;
	let last = null;
	while (Date.now() < deadline) {
		let res;
		try {
			res = await fetch(`${base}/api/forge?job=${encodeURIComponent(jobId)}`, {
				headers: { accept: 'application/json' },
				signal: AbortSignal.timeout(Math.max(intervalMs * 3, 15_000)),
			});
		} catch (err) {
			if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
				await new Promise((r) => setTimeout(r, intervalMs));
				continue;
			}
			const e = new Error(`poll failed: ${err?.message || err}`);
			e.code = 'provider_error';
			throw e;
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const e = new Error(data?.message || `poll returned ${res.status}`);
			e.code = 'provider_error';
			throw e;
		}
		last = data;
		if (data.status === 'done' && data.glb_url) return data;
		if (data.status === 'failed') {
			const e = new Error(data.error || 'job failed');
			e.code = failCode;
			throw e;
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return { ...(last || {}), _timedOut: true };
}

const inputZodShape = {
	prompt: z
		.string()
		.min(3)
		.max(1000)
		.describe('Text→avatar: natural-language description of a single humanoid character, e.g. "a friendly cartoon astronaut in a glossy white suit". Optional when image_url(s) are provided (then used as guidance + for the humanoid gate).')
		.optional(),
	image_url: z
		.string()
		.url()
		.describe('Image→avatar: an http(s) URL to a reference image of a character to reconstruct and rig. The prompt-director and text-to-image stages are skipped.')
		.optional(),
	image_urls: z
		.array(z.string().url())
		.min(1)
		.max(4)
		.describe('Multi-view → avatar: 1–4 http(s) URLs of the SAME character from different angles (front/back/left/right) for higher-fidelity reconstruction with no hallucinated back. Takes precedence over image_url.')
		.optional(),
	aspect_ratio: z
		.enum(['1:1', '4:3', '3:4', '16:9', '9:16'])
		.describe('Reference image aspect ratio (text mode). Default 3:4 (portrait — best framing for a full-body figure).')
		.optional(),
	direct: z
		.boolean()
		.describe('Run the IBM Granite prompt-director stage to optimize the prompt for a riggable full-body figure (text mode only). Default true.')
		.optional(),
	allow_non_humanoid: z
		.boolean()
		.describe('Bypass the humanoid gate and rig even when the prompt does not look like a character. Off by default — leaving it off means a non-character prompt is rejected WITHOUT charge.')
		.optional(),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);

export async function buildForgeAvatarTool() {
	const handler = await paid(
		{
			toolName: TOOL_NAME,
			description: TOOL_DESCRIPTION,
			scheme: 'exact',
			priceUsd: '$0.45',
			inputSchema: inputJsonSchema,
			example: { prompt: 'a friendly cartoon astronaut in a glossy white suit', aspect_ratio: '3:4' },
			outputExample: {
				ok: true,
				riggedGlbUrl: 'https://three.ws/cdn/creations/def456/rigged.glb',
				meshGlbUrl: 'https://three.ws/cdn/creations/abc123/mesh.glb',
				poseStudioUrl: 'https://three.ws/pose?src=https%3A%2F%2Fthree.ws%2F...',
				prompt: 'a friendly cartoon astronaut in a glossy white suit',
				directedPrompt: 'A single full-body cartoon astronaut in a glossy white space suit...',
				directed: true,
				humanoid: { confidence: 'high', reason: 'humanoid character signals: astronaut' },
				generationMs: 96000,
				rigMs: 48000,
				durationMs: 144000,
			},
		},
		async ({ prompt, image_url, image_urls, aspect_ratio, direct, allow_non_humanoid }) => {
			const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';

			// Merge multi-view + single image_url, de-duped, order-preserving.
			const rawViews = Array.isArray(image_urls)
				? image_urls
				: typeof image_url === 'string'
					? [image_url]
					: [];
			const seenViews = new Set();
			const views = [];
			for (const v of rawViews) {
				if (typeof v !== 'string') continue;
				const t = v.trim();
				if (!t || seenViews.has(t)) continue;
				seenViews.add(t);
				views.push(t);
			}
			if (views.length > 4) {
				return toolError('invalid_input', 'Provide between 1 and 4 reference images.');
			}
			const imageMode = views.length > 0;
			if (!imageMode && trimmedPrompt.length < 3) {
				return toolError(
					'invalid_input',
					'Provide a prompt (3+ chars) for text→avatar, or 1–4 image_urls for image/multi-view→avatar.',
				);
			}

			// --- Humanoid gate (BEFORE any paid work) ---------------------------
			// Classify from the prompt when we have one. In pure image mode with no
			// prompt we cannot classify text, so we trust the caller's intent (they
			// chose an avatar tool) and proceed. A toolError here cancels payment.
			let humanoidInfo = null;
			const classifierInput = trimmedPrompt || '';
			if (classifierInput.length >= 3) {
				const verdict = classifyHumanoidPrompt(classifierInput);
				humanoidInfo = {
					humanoid: verdict.humanoid,
					confidence: verdict.confidence,
					reason: verdict.reason,
				};
				if (!verdict.humanoid && allow_non_humanoid !== true) {
					return toolError(
						'not_a_character',
						`"${trimmedPrompt}" does not look like a humanoid character (${verdict.reason}). ` +
							'Auto-rigging needs a humanoid subject. Use forge_free or mesh_forge to generate a ' +
							'non-character mesh, or set allow_non_humanoid:true to rig it anyway. You have not been charged.',
						{ humanoid: humanoidInfo },
					);
				}
			} else {
				humanoidInfo = {
					humanoid: true,
					confidence: 'low',
					reason: 'image-only request; trusting caller intent (no prompt to classify)',
				};
			}

			const aspect = VALID_ASPECT.has(aspect_ratio) ? aspect_ratio : '3:4';
			const intervalMs = Number(env('FORGE_AVATAR_POLL_MS', '3000'));
			const started = Date.now();

			// --- Stage 1: Granite prompt director (text mode, fail-soft) --------
			const runDirector =
				!imageMode && trimmedPrompt && direct !== false && env('FORGE_AVATAR_DIRECTOR', '1') !== '0';
			let directedPrompt = null;
			if (runDirector) directedPrompt = await directPrompt(trimmedPrompt);
			const effectivePrompt = directedPrompt || trimmedPrompt;

			// --- Stage 2: generate the textured mesh ----------------------------
			const genStarted = Date.now();
			let genJob;
			try {
				genJob = await startForge({
					prompt: effectivePrompt || undefined,
					aspect,
					imageUrls: imageMode ? views : undefined,
				});
			} catch (err) {
				return toolError(err.code || 'provider_error', err.message, {
					...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
				});
			}

			const genTimeout = Number(env('FORGE_AVATAR_GEN_TIMEOUT_MS', '180000'));
			let gen;
			if (genJob.status === 'done' && genJob.glb_url) {
				gen = genJob; // synchronous completion
			} else {
				try {
					gen = await pollJob(genJob.job_id, {
						timeoutMs: genTimeout,
						intervalMs,
						failCode: 'generation_failed',
					});
				} catch (err) {
					return toolError(err.code || 'provider_error', err.message, {
						stage: 'generation',
						jobId: genJob.job_id,
						creationId: genJob.creation_id ?? null,
						durationMs: Date.now() - started,
					});
				}
				if (gen._timedOut) {
					return toolError('timeout', `generation did not finish within ${genTimeout}ms`, {
						stage: 'generation',
						jobId: genJob.job_id,
						creationId: genJob.creation_id ?? null,
						resumeUrl: `${apiBase()}/api/forge?job=${genJob.job_id}`,
						durationMs: Date.now() - started,
					});
				}
			}
			const meshGlbUrl = gen.glb_url;
			const generationMs = Date.now() - genStarted;

			// --- Stage 3: auto-rig the mesh -------------------------------------
			// Failures here still surface meshGlbUrl so the generation is not lost,
			// and the toolError cancels the charge — the caller keeps the mesh free.
			const rigStarted = Date.now();
			let rigJob;
			try {
				rigJob = await startRig(meshGlbUrl);
			} catch (err) {
				return toolError(err.code || 'provider_error', `rigging could not start: ${err.message}`, {
					stage: 'rig',
					meshGlbUrl,
					meshViewerUrl: `${apiBase()}/viewer?src=${encodeURIComponent(meshGlbUrl)}`,
					generationMs,
					durationMs: Date.now() - started,
					...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
				});
			}

			const rigTimeout = Number(env('FORGE_AVATAR_RIG_TIMEOUT_MS', '180000'));
			let rig;
			try {
				rig = await pollJob(rigJob.job_id, {
					timeoutMs: rigTimeout,
					intervalMs,
					failCode: 'rig_failed',
				});
			} catch (err) {
				return toolError(err.code || 'provider_error', `rigging failed: ${err.message}`, {
					stage: 'rig',
					meshGlbUrl,
					meshViewerUrl: `${apiBase()}/viewer?src=${encodeURIComponent(meshGlbUrl)}`,
					rigJobId: rigJob.job_id,
					generationMs,
					durationMs: Date.now() - started,
				});
			}
			if (rig._timedOut) {
				return toolError('timeout', `rigging did not finish within ${rigTimeout}ms`, {
					stage: 'rig',
					meshGlbUrl,
					meshViewerUrl: `${apiBase()}/viewer?src=${encodeURIComponent(meshGlbUrl)}`,
					rigJobId: rigJob.job_id,
					resumeUrl: `${apiBase()}/api/forge?job=${rigJob.job_id}`,
					generationMs,
					durationMs: Date.now() - started,
				});
			}

			const riggedGlbUrl = rig.glb_url;
			const rigMs = Date.now() - rigStarted;

			return {
				ok: true,
				mode: imageMode ? 'image_to_avatar' : 'text_to_avatar',
				riggedGlbUrl,
				meshGlbUrl,
				poseStudioUrl: `${apiBase()}/pose?src=${encodeURIComponent(riggedGlbUrl)}`,
				viewerUrl: `${apiBase()}/viewer?src=${encodeURIComponent(riggedGlbUrl)}`,
				animationReady: true,
				prompt: trimmedPrompt || null,
				imageUrls: imageMode ? views : null,
				viewsUsed: (gen.views_used ?? genJob.views_used) ?? (imageMode ? views.length : 0),
				backend: (gen.backend ?? genJob.backend) ?? null,
				directedPrompt: directedPrompt || null,
				directed: Boolean(directedPrompt),
				humanoid: humanoidInfo,
				meshCreationId: gen.creation_id ?? genJob.creation_id ?? null,
				riggedCreationId: rig.creation_id ?? rigJob.creation_id ?? null,
				rigJobId: rigJob.job_id,
				durable: Boolean(rig.durable),
				generationMs,
				rigMs,
				durationMs: Date.now() - started,
				fetchedAt: new Date().toISOString(),
			};
		},
	);

	return {
		name: TOOL_NAME,
		title: 'Text/Image → rigged avatar ($0.45)',
		description: TOOL_DESCRIPTION,
		inputSchema: inputZodShape,
		// Mints two fresh hosted GLB artifacts (mesh + rigged) via external
		// generation/rigging APIs; destroys nothing, every call yields new assets.
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		handler,
	};
}
