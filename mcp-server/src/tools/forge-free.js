// `forge_free` — FREE MCP tool: text prompt → textured 3D GLB. No payment, no key.
//
// The zero-cost counterpart to `mesh_forge` / `text_to_avatar`. It drives the
// three.ws /api/forge pipeline pinned to the FREE NVIDIA NIM (Microsoft TRELLIS)
// text→3D lane — the same free engine the /forge web page uses for prompt
// drafts — so anyone can turn a text prompt into a downloadable, viewable 3D
// model with NO x402 payment and NO API key.
//
// Pipeline:
//   POST /api/forge { prompt, tier, backend:"nvidia" }
//     → NVCF generates the mesh natively from the prompt (no FLUX intermediate
//       view), persists the GLB to three.ws R2, and returns a durable URL. NVCF
//       usually completes synchronously (~12–15s at draft) → status:"done" on
//       the submit; when it queues the job we poll GET ?job=<id> to a terminal
//       state. Returns the GLB URL plus a three.ws viewer link that renders the
//       model in-browser. Feed the GLB to `rig_mesh` to make it animation-ready.
//
// Honesty: the free lane is the platform's "never dead-end" default — if NVCF is
// momentarily unreachable or over-quota, /api/forge degrades the SAME request to
// its standing engine and reports the backend that actually ran. This tool
// surfaces that `backend` verbatim, so a degrade is visible, never silent. The
// CALLER is never charged either way (there is no x402 here); only the
// platform's own infra is involved.
//
// Environment (all optional — sensible prod defaults):
//   FORGE_FREE_API_BASE   — three.ws origin. Default https://three.ws
//   FORGE_FREE_TIMEOUT_MS — overall reconstruct poll budget. Default 180000.
//   FORGE_FREE_POLL_MS    — poll interval. Default 3000.

import { z } from 'zod';

import { free, toolError } from '../payments.js';
import { jsonSchemaFromZod } from './_shared.js';

const TOOL_NAME = 'forge_free';
const TOOL_DESCRIPTION =
	'Generate a textured 3D GLB model from a text prompt — FREE: no x402 payment, no API key, no wallet. ' +
	'Drives the three.ws /api/forge pipeline on the free NVIDIA NIM (Microsoft TRELLIS) text→3D lane — ' +
	'the same zero-cost engine the /forge web page uses for prompt drafts. Returns a durable GLB URL, a ' +
	'three.ws viewer link that renders the model in the browser, the quality tier used, and the backend ' +
	'that actually produced it. Choose tier draft (fast, default), standard, or high — all free; higher ' +
	'tiers just take longer. Text-only (NVIDIA\'s hosted TRELLIS preview does not accept uploaded photos); ' +
	'for image/multi-view → 3D or the Granite-directed paid chain use mesh_forge. Feed the returned glbUrl ' +
	'to rig_mesh to make it animation-ready. Free — no payment required.';

const VALID_TIER = new Set(['draft', 'standard', 'high']);

function env(k, def) {
	const v = process.env[k];
	return v && String(v).trim() ? String(v).trim() : def;
}

function apiBase() {
	return env('FORGE_FREE_API_BASE', 'https://three.ws').replace(/\/$/, '');
}

// Submit a text→3D job to the free NVIDIA NIM lane. The forge endpoint may
// answer in one of two shapes:
//   • synchronous completion — { status:"done", glb_url, ... } (NVCF finished
//     inside the submit window; no job to poll), or
//   • queued — { job_id, status:"queued", ... } (poll GET ?job=<id>).
// Accept BOTH; mesh_forge's startForge requires a job_id and would wrongly throw
// on the free lane's common synchronous-done response.
async function startForge({ prompt, tier }) {
	const base = apiBase();
	let res;
	try {
		res = await fetch(`${base}/api/forge`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			// Pin the free NVIDIA NIM (TRELLIS) lane explicitly so the happy path is
			// always the zero-cost engine — never the platform's paid Replicate lane.
			// The endpoint still degrades to its standing engine if NVCF is down and
			// reports which backend ran (surfaced in the result), so this is honest,
			// not a silent paid fallback. path:"image" is the only path NVIDIA serves.
			body: JSON.stringify({ prompt, tier, backend: 'nvidia', path: 'image' }),
			// NVCF can complete synchronously inside the submit (the endpoint holds the
			// connection up to its ~45s provider window before returning done), so give
			// the submit a generous ceiling rather than the 30s paid-lane budget.
			signal: AbortSignal.timeout(90_000),
		});
	} catch (err) {
		if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
			const e = new Error('the free 3D lane took too long to accept the job; try again');
			e.code = 'timeout';
			throw e;
		}
		const e = new Error(`forge unreachable: ${err?.message || err}`);
		e.code = 'provider_error';
		throw e;
	}

	const data = await res.json().catch(() => ({}));
	if (res.status === 503) {
		const e = new Error(data?.message || 'free text→3D is not configured on the three.ws deployment');
		e.code = 'not_configured';
		throw e;
	}
	if (res.status === 429) {
		const e = new Error(data?.message || 'the free 3D lane is busy; try again shortly');
		e.code = 'rate_limited';
		e.retryAfter = data?.retry_after;
		throw e;
	}
	const completedSync = data?.status === 'done' && data?.glb_url;
	if (!res.ok || !(data?.job_id || completedSync)) {
		const e = new Error(data?.message || `forge returned ${res.status}`);
		e.code = 'provider_error';
		throw e;
	}
	return data; // { job_id?, creation_id, status, glb_url?, backend, durable?, ... }
}

