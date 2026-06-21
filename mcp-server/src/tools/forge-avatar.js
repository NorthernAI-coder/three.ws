// `forge_avatar` — paid MCP tool: text prompt → rigged, animation-ready avatar
// in ONE call.
//
// Pricing: $0.40 USDC, settled `exact` on Solana. (A small bundle discount over
// the $0.25 mesh_forge + $0.20 rig_mesh you'd pay running the two steps by hand.)
//
// This composes the two production three.ws pipelines — generate then rig — that
// mesh_forge and rig_mesh expose individually, so an agent can go straight from a
// description to a model that drops into the pose studio and plays the canonical
// idle/walk clips. Like its siblings it is a thin, x402-gated client over the
// prod /api/forge endpoint and holds NO generation credentials; the USDC payment
// gates the call and all GPU work runs on three.ws prod.
//
// Stages:
//   1. Generate — POST /api/forge with the prompt (text→3D). Produces a textured,
//      static GLB. Polled to a terminal state.
//   2. Humanoid gate — the generated mesh is auto-rigged ONLY when the prompt
//      describes a humanoid figure (classifyHumanoidPrompt). UniRig fits a
//      humanoid skeleton and the canonical clip library only retargets onto a
//      humanoid rig, so a non-character prompt ("a leather armchair") skips
//      rigging instead of burning a paid rig call on a useless skeleton. Set
//      `force_rig:true` to override and rig regardless.
//   3. Rig — POST /api/forge?action=rig with the durable mesh URL. Produces a
//      rigged GLB (skeleton + skin weights). Polled to a terminal state.
//
// Always returns the generated mesh; `rigged` reports whether stage 3 ran and,
// when it did, the rigged GLB + pose-studio link. A rig failure never discards
// the paid-for mesh — the mesh URL is always returned, with the rig error
// attached, so the caller keeps the asset they paid to generate.
//
// Environment (all optional — sensible prod defaults):
//   MESH_FORGE_API_BASE     — three.ws origin. Default https://three.ws
//   FORGE_AVATAR_TIMEOUT_MS — overall poll budget PER stage. Default 180000.
//   FORGE_AVATAR_POLL_MS    — poll interval. Default 3000.

import { z } from 'zod';

import { paid, toolError } from '../payments.js';
import { jsonSchemaFromZod } from './_shared.js';
import { classifyHumanoidPrompt } from './_humanoid.js';

const TOOL_NAME = 'forge_avatar';
const TOOL_DESCRIPTION =
	'Generate a rigged, animation-ready 3D avatar from a text prompt in ONE call. Runs the three.ws ' +
	'pipeline end to end: text→3D mesh generation, then — when the prompt describes a humanoid figure — ' +
	'auto-rigging (humanoid skeleton + skin weights via UniRig). Returns the generated mesh URL, the ' +
	'rigged GLB URL, a three.ws pose-studio link that plays the canonical idle/walk clips, and per-stage ' +
	'timing. Non-humanoid prompts (a chair, a car) return the textured mesh and skip rigging automatically ' +
	'so you are never charged a wasted rig on a mesh no humanoid skeleton can drive; pass force_rig:true to ' +
	'rig anyway. For a static mesh only use mesh_forge; to rig an existing GLB use rig_mesh. Paid: $0.40 USDC.';

function env(k, def) {
	const v = process.env[k];
	return v && String(v).trim() ? String(v).trim() : def;
}

function apiBase() {
	return env('MESH_FORGE_API_BASE', 'https://three.ws').replace(/\/$/, '');
}

// Tag a thrown error with a stable `code` (and optional retryAfter) so the
// handler can translate it into a toolError without string-sniffing messages.
function fail(code, message, extra) {
	const e = new Error(message);
	e.code = code;
	if (extra && extra.retryAfter != null) e.retryAfter = extra.retryAfter;
	return e;
}

