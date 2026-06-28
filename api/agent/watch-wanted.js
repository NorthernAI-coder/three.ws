// GET /api/agent/watch-wanted  →  { agents: [{ agentId, name, lastSeen }], ts }
//
// Read side of the on-demand caster pool. The pool worker polls this to learn
// which agents viewers are currently watching, then maintains a bounded pool of
// real Playwright browsers casting exactly those agents (see
// workers/agent-screen-pool). Agents fall out of the window automatically once
// nobody is watching, so the worker can tear their browsers down.
//
// Auth: the shared first-party worker secret (SCREEN_WORKER_SECRET) — the same
// secret the worker uses to push frames for any agent. Without it configured the
// endpoint reports the pool as disabled rather than leaking the watch set.

import { timingSafeEqual } from 'node:crypto';
import { cors, json, method, error, wrap } from '../_lib/http.js';
import { getRedis } from '../_lib/redis.js';
import { sql } from '../_lib/db.js';
import { extractBearer } from '../_lib/auth.js';

const WANTED_KEY = 'screen:wanted';
const WINDOW_MS = 90_000; // agents wanted within the last 90s are "live-watched"
const MAX_AGENTS = 48;    // hard cap returned to the worker

const WORKER_SECRET = process.env.SCREEN_WORKER_SECRET || '';
function isPoolWorker(bearer) {
	if (!bearer || !WORKER_SECRET || WORKER_SECRET.length < 16) return false;
	const a = Buffer.from(bearer);
	const b = Buffer.from(WORKER_SECRET);
	return a.length === b.length && timingSafeEqual(a, b);
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	if (!WORKER_SECRET || WORKER_SECRET.length < 16) {
		return json(res, 200, { agents: [], disabled: true, reason: 'SCREEN_WORKER_SECRET not configured' });
	}
	if (!isPoolWorker(extractBearer(req))) {
		return error(res, 401, 'unauthorized', 'pool worker secret required');
	}

	const r = getRedis();
	if (!r) return json(res, 200, { agents: [], ts: Date.now() });

	const now = Date.now();
	let ids = [];
	try {
		// Most-recently-wanted first, capped.
		const raw = await r.zrange(WANTED_KEY, now, now - WINDOW_MS, {
			byScore: true,
			rev: true,
			offset: 0,
			count: MAX_AGENTS,
		});
		ids = Array.isArray(raw) ? raw.slice(0, MAX_AGENTS) : [];
	} catch {
		return json(res, 200, { agents: [], ts: now });
	}

	if (!ids.length) return json(res, 200, { agents: [], ts: now });

	// Resolve names + a coin-agnostic home so the worker knows where to point the
	// browser for each agent (its profile by default).
	let rows = [];
	try {
		rows = await sql`
			SELECT id, name, home_url
			FROM agent_identities
			WHERE id = ANY(${ids}) AND deleted_at IS NULL
		`;
	} catch { /* fall through with ids only */ }

	const byId = new Map(rows.map((x) => [x.id, x]));
	const agents = ids
		.filter((id) => byId.has(id))
		.map((id) => {
			const a = byId.get(id);
			return {
				agentId: id,
				name: a.name || 'Agent',
				homeUrl: a.home_url || `/agent/${id}`,
			};
		});

	return json(res, 200, { agents, ts: now }, { 'cache-control': 'no-store' });
});
