// POST /api/agent-task — user queues a task for their agent
// GET  /api/agent-task?agentId=X — worker polls for its next task (bearer auth)
//
// Redis key: agent:task:{agentId}  (LIST, LPUSH / RPOP)
// The worker drains one task per poll; tasks stay ordered FIFO.
//
// POST body: { agentId: string, task: string, type?: string }
// GET  resp: { task: { text, type, ts, userId } | null }

import { cors, error, json, method, rateLimited } from './_lib/http.js';
import { getSessionUser, authenticateBearer, extractBearer } from './_lib/auth.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { getRedis } from './_lib/redis.js';
import { sql } from './_lib/db.js';

const TASK_KEY = (id) => `agent:task:${id}`;
const FRAME_KEY = (id) => `agent:screen:${id}:frame`;
const MAX_QUEUE = 20;
const TASK_TTL = 60 * 60 * 6; // 6h — tasks expire if worker never shows up
const TASK_MAX_LEN = 1000;

export default async function handleAgentTask(req, res) {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS' })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	// ── Auth: bearer (worker) OR session (browser user) ─────────────────────
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

	const r = getRedis();
	if (!r) return error(res, 503, 'redis_unavailable', 'task store offline');

	// ── GET — worker polls for next task ─────────────────────────────────────
	if (req.method === 'GET') {
		const agentId = (new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams.get('agentId') || '').trim();
		if (!agentId) return error(res, 400, 'missing_agent_id', 'agentId required');

		// Verify the polling identity owns this agent
		const [agentRow] = await sql`
			SELECT id FROM agents WHERE id = ${agentId} AND user_id = ${userId} LIMIT 1
		`;
		if (!agentRow) return error(res, 403, 'forbidden', 'agent not owned by this user');

		// RPOP = FIFO: oldest task first
		const raw = await r.rpop(TASK_KEY(agentId));
		if (!raw) return json(res, 200, { task: null });

		let task;
		try {
			task = JSON.parse(raw);
		} catch {
			task = { text: String(raw), type: 'general', ts: Date.now() };
		}

		return json(res, 200, { task });
	}

	// ── POST — user enqueues a task ───────────────────────────────────────────
	if (req.method === 'POST') {
		// Rate limit: 20 tasks/min per IP
		const rl = await limits.apiIp(clientIp(req), { limit: 20, window: '60s' });
		if (!rl.success) return error(res, 429, 'rate_limited', 'too many tasks — slow down');

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

		const { agentId, task, type = 'general' } = body || {};

		if (!agentId || typeof agentId !== 'string') {
			return error(res, 400, 'missing_agent_id', 'agentId is required');
		}
		if (!task || typeof task !== 'string' || !task.trim()) {
			return error(res, 400, 'missing_task', 'task text is required');
		}

		const text = task.trim().slice(0, TASK_MAX_LEN);
		const taskType = ['general', 'research', 'trade', 'browse', 'monitor'].includes(type)
			? type : 'general';

		// Verify ownership
		const [agentRow] = await sql`
			SELECT id, name FROM agents WHERE id = ${agentId} AND user_id = ${userId} LIMIT 1
		`;
		if (!agentRow) return error(res, 403, 'forbidden', 'agent not owned by this user');

		const now = Date.now();
		const record = JSON.stringify({ text, type: taskType, ts: now, userId });

		// Push task to queue; trim to MAX_QUEUE
		const len = await r.lpush(TASK_KEY(agentId), record);
		await Promise.all([
			r.expire(TASK_KEY(agentId), TASK_TTL),
			len > MAX_QUEUE ? r.ltrim(TASK_KEY(agentId), 0, MAX_QUEUE - 1) : Promise.resolve(),
			// Immediately notify the live stream so the watch panel shows the task
			r.set(
				FRAME_KEY(agentId),
				JSON.stringify({ ts: now, activity: `Task queued: ${text}`, type: 'analysis' }),
				{ ex: 90 },
			),
		]);

		return json(res, 200, { ok: true, queued: Math.min(len, MAX_QUEUE) });
	}
}
