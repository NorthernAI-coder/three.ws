// `rig_mesh` — paid MCP tool: static GLB → rigged, animation-ready GLB.
//
// Pricing: $0.20 USDC, settled `exact` on Solana.
//
// Takes a GLB mesh URL and returns a rigged GLB — a humanoid skeleton plus
// per-vertex skin weights — produced by the three.ws auto-rig pipeline
// (/api/forge?action=rig, VAST-AI UniRig by default). Like mesh_forge, this is
// a thin x402-gated client over the prod pipeline: it holds no generation
// credentials; the USDC payment gates the call and all GPU work runs on
// three.ws prod.
//
// Composes with mesh_forge: forge a mesh (text or image → GLB), then feed the
// returned glbUrl here to get an animation-ready model that loads straight into
// the three.ws pose studio.
//
// Environment (all optional — sensible prod defaults):
//   MESH_FORGE_API_BASE  — three.ws origin. Default https://three.ws
//   RIG_MESH_TIMEOUT_MS  — overall rig poll budget. Default 180000.
//   RIG_MESH_POLL_MS     — poll interval. Default 3000.

import { z } from 'zod';

import { paid, toolError } from '../payments.js';
import { jsonSchemaFromZod } from './_shared.js';

const TOOL_NAME = 'rig_mesh';
const TOOL_DESCRIPTION =
	'Auto-rig a static 3D GLB mesh into an animation-ready model: adds a humanoid skeleton and per-vertex skin weights via the three.ws rig pipeline (VAST-AI UniRig by default). Takes a GLB URL, returns the rigged GLB URL and a three.ws pose-studio link. Pairs with mesh_forge — forge a mesh, then rig it. Paid: $0.20 USDC.';

function env(k, def) {
	const v = process.env[k];
	return v && String(v).trim() ? String(v).trim() : def;
}

function apiBase() {
	return env('MESH_FORGE_API_BASE', 'https://three.ws').replace(/\/$/, '');
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
	if (res.status === 503) {
		const e = new Error(data?.message || 'rigging is not configured on the three.ws deployment');
		e.code = 'not_configured';
		throw e;
	}
	if (res.status === 501) {
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
	return data; // { job_id, creation_id, status, mode:'rig', source_glb_url }
}

async function pollRig(jobId, { timeoutMs, intervalMs }) {
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
			const e = new Error(`rig poll failed: ${err?.message || err}`);
			e.code = 'provider_error';
			throw e;
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const e = new Error(data?.message || `rig poll returned ${res.status}`);
			e.code = 'provider_error';
			throw e;
		}
		last = data;
		if (data.status === 'done' && data.glb_url) return data;
		if (data.status === 'failed') {
			const e = new Error(data.error || 'rigging failed');
			e.code = 'rig_failed';
			throw e;
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return { ...(last || {}), _timedOut: true };
}

const inputZodShape = {
	glb_url: z
		.string()
		.url()
		.describe('http(s) URL to the static GLB mesh to rig (e.g. the glbUrl returned by mesh_forge).'),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);

export async function buildRigMeshTool() {
	const handler = await paid(
		{
			toolName: TOOL_NAME,
			description: TOOL_DESCRIPTION,
			scheme: 'exact',
			priceUsd: '$0.20',
			inputSchema: inputJsonSchema,
			example: { glb_url: 'https://three.ws/cdn/creations/abc123/mesh.glb' },
			outputExample: {
				ok: true,
				riggedGlbUrl: 'https://three.ws/cdn/creations/def456/rigged.glb',
				sourceGlbUrl: 'https://three.ws/cdn/creations/abc123/mesh.glb',
				poseStudioUrl: 'https://three.ws/pose?src=https%3A%2F%2Fthree.ws%2F...',
				jobId: 'r9k2m7x4',
				creationId: 'def456',
				durationMs: 48000,
			},
		},
		async ({ glb_url }) => {
			const started = Date.now();

			let job;
			try {
				job = await startRig(glb_url);
			} catch (err) {
				return toolError(err.code || 'provider_error', err.message, {
					...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
				});
			}

			const timeoutMs = Number(env('RIG_MESH_TIMEOUT_MS', '180000'));
			const intervalMs = Number(env('RIG_MESH_POLL_MS', '3000'));
			let final;
			try {
				final = await pollRig(job.job_id, { timeoutMs, intervalMs });
			} catch (err) {
				return toolError(err.code || 'provider_error', err.message, {
					jobId: job.job_id,
					creationId: job.creation_id ?? null,
					durationMs: Date.now() - started,
				});
			}

			const durationMs = Date.now() - started;

			if (final._timedOut) {
				return toolError('timeout', `rigging did not finish within ${timeoutMs}ms`, {
					jobId: job.job_id,
					creationId: job.creation_id ?? null,
					status: final.status || 'running',
					resumeUrl: `${apiBase()}/api/forge?job=${job.job_id}`,
					durationMs,
				});
			}

			const riggedGlbUrl = final.glb_url;
			const poseStudioUrl = `${apiBase()}/pose?src=${encodeURIComponent(riggedGlbUrl)}`;

			return {
				ok: true,
				riggedGlbUrl,
				sourceGlbUrl: glb_url,
				poseStudioUrl,
				jobId: job.job_id,
				creationId: final.creation_id ?? job.creation_id ?? null,
				durable: Boolean(final.durable),
				durationMs,
				fetchedAt: new Date().toISOString(),
			};
		},
	);

	return {
		name: TOOL_NAME,
		title: 'Rig 3D mesh ($0.20)',
		description: TOOL_DESCRIPTION,
		inputSchema: inputZodShape,
		handler,
	};
}
