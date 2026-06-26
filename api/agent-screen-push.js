// POST /api/agent-screen-push — agent pushes a screen frame to the live feed.
//
// Agents (snipers, browser workers, autonomous scripts) POST here to publish
// what they're currently doing. Viewers subscribe via /api/agent-screen-stream.
//
// Body (JSON):
//   agentId   string   — UUID of the agent
//   frame     object   — { data?, activity, type }
//     data       string?  — base64 data URL (data:image/png;base64,…) or omit for text-only
//     activity   string   — plain-language description of what the agent is doing
//     type       string   — "screenshot" | "activity" | "trade" | "analysis"
//
// Auth: bearer JWT (same as other agent-authenticated endpoints). The agentId
// in the body must match the token's sub or an agent the user owns. Workers
// running as the agent itself use the agent's own JWT.
//
// Storage: Upstash Redis, key agent:screen:{agentId}:frame (TTL 90s — if the
// agent stops pushing, the stream goes dark automatically). A secondary list
// agent:screen:{agentId}:log holds the last 50 activity entries (no image data)
// for the activity log panel.

import { cors, error, json, method, wrap, rateLimited } from './_lib/http.js';
import { getSessionUser, authenticateBearer, extractBearer } from './_lib/auth.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { getRedis } from './_lib/redis.js';
import { sql } from './_lib/db.js';

const FRAME_TTL = 90; // seconds — stream goes dark if agent stops pushing
const LOG_CAP = 50; // activity log entries kept per agent
const DATA_MAX = 800_000; // ~600 KB base64 PNG max (approx 450 KB PNG)
const ACTIVITY_MAX = 320; // chars

export default async function handleAgentScreenPush(req, res) {
	if (cors(req, res, { methods: 'POST,OPTIONS' })) return;
	if (!method(req, res, ['POST'])) return;

	// Auth: bearer OR session
	let userId = null;
	const bearer = extractBearer(req);
	if (bearer) {
		const auth = await authenticateBearer(bearer).catch(() => null);
		if (auth?.userId) userId = auth.userId;
	}
	if (!userId) {
		const auth = await getSessionUser(req, res);
		if (auth?.id) userId = auth.id;
	}
	if (!userId) return error(res, 401, 'unauthorized', 'authentication required');

	// Rate limit: 6 frames/second per IP (generous for screenshot streams)
	const rl = await limits.apiIp(clientIp(req), { limit: 360, window: '60s' });
	if (!rl.success) return rateLimited(res, rl, 'frame rate limit exceeded');

	let body;
	try {
		const raw = await new Promise((resolve, reject) => {
			const chunks = [];
			req.on('data', (c) => chunks.push(c));
			req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
			req.on('error', reject);
		});
		body = JSON.parse(raw);
	} catch {
		return error(res, 400, 'invalid_body', 'request body must be valid JSON');
	}

	const { agentId, frame } = body || {};
	if (!agentId || typeof agentId !== 'string') {
		return error(res, 400, 'missing_agent_id', 'agentId is required');
	}
	if (!frame || typeof frame !== 'object') {
		return error(res, 400, 'missing_frame', 'frame object is required');
	}

	const activity = String(frame.activity || '').slice(0, ACTIVITY_MAX);
	const type = ['screenshot', 'activity', 'trade', 'analysis'].includes(frame.type)
		? frame.type : 'activity';
	const data = typeof frame.data === 'string' && frame.data.startsWith('data:image/')
		? frame.data.slice(0, DATA_MAX) : null;

	// Verify the calling user owns this agent
	const [agentRow] = await sql`
		SELECT id FROM agents WHERE id = ${agentId} AND user_id = ${userId} LIMIT 1
	`;
	if (!agentRow) return error(res, 403, 'forbidden', 'agent not owned by this user');

	const r = getRedis();
	if (!r) return error(res, 503, 'redis_unavailable', 'frame store offline');

	const now = Date.now();
	const frameKey = `agent:screen:${agentId}:frame`;
	const logKey = `agent:screen:${agentId}:log`;

	// Full frame record (includes image data when present)
	const frameRecord = JSON.stringify({ ts: now, data, activity, type, agentId });

	// Log entry (no image — the activity log only needs text + metadata)
	const logEntry = JSON.stringify({ ts: now, activity, type });

	await Promise.all([
		r.set(frameKey, frameRecord, { ex: FRAME_TTL }),
		r.lpush(logKey, logEntry).then(() => r.ltrim(logKey, 0, LOG_CAP - 1)),
		r.expire(logKey, FRAME_TTL * 5),
	]);

	return json(res, 200, { ok: true, ts: now });
}
