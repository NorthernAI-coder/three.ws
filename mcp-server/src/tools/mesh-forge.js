// `mesh_forge` — paid MCP tool: text → textured 3D GLB, as a model chain.
//
// Pricing: $0.25 USDC, settled `exact` on Solana.
//
// This is a thin, x402-gated client over the three.ws production pipeline — it
// does NOT hold any generation credentials itself. The npx-distributed MCP
// server can run anywhere; all GPU/LLM work happens on three.ws prod (which
// holds the Replicate / watsonx keys). The x402 USDC payment is what gates the
// call.
//
// The pipeline is a chain of specialist models, each doing one job:
//   1. Prompt director (IBM Granite via /api/chat, provider=watsonx) — rewrites
//      the caller's rough idea into an optimized 3D-generation spec (subject,
//      style, materials, single-subject framing). Fail-soft: if the director is
//      unreachable or disabled, the original prompt is forwarded unchanged and
//      `directed:false` is reported — never a fabricated result.
//   2. Reference synthesis + reconstruction (/api/forge) — FLUX renders a clean
//      reference image, then Microsoft TRELLIS / Tencent Hunyuan3D reconstructs
//      a textured GLB. This tool submits the job and polls to a terminal state.
//   3. Delivery — returns the durable GLB URL and a three.ws viewer link.
//
// Image→3D and auto-rigging are deliberately NOT exposed yet: no public prod
// endpoint reconstructs an arbitrary caller-supplied image into a riggable mesh
// today, and this tool never advertises an input it can't honor.
//
// Environment (all optional — sensible prod defaults):
//   MESH_FORGE_API_BASE    — three.ws origin. Default https://three.ws
//   MESH_FORGE_DIRECTOR     — "0" to skip the Granite director stage. Default on.
//   MESH_FORGE_DIRECTOR_MODEL — watsonx model id for direction. Default server default.
//   MESH_FORGE_TIMEOUT_MS   — overall reconstruct poll budget. Default 180000.
//   MESH_FORGE_POLL_MS      — poll interval. Default 3000.

import { z } from 'zod';

import { paid, toolError } from '../payments.js';
import { jsonSchemaFromZod } from './_shared.js';

const TOOL_NAME = 'mesh_forge';
const TOOL_DESCRIPTION =
	'Generate a textured 3D GLB model from a text prompt through a chain of specialist models: an IBM Granite "prompt director" rewrites the prompt into an optimized 3D spec, FLUX renders a reference image, and Microsoft TRELLIS / Tencent Hunyuan3D reconstruct the mesh. Returns the GLB URL, a three.ws viewer link, the directed prompt, and timing. Paid: $0.25 USDC.';

const VALID_ASPECT = new Set(['1:1', '4:3', '3:4', '16:9', '9:16']);

function env(k, def) {
	const v = process.env[k];
	return v && String(v).trim() ? String(v).trim() : def;
}

function apiBase() {
	return env('MESH_FORGE_API_BASE', 'https://three.ws').replace(/\/$/, '');
}

// The director system instruction. Granite turns a loose idea into a tight,
// single-subject generation spec — the single biggest lever on mesh quality.
const DIRECTOR_INSTRUCTION =
	'You are a 3D asset art director. Rewrite the user\'s idea into ONE concise prompt for a ' +
	'text-to-3D generator. Describe a SINGLE isolated subject on a plain background, naming form, ' +
	'materials, color, and surface detail. No scenes, no multiple objects, no text or logos, no ' +
	'background environment. Output ONLY the rewritten prompt as a single line — no preamble, no quotes.';