async function pollForge(jobId, { timeoutMs, intervalMs }) {
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
			const e = new Error(`forge poll failed: ${err?.message || err}`);
			e.code = 'provider_error';
			throw e;
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const e = new Error(data?.message || `forge poll returned ${res.status}`);
			e.code = 'provider_error';
			throw e;
		}
		last = data;
		if (data.status === 'done' && data.glb_url) return data;
		if (data.status === 'failed') {
			const e = new Error(data.error || 'generation failed');
			e.code = 'generation_failed';
			throw e;
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return { ...(last || {}), _timedOut: true };
}

// Shape the final success envelope. `backend` is reported verbatim from the
// pipeline so a degrade off the free NVIDIA lane is visible, never silent.
function shapeResult({ data, prompt, tierId, jobId, startedAt }) {
	const glbUrl = data.glb_url;
	const preview = `${apiBase()}/viewer?src=${encodeURIComponent(glbUrl)}`;
	return {
		ok: true,
		free: true,
		cost: '$0.00',
		mode: 'text_to_3d',
		glbUrl,
		preview,
		prompt,
		tier: tierId,
		backend: data.backend ?? null,
		jobId,
		creationId: data.creation_id ?? null,
		durable: Boolean(data.durable),
		durationMs: Date.now() - startedAt,
		fetchedAt: new Date().toISOString(),
	};
}

const inputZodShape = {
	prompt: z
		.string()
		.min(3)
		.max(1000)
		.describe(
			'Natural-language description of the single object or character to model, e.g. "a friendly round robot mascot, glossy white plastic". The free TRELLIS lane conditions on ~77 characters, so lead with the subject plus its key materials and colors.',
		),
	tier: z
		.enum(['draft', 'standard', 'high'])
		.describe(
			'Geometry/texture budget: draft = fast preview (default), standard = balanced, high = densest mesh. All three are free on the NVIDIA NIM lane — higher tiers only cost more time, never money.',
		)
		.optional(),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);

export function buildForgeFreeTool() {
	const handler = free(
		{ toolName: TOOL_NAME, inputSchema: inputJsonSchema },
		async ({ prompt, tier }) => {
			const trimmed = typeof prompt === 'string' ? prompt.trim() : '';
			if (trimmed.length < 3) {
				return toolError('invalid_input', 'Provide a text prompt of at least 3 characters.');
			}
			const tierId = VALID_TIER.has(tier) ? tier : 'draft';
			const startedAt = Date.now();

			// Stage 1 — submit to the free NVIDIA NIM text→3D lane.
			let job;
			try {
				job = await startForge({ prompt: trimmed, tier: tierId });
			} catch (err) {
				return toolError(err.code || 'provider_error', err.message, {
					...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
				});
			}

			// Fast path — NVCF completed inside the submit and already persisted the GLB.
			if (job.status === 'done' && job.glb_url) {
				return shapeResult({ data: job, prompt: trimmed, tierId, jobId: null, startedAt });
			}

			// Stage 2 — poll the queued job to a terminal state.
			const timeoutMs = Number(env('FORGE_FREE_TIMEOUT_MS', '180000'));
			const intervalMs = Number(env('FORGE_FREE_POLL_MS', '3000'));
			let final;
			try {
				final = await pollForge(job.job_id, { timeoutMs, intervalMs });
			} catch (err) {
				return toolError(err.code || 'provider_error', err.message, {
					jobId: job.job_id,
					creationId: job.creation_id ?? null,
					durationMs: Date.now() - startedAt,
				});
			}

			if (final._timedOut) {
				return toolError('timeout', `generation did not finish within ${timeoutMs}ms`, {
					jobId: job.job_id,
					creationId: job.creation_id ?? null,
					status: final.status || 'running',
					resumeUrl: `${apiBase()}/api/forge?job=${job.job_id}`,
					durationMs: Date.now() - startedAt,
				});
			}

			return shapeResult({ data: final, prompt: trimmed, tierId, jobId: job.job_id, startedAt });
		},
	);

	return {
		name: TOOL_NAME,
		title: 'Free text → 3D (TRELLIS)',
		description: TOOL_DESCRIPTION,
		inputSchema: inputZodShape,
		// Mints a fresh hosted GLB artifact via the free generation lane; destroys
		// nothing, and the same prompt can yield a different mesh each call.
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		handler,
	};
}
