// POST /api/v1/ai/text-to-3d — the flagship FREE text→3D endpoint of the
// three.ws AI package.
//
// three.ws runs the only text→mesh lane in the x402 / agent-payments ecosystem.
// Its draft tier is genuinely free: a prompt goes to the NVIDIA NIM TRELLIS lane
// (backend `nvidia`, path `image`, draft tier) via the SAME submit pipeline that
// backs the `forge_free` MCP tool and /forge — no key, no wallet. This route
// gives that lane a clean, versioned front door instead of leaving it buried
// under forge job plumbing.
//
// Semantics mirror the draft lane exactly (zero duplicated generation logic):
//   • The NIM often finishes inside the submit window → { status:'done', glb_url,
//     viewer_url }.
//   • Otherwise the job is queued → { status:'pending', job:<token>, poll_url }
//     and the caller polls the EXISTING free endpoint GET /api/forge?job=<token>.
//
// Free with a per-IP daily quota (10/day — the GPU quota is real). Above the
// quota we do NOT paywall silently: 429 with X-RateLimit-Reset AND a pointer to
// the paid /api/x402/forge tiers, which have no daily cap. The free lane is the
// funnel; the paid forge is the upsell.

import { defineEndpoint, fail } from '../../_lib/gateway.js';
import { json } from '../../_lib/http.js';
import { limits } from '../../_lib/rate-limit.js';
import { backendIsConfigured } from '../../_lib/forge-tiers.js';
import { startForge, originFromReq, viewerUrl } from '../../_mcp-studio/forge-client.js';

const DAILY_QUOTA = 10;
const PROMPT_MIN = 3;
const PROMPT_MAX = 1000;
const PAID_FORGE_ENDPOINT = '/api/x402/forge';

// Translate a /api/forge draft-lane payload into the versioned response contract.
// Pure + exported so the lane boundary can be pinned in tests against real
// captured shapes (inline-done vs queued) without touching the network.
export function shapeResult(job, base) {
	const glbUrl = typeof job?.glb_url === 'string' ? job.glb_url : '';
	if (job?.status === 'done' && glbUrl) {
		return {
			status: 'done',
			glb_url: glbUrl,
			viewer_url: viewerUrl(base, glbUrl),
			creation_id: job.creation_id ?? null,
			backend: 'nvidia',
			tier: 'draft',
		};
	}
	// Queued: hand back the signed job token and the existing free poll URL. The
	// viewer link isn't known until the GLB lands, so it's null until then.
	const token = job?.job_id ?? null;
	return {
		status: 'pending',
		job: token,
		poll_url: token ? `/api/forge?job=${encodeURIComponent(token)}` : null,
		viewer_url: null,
		backend: 'nvidia',
		tier: 'draft',
	};
}

// Map a startForge lane failure to an honest boundary error. The buyer/user is
// never left with a silent failure — every code has a designed status + message.
function failFromLane(err) {
	const code = err?.code;
	if (code === 'not_configured') {
		fail(503, 'not_configured', err.message || 'Free text→3D is not configured on this deployment — set NVIDIA_API_KEY.');
	}
	if (code === 'busy') {
		fail(429, 'rate_limited', err.message || 'The free text→3D lane is momentarily busy — try again shortly.');
	}
	if (code === 'timeout') {
		fail(504, 'lane_timeout', err.message || 'The text→3D lane took too long to accept the job — try again.');
	}
	fail(502, 'lane_error', err?.message || 'The text→3D lane failed to accept the job.');
}

export default defineEndpoint({
	name: 'v1.ai.text_to_3d',
	method: 'POST',
	auth: 'public',
	handler: async ({ req, res, body, ip }) => {
		const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
		if (prompt.length < PROMPT_MIN) {
			fail(400, 'validation_error', `"prompt" must be a non-empty string of at least ${PROMPT_MIN} characters`);
		}
		if (prompt.length > PROMPT_MAX) {
			fail(400, 'validation_error', `"prompt" must be ${PROMPT_MAX} characters or fewer`);
		}

		// The free draft lane pins the NVIDIA NIM TRELLIS backend. If its key isn't
		// present the lane can't serve — surface a clear 503 naming the exact var.
		if (!backendIsConfigured('nvidia')) {
			fail(
				503,
				'not_configured',
				'Free text→3D is not configured on this deployment — set NVIDIA_API_KEY to enable the NVIDIA NIM TRELLIS lane.',
			);
		}

		// Per-IP daily GPU quota. Above it: 429 with reset + paid upsell, never a
		// silent paywall. Consumed before submit so a burst can't outrun the meter.
		const rl = await limits.aiTextTo3d(ip);
		if (!rl.success) {
			const resetSec = Math.max(1, Math.ceil(((rl.reset ?? Date.now()) - Date.now()) / 1000));
			res.setHeader('X-RateLimit-Limit', String(rl.limit ?? DAILY_QUOTA));
			res.setHeader('X-RateLimit-Remaining', '0');
			res.setHeader('X-RateLimit-Reset', String(resetSec));
			res.setHeader('Retry-After', String(resetSec));
			return json(res, 429, {
				error: 'quota_exceeded',
				error_description: `Free text→3D is capped at ${DAILY_QUOTA} generations per day per IP. Your quota resets in ${resetSec}s.`,
				retry_after: resetSec,
				reset_seconds: resetSec,
				quota: { limit: rl.limit ?? DAILY_QUOTA, window: '24h' },
				// Not a paywall — a doorway. The paid forge tiers have no daily cap and
				// add higher quality/volume for agents that outgrow the free lane.
				upgrade: {
					message: 'Need higher volume or quality? The paid forge tiers have no daily cap.',
					endpoint: PAID_FORGE_ENDPOINT,
					docs: '/docs/api-reference',
				},
			});
		}

		const base = originFromReq(req);
		let job;
		try {
			job = await startForge(base, { prompt, backend: 'nvidia', path: 'image', tier: 'draft' });
		} catch (err) {
			failFromLane(err);
		}

		return shapeResult(job, base);
	},
});
