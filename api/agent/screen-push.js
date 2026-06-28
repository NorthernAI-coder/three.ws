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

import { timingSafeEqual } from 'node:crypto';
import { cors, json, method, readJson, wrap, error, rateLimited } from '../_lib/http.js';
import { cacheSet } from '../_lib/cache.js';
import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { limits, clientIp } from '../_lib/rate-limit.js';

// First-party on-demand caster pool authenticates with a shared secret and may
// push frames for ANY agent (it casts whichever agents viewers are watching).
const WORKER_SECRET = process.env.SCREEN_WORKER_SECRET || '';
function isPoolWorker(bearer) {
	if (!bearer || !WORKER_SECRET || WORKER_SECRET.length < 16) return false;
	const a = Buffer.from(bearer);
	const b = Buffer.from(WORKER_SECRET);
	return a.length === b.length && timingSafeEqual(a, b);
}

const FRAME_TTL_S    = 10;
const ACTIVITY_TTL_S = 30;

// Validate base64 string length — limit 1 MB of base64 ≈ 768 KB PNG.
const MAX_FRAME_B64 = 1_400_000;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	// Auth: first-party pool worker (shared secret, any agent), the agent's own
	// bearer (worker), OR the owner's session. Bearer first so headless workers
	// authenticate without a cookie.
	let userId = null;
	let isWorker = false;
	const bearer = extractBearer(req);
	if (isPoolWorker(bearer)) {
		isWorker = true;
	} else {
		if (bearer) {
			const a = await authenticateBearer(bearer).catch(() => null);
			if (a?.userId) userId = a.userId;
		}
		if (!userId) {
			const a = await getSessionUser(req, res).catch(() => null);
			if (a?.id) userId = a.id;
		}
		if (!userId) return error(res, 401, 'unauthorized', 'sign in required');
	}

	// Rate limit before reading the body so a flood can't force large buffers.
	const rl = await limits.apiIp(clientIp(req), { limit: 720, window: '60s' });
	if (!rl.success) return rateLimited(res, rl, 'too many pushes');

	const body = await readJson(req, MAX_FRAME_B64 + 4_000).catch(() => null);
	if (!body) return error(res, 400, 'invalid_body', 'request body must be valid JSON');
	const { agentId, frame, actions, seq } = body;

	if (!agentId) return error(res, 400, 'validation_error', 'agentId required');

	// Ownership: the pool worker may cast any existing agent; owners only their own.
	const [row] = isWorker
		? await sql`SELECT id FROM agent_identities WHERE id = ${agentId} AND deleted_at IS NULL`
		: await sql`SELECT id FROM agent_identities WHERE id = ${agentId} AND user_id = ${userId} AND deleted_at IS NULL`;
	if (!row) return error(res, isWorker ? 404 : 403, isWorker ? 'not_found' : 'forbidden', isWorker ? 'agent not found' : 'not your agent');

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