async function postForge(path, body) {
	const res = await fetch(`${apiBase()}/api/forge${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(30_000),
	});
	const data = await res.json().catch(() => ({}));
	if (res.status === 503) throw fail('not_configured', data?.message || 'this stage is not configured on the three.ws deployment');
	if (res.status === 501) throw fail('not_configured', data?.message || 'this stage is not enabled on the three.ws deployment');
	if (res.status === 429) throw fail('rate_limited', data?.message || 'the pipeline is busy; try again shortly', { retryAfter: data?.retry_after });
	if (!res.ok || !data?.job_id) throw fail('provider_error', data?.message || `forge returned ${res.status}`);
	return data;
}

// Poll a forge job to a terminal state. Returns the done payload (with glb_url),
// or `{ ...last, _timedOut:true }` if the budget elapses before completion. A
// transient network/timeout error during a single poll is retried, not fatal.
async function pollForge(jobId, { timeoutMs, intervalMs }) {
	const deadline = Date.now() + timeoutMs;
	let last = null;
	while (Date.now() < deadline) {
		let res;
		try {
			res = await fetch(`${apiBase()}/api/forge?job=${encodeURIComponent(jobId)}`, {
				headers: { accept: 'application/json' },
				signal: AbortSignal.timeout(Math.max(intervalMs * 3, 15_000)),
			});
		} catch (err) {
			if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
				await new Promise((r) => setTimeout(r, intervalMs));
				continue;
			}
			throw fail('provider_error', `forge poll failed: ${err?.message || err}`);
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw fail('provider_error', data?.message || `forge poll returned ${res.status}`);
		last = data;
		if (data.status === 'done' && data.glb_url) return data;
		if (data.status === 'failed') throw fail('stage_failed', data.error || 'stage failed');
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return { ...(last || {}), _timedOut: true };
}

const inputZodShape = {
	prompt: z
		.string()
		.min(3)
		.max(1000)
		.describe('Natural-language description of the character to model, e.g. "a friendly cartoon astronaut, glossy white suit". Lead with the figure and its key materials/colors.'),
	aspect_ratio: z
		.enum(['1:1', '4:3', '3:4', '16:9', '9:16'])
		.describe('Reference image aspect ratio. Default 1:1 (best for an isolated figure).')
		.optional(),
	force_rig: z
		.boolean()
		.describe('Rig the mesh even when the prompt does not read as humanoid. Default false — non-humanoid prompts return the mesh and skip rigging.')
		.optional(),
	skip_rig: z
		.boolean()
		.describe('Generate the textured mesh only and never rig (equivalent to mesh_forge but on this tool). Default false.')
		.optional(),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);
const VALID_ASPECT = new Set(['1:1', '4:3', '3:4', '16:9', '9:16']);

export async function buildForgeAvatarTool() {
	const handler = await paid(
		{
			toolName: TOOL_NAME,
			description: TOOL_DESCRIPTION,
			scheme: 'exact',
			priceUsd: '$0.40',
			inputSchema: inputJsonSchema,
			example: { prompt: 'a friendly cartoon astronaut, glossy white suit, rounded helmet' },
			outputExample: {
				ok: true,
				prompt: 'a friendly cartoon astronaut, glossy white suit, rounded helmet',
				meshGlbUrl: 'https://three.ws/cdn/creations/abc123/mesh.glb',
				meshViewerUrl: 'https://three.ws/viewer?src=https%3A%2F%2Fthree.ws%2F...',
				rigged: true,
				riggedGlbUrl: 'https://three.ws/cdn/creations/def456/rigged.glb',
				poseStudioUrl: 'https://three.ws/pose?src=https%3A%2F%2Fthree.ws%2F...',
				humanoid: { humanoid: true, confidence: 0.8, reason: 'humanoid signals (1 figure, 0 body) outweigh 0 non-humanoid' },
				generateJobId: 'k7m2q9x4',
				rigJobId: 'r9k2m7x4',
				creationId: 'def456',
				timings: { generateMs: 96000, rigMs: 48000, totalMs: 144000 },
			},
		},
		async ({ prompt, aspect_ratio, force_rig, skip_rig }) => {
			const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
			if (trimmedPrompt.length < 3) {
				return toolError('invalid_input', 'Provide a prompt of at least 3 characters describing the avatar.');
			}
			const aspect = VALID_ASPECT.has(aspect_ratio) ? aspect_ratio : '1:1';
			const timeoutMs = Number(env('FORGE_AVATAR_TIMEOUT_MS', '180000'));
			const intervalMs = Number(env('FORGE_AVATAR_POLL_MS', '3000'));
			const startedAt = Date.now();

			// Stage 1 — generate the textured mesh from the prompt (text→3D).
			let genJob;
			try {
				genJob = await postForge('', { prompt: trimmedPrompt, aspect_ratio: aspect });
			} catch (err) {
				return toolError(err.code || 'provider_error', err.message, {
					...(err.retryAfter != null ? { retryAfter: err.retryAfter } : {}),
				});
			}
			const genStart = Date.now();
			let gen;
			try {
				gen = await pollForge(genJob.job_id, { timeoutMs, intervalMs });
			} catch (err) {
				return toolError(err.code === 'stage_failed' ? 'generation_failed' : err.code || 'provider_error', err.message, {
					generateJobId: genJob.job_id,
					creationId: genJob.creation_id ?? null,
					durationMs: Date.now() - startedAt,
				});
			}
			if (gen._timedOut) {
				return toolError('timeout', `mesh generation did not finish within ${timeoutMs}ms`, {
					generateJobId: genJob.job_id,
					creationId: genJob.creation_id ?? null,
					status: gen.status || 'running',
					resumeUrl: `${apiBase()}/api/forge?job=${genJob.job_id}`,
					durationMs: Date.now() - startedAt,
				});
			}

			const meshGlbUrl = gen.glb_url;
			const meshViewerUrl = `${apiBase()}/viewer?src=${encodeURIComponent(meshGlbUrl)}`;
			const generateMs = Date.now() - genStart;

			// Stage 2 — humanoid gate. Decide whether rigging is worth a paid call.
			const humanoid = classifyHumanoidPrompt(trimmedPrompt);
			const shouldRig = !skip_rig && (force_rig === true || humanoid.humanoid);

			const meshResult = {
				ok: true,
				prompt: trimmedPrompt,
				meshGlbUrl,
				meshViewerUrl,
				humanoid,
				backend: gen.backend ?? genJob.backend ?? null,
				generateJobId: genJob.job_id,
				creationId: gen.creation_id ?? genJob.creation_id ?? null,
				durable: Boolean(gen.durable),
			};

			if (!shouldRig) {
				return {
					...meshResult,
					rigged: false,
					rigSkippedReason: skip_rig
						? 'skip_rig requested'
						: `prompt is not humanoid (${humanoid.reason}); pass force_rig:true to rig anyway`,
					riggedGlbUrl: null,
					poseStudioUrl: null,
					rigJobId: null,
					timings: { generateMs, rigMs: 0, totalMs: Date.now() - startedAt },
					fetchedAt: new Date().toISOString(),
				};
			}

			// Stage 3 — auto-rig the durable mesh. A rig failure must NOT discard the
			// mesh the caller already paid to generate: on any rig error we return
			// the mesh with `rigged:false` and the error attached, not a hard fail.
			const rigStart = Date.now();
			let rigJob;
			try {
				rigJob = await postForge('?action=rig', { glb_url: meshGlbUrl });
			} catch (err) {
				return {
					...meshResult,
					rigged: false,
					rigError: { code: err.code || 'provider_error', message: err.message, ...(err.retryAfter != null ? { retryAfter: err.retryAfter } : {}) },
					riggedGlbUrl: null,
					poseStudioUrl: null,
					rigJobId: null,
					timings: { generateMs, rigMs: Date.now() - rigStart, totalMs: Date.now() - startedAt },
					fetchedAt: new Date().toISOString(),
				};
			}

			let rig;
			try {
				rig = await pollForge(rigJob.job_id, { timeoutMs, intervalMs });
			} catch (err) {
				return {
					...meshResult,
					rigged: false,
					rigError: { code: err.code === 'stage_failed' ? 'rig_failed' : err.code || 'provider_error', message: err.message },
					rigJobId: rigJob.job_id,
					riggedGlbUrl: null,
					poseStudioUrl: null,
					timings: { generateMs, rigMs: Date.now() - rigStart, totalMs: Date.now() - startedAt },
					fetchedAt: new Date().toISOString(),
				};
			}

			if (rig._timedOut) {
				return {
					...meshResult,
					rigged: false,
					rigError: { code: 'timeout', message: `rigging did not finish within ${timeoutMs}ms`, status: rig.status || 'running', resumeUrl: `${apiBase()}/api/forge?job=${rigJob.job_id}` },
					rigJobId: rigJob.job_id,
					riggedGlbUrl: null,
					poseStudioUrl: null,
					timings: { generateMs, rigMs: Date.now() - rigStart, totalMs: Date.now() - startedAt },
					fetchedAt: new Date().toISOString(),
				};
			}

			const riggedGlbUrl = rig.glb_url;
			const poseStudioUrl = `${apiBase()}/pose?src=${encodeURIComponent(riggedGlbUrl)}`;
			const rigMs = Date.now() - rigStart;

			return {
				...meshResult,
				rigged: true,
				riggedGlbUrl,
				poseStudioUrl,
				rigJobId: rigJob.job_id,
				creationId: rig.creation_id ?? meshResult.creationId,
				durable: Boolean(rig.durable),
				timings: { generateMs, rigMs, totalMs: Date.now() - startedAt },
				fetchedAt: new Date().toISOString(),
			};
		},
	);

	return {
		name: TOOL_NAME,
		title: 'Text → rigged avatar ($0.40)',
		description: TOOL_DESCRIPTION,
		inputSchema: inputZodShape,
		// Generates a fresh mesh and (when humanoid) a rigged GLB via external
		// generation/rig APIs; destroys nothing, mints new assets each call.
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		handler,
	};
}
