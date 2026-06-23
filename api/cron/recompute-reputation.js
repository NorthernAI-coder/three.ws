// @ts-check
// GET/POST /api/cron/recompute-reputation — refresh persisted agent reputation.
//
// The per-agent endpoint computes a score live and caches it in Redis for a few
// minutes; that's great for a viewed agent but ephemeral. This cron keeps a
// DURABLE score for every agent with a custodial wallet in agent_reputation_scores
// so the reputation-weighted leaderboard, the access/unlock checks, and "your
// score changed" all read a fresh, consistent number for the cost of one DB query.
//
// Each run recomputes the stalest batch (never-scored first, then old-version,
// then oldest) within the cron time budget, so the whole population rolls over
// continuously without any single run going long. Bounded so a large agent
// population never blows the function timeout.
//
// Standalone (not [name].js) so the import graph stays minimal.

import { json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { listStaleAgents, recomputeAgents } from '../_lib/trust/reputation-store.js';

// How many agents to recompute per tick. Each is a handful of indexed DB reads
// plus (for full mode) one cached price + light RPC; 40 fits comfortably in the
// cron budget and, at a 10-minute cadence, rolls a few thousand agents per hour.
const BATCH = 40;

// Vercel cron invokes with `Authorization: Bearer <CRON_SECRET>`; manual probes
// may use `X-Cron-Secret: <CRON_SECRET>`. Accept either, constant-time.
function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		json(res, 503, { ok: false, reason: 'CRON_SECRET unset' });
		return false;
	}
	const auth = req.headers['authorization'] || '';
	const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	const header = req.headers['x-cron-secret'] || '';
	if (constantTimeEquals(bearer, secret) || constantTimeEquals(header, secret)) return true;
	json(res, 401, { ok: false, error: 'invalid cron secret' });
	return false;
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	const started = Date.now();
	try {
		const ids = await listStaleAgents(BATCH);
		if (!ids.length) {
			return json(res, 200, { ok: true, scored: 0, failed: 0, reason: 'no agents to score' });
		}
		const { scored, failed } = await recomputeAgents(ids);
		console.log(`[recompute-reputation] scored ${scored}/${ids.length} (failed ${failed}) in ${Date.now() - started}ms`);
		return json(res, 200, { ok: true, scored, failed, batch: ids.length, elapsed_ms: Date.now() - started });
	} catch (err) {
		// Never throw: a failed run leaves the prior stored scores intact.
		console.error('[recompute-reputation] failed:', err?.message || err);
		return json(res, 200, { ok: false, error: err?.message || String(err) });
	}
});
