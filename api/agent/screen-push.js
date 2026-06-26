// POST /api/agent/screen-push
//
// Agent processes (Playwright runners, autonomous workers) push their current
// screen state here. Two payload shapes are accepted:
//
//   Frame push (screenshot):
//   { agentId, frame: '<base64 PNG>', seq?: number }
//   → stored as screen:frame:<agentId> with 10-second TTL.
//
//   Activity push (structured log):
//   { agentId, actions: [{ type, summary, payload?, ts? }] }
//   → stored as screen:activity:<agentId> with 30-second TTL.
//
// Auth: requires a valid bearer token for a user that owns the agent, OR the
// agent's own bearer token (AGENT_BEARER environment variable on the worker).
// Rate: 12 frame pushes/second per agentId (burst) to prevent flooding.

import { cors, json, method, readJson, wrap, error, rateLimited } from '../_lib/http.js';
import { cacheSet } from '../_lib/cache.js';
import { getSessionUser, authenticateBearer } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { limits, clientIp } from '../_lib/rate-limit.js';

const FRAME_TTL_S    = 10;
const ACTIVITY_TTL_S = 30;

// Validate base64 string length — limit 1 MB of base64 ≈ 768 KB PNG.
const MAX_FRAME_B64 = 1_400_000;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	// Auth: must be the agent owner (session or bearer) OR a pre-shared agent key.
	const auth = await getSessionUser(req).catch(() => null)
		|| await authenticateBearer(req).catch(() => null);
	if (!auth?.userId) return error(res, 401, 'unauthorized', 'sign in required');

	const body = await readJson(req, res);
	if (!body) return;
	const { agentId, frame, actions, seq } = body;

	if (!agentId) return error(res, 400, 'validation_error', 'agentId required');

	// Verify ownership.
	const [row] = await sql`
		SELECT id FROM agent_identities
		WHERE id = ${agentId} AND user_id = ${auth.userId} AND deleted_at IS NULL
	`;
	if (!row) return error(res, 403, 'forbidden', 'not your agent');

	// Rate limit per agent — 12 pushes/second burst.
	const ip = clientIp(req);
	const rlKey = `screen-push:${agentId}:${ip}`;
	if (rateLimited(rlKey, { ...limits.api, max: 12, window: 1 }))
		return error(res, 429, 'rate_limited', 'too many pushes');

	const now = Date.now();

	if (frame != null) {
		// Frame push.
		if (typeof frame !== 'string') return error(res, 400, 'validation_error', 'frame must be a base64 string');
		if (frame.length > MAX_FRAME_B64) return error(res, 413, 'payload_too_large', 'frame exceeds 1 MB');
		const storedSeq = typeof seq === 'number' ? seq : now;
		await cacheSet(`screen:frame:${agentId}`, { frame, seq: storedSeq, ts: now }, FRAME_TTL_S);
		return json(res, 200, { ok: true, type: 'frame', seq: storedSeq });
	}

	if (actions != null) {
		// Activity push.
		if (!Array.isArray(actions)) return error(res, 400, 'validation_error', 'actions must be an array');
		const safe = actions.slice(0, 50).map((a) => ({
			type:    String(a?.type    || 'action').slice(0, 64),
			summary: String(a?.summary || '').slice(0, 256),
			payload: a?.payload || null,
			ts:      typeof a?.ts === 'number' ? a.ts : now,
		}));
		await cacheSet(`screen:activity:${agentId}`, { actions: safe, ts: now }, ACTIVITY_TTL_S);
		return json(res, 200, { ok: true, type: 'activity', count: safe.length });
	}

	return error(res, 400, 'validation_error', 'provide either frame or actions');
});
