// POST /api/agent/watch-intent  { agentId }
//
// Signals that a viewer is actively watching an agent right now. The on-demand
// caster pool (workers/agent-screen-pool) reads these signals and spins up a
// real Playwright browser for the most-wanted agents, tearing them down when
// nobody is watching. This is what makes a live browser feed available for ANY
// agent on demand without paying for an idle browser per agent.
//
// Public + IP rate-limited: anyone looking at the live wall or an agent screen
// can express intent. We store intent in a Redis sorted set keyed by recency, so
// stale entries fall out of the window automatically — no auth, no DB write.
//
//   ZADD screen:wanted  <now>  <agentId>     (score = last-seen ms)
//   ZADD screen:wanted:count:<agentId> tracked via the score being refreshed.
//
// The worker reads /api/agent/watch-wanted to get the current set.

import { cors, json, method, error, readJson, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { getRedis } from '../_lib/redis.js';
import { isUuid } from '../_lib/validate.js';

export const WANTED_KEY = 'screen:wanted';
const PRUNE_WINDOW_MS = 120_000; // drop intents older than 2 minutes

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS' })) return;
	if (!method(req, res, ['POST'])) return;

	// Generous per-IP limit: a watcher re-pings every ~20s per card, and the live
	// wall may show dozens of cards at once.
	const rl = await limits.apiIp(clientIp(req), { limit: 600, window: '60s' });
	if (!rl.success) return rateLimited(res, rl);

	const body = await readJson(req, 2_000).catch(() => null);
	const agentId = body && typeof body.agentId === 'string' ? body.agentId.trim() : '';
	if (!isUuid(agentId)) return error(res, 400, 'validation_error', 'valid agentId required');

	const r = getRedis();
	if (!r) return json(res, 200, { ok: true, queued: false }); // no pool without Redis — the activity view still works

	const now = Date.now();
	try {
		await Promise.all([
			r.zadd(WANTED_KEY, { score: now, member: agentId }),
			r.zremrangebyscore(WANTED_KEY, 0, now - PRUNE_WINDOW_MS),
			r.expire(WANTED_KEY, 300),
		]);
	} catch { /* non-critical — the wall degrades to the activity view */ }

	return json(res, 200, { ok: true, queued: true });
});