// Drive the deployed /api/chat SSE endpoint with IBM Granite (provider=watsonx)
// to refine the prompt. Returns the refined prompt string, or null on any
// failure so the caller can fall back to the original prompt (fail-soft, never
// fabricated). watsonx is a server-side key on prod; an anonymous caller may
// request provider:"watsonx" explicitly per api/chat.js routing.
async function directPrompt(rawPrompt) {
	const base = apiBase();
	const model = env('MESH_FORGE_DIRECTOR_MODEL');
	let res;
	try {
		res = await fetch(`${base}/api/chat`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
			body: JSON.stringify({
				provider: 'watsonx',
				...(model ? { model } : {}),
				message: `${DIRECTOR_INSTRUCTION}\n\nIdea: ${rawPrompt}`,
			}),
			signal: AbortSignal.timeout(30_000),
		});
	} catch {
		return null;
	}
	if (!res.ok || !res.body) return null;

	// Collect SSE `data: {type:'chunk',text}` events until `done`/stream end.
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
				else if (evt.type === 'done') {
					if (typeof evt.text === 'string' && !acc) acc = evt.text;
				}
			}
		}
	} catch {
		return null;
	}

	const refined = acc.trim().replace(/^["']|["']$/g, '').split('\n')[0].trim();
	return refined.length >= 3 && refined.length <= 1000 ? refined : null;
}

async function startForge(prompt, aspect) {
	const base = apiBase();
	const res = await fetch(`${base}/api/forge`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ prompt, aspect_ratio: aspect }),
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
	if (!res.ok || !data?.job_id) {
		const e = new Error(data?.message || `forge returned ${res.status}`);
		e.code = 'provider_error';
		throw e;
	}
	return data; // { job_id, creation_id, status, preview_image_url, ... }
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

const inputZodShape = {
	prompt: z
		.string()
		.min(3)
		.max(1000)
		.describe('Natural-language description of the single object to model, e.g. "a worn leather armchair".'),
	aspect_ratio: z
		.enum(['1:1', '4:3', '3:4', '16:9', '9:16'])
		.describe('Reference image aspect ratio. Default 1:1 (best for isolated objects).')
		.optional(),
	direct: z
		.boolean()
		.describe('Run the IBM Granite prompt-director stage to optimize the prompt before generation. Default true.')
		.optional(),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);

export async function buildMeshForgeTool() {
	const handler = await paid(
		{
			toolName: TOOL_NAME,
			description: TOOL_DESCRIPTION,
			scheme: 'exact',
			priceUsd: '$0.25',
			inputSchema: inputJsonSchema,
			example: { prompt: 'a worn leather armchair, brass studs', aspect_ratio: '1:1' },
			outputExample: {
				ok: true,
				glbUrl: 'https://three.ws/cdn/creations/abc123/mesh.glb',
				preview: 'https://three.ws/viewer?src=https%3A%2F%2Fthree.ws%2Fcdn%2F...',
				prompt: 'a worn leather armchair, brass studs',
				directedPrompt: 'A single worn brown leather wingback armchair with brass stud trim...',
				directed: true,
				jobId: 'k7m2q9x4',
				creationId: 'abc123',
				referenceImageUrl: 'https://replicate.delivery/.../ref.png',
				durationMs: 96000,
			},
		},
		async ({ prompt, aspect_ratio, direct }) => {
			const aspect = VALID_ASPECT.has(aspect_ratio) ? aspect_ratio : '1:1';
			const started = Date.now();

			// Stage 1 — Granite prompt director (fail-soft, opt-out).
			const runDirector = direct !== false && env('MESH_FORGE_DIRECTOR', '1') !== '0';
			let directedPrompt = null;
			if (runDirector) directedPrompt = await directPrompt(prompt);
			const effectivePrompt = directedPrompt || prompt;

			// Stage 2 — submit reference synthesis + reconstruction.
			let job;
			try {
				job = await startForge(effectivePrompt, aspect);
			} catch (err) {
				return toolError(err.code || 'provider_error', err.message, {
					...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
				});
			}

			// Stage 3 — poll to a terminal state. 3D reconstruction is slow; budget
			// generously but bound it so the caller never hangs forever.
			const timeoutMs = Number(env('MESH_FORGE_TIMEOUT_MS', '180000'));
			const intervalMs = Number(env('MESH_FORGE_POLL_MS', '3000'));
			let final;
			try {
				final = await pollForge(job.job_id, { timeoutMs, intervalMs });
			} catch (err) {
				return toolError(err.code || 'provider_error', err.message, {
					jobId: job.job_id,
					creationId: job.creation_id ?? null,
					durationMs: Date.now() - started,
				});
			}

			const durationMs = Date.now() - started;

			if (final._timedOut) {
				return toolError('timeout', `reconstruction did not finish within ${timeoutMs}ms`, {
					jobId: job.job_id,
					creationId: job.creation_id ?? null,
					status: final.status || 'running',
					resumeUrl: `${apiBase()}/api/forge?job=${job.job_id}`,
					durationMs,
				});
			}

			const glbUrl = final.glb_url;
			const preview = `${apiBase()}/viewer?src=${encodeURIComponent(glbUrl)}`;

			return {
				ok: true,
				glbUrl,
				preview,
				prompt,
				directedPrompt: directedPrompt || null,
				directed: Boolean(directedPrompt),
				jobId: job.job_id,
				creationId: final.creation_id ?? job.creation_id ?? null,
				referenceImageUrl: job.preview_image_url ?? null,
				durable: Boolean(final.durable),
				durationMs,
				fetchedAt: new Date().toISOString(),
			};
		},
	);

	return {
		name: TOOL_NAME,
		title: 'Text → 3D mesh ($0.25)',
		description: TOOL_DESCRIPTION,
		inputSchema: inputZodShape,
		handler,
	};
}
