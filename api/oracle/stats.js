/**
 * Oracle — global platform conviction stats.
 *
 *   GET /api/oracle/stats?network=mainnet
 *
 * Returns a fast summary of the oracle engine's current state:
 *   scored_24h     — coins scored in the last 24 h
 *   scored_total   — all-time scored coins in oracle_conviction
 *   prime_count    — coins currently sitting at prime tier (score ≥ 86)
 *   strong_count   — coins at strong tier
 *   win_rate       — % of resolved calls that were positive outcomes (ath ≥ 2 or graduated)
 *   total_resolved — how many calls have an outcome at all
 *   total_wins     — resolved calls that were positive
 *   best_ath       — highest ATH multiple ever recorded for an oracle-called coin
 *   open_actions   — oracle_watch_actions rows still open (not yet settled)
 *   agents_armed   — distinct agent_ids currently armed (armed = true)
 *
 * Public, no auth, aggressively cached (60s). Used by the dashboard
 * overview card and the oracle landing-page hero.
 */

import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';

const NETWORKS = new Set(['mainnet', 'devnet']);

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params  = new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams;
	const network = NETWORKS.has(params.get('network')) ? params.get('network') : 'mainnet';

	const [convRow, actRow, outcomeRow, armedRow] = await Promise.all([
		// Conviction table summary.
		sql`
			select
				count(*)                                                                   as scored_total,
				count(*) filter (where scored_at >= now() - interval '24 hours')           as scored_24h,
				count(*) filter (where tier = 'prime')                                     as prime_count,
				count(*) filter (where tier = 'strong')                                    as strong_count
			from oracle_conviction
			where network = ${network}
		`.catch(() => [{}]),

		// Open oracle_watch_actions (not yet settled).
		sql`
			select count(*) as open_actions
			from oracle_watch_actions
			where network = ${network}
			  and outcome = 'open'
		`.catch(() => [{}]),

		// Outcome win-rate: only rows where the oracle called the coin AND we have an outcome.
		sql`
			select
				count(*)                                                            as total_resolved,
				count(*) filter (where o.ath_multiple >= 2 or o.graduated)         as total_wins,
				round(max(o.ath_multiple)::numeric, 2)                             as best_ath
			from oracle_conviction c
			join pump_coin_outcomes o on o.mint = c.mint and o.network = c.network
			where c.network = ${network}
		`.catch(() => [{}]),

		// Distinct armed agents.
		sql`
			select count(distinct agent_id) as agents_armed
			from oracle_agent_watches
			where network = ${network}
			  and armed = true
		`.catch(() => [{}]),
	]);

	const c  = convRow[0]    || {};
	const a  = actRow[0]     || {};
	const o  = outcomeRow[0] || {};
	const ar = armedRow[0]   || {};

	const totalResolved = Number(o.total_resolved) || 0;
	const totalWins     = Number(o.total_wins)     || 0;
	const winRate       = totalResolved > 0 ? Math.round((totalWins / totalResolved) * 100) : null;

	return json(res, 200, {
		network,
		scored_24h:     Number(c.scored_24h)    || 0,
		scored_total:   Number(c.scored_total)  || 0,
		prime_count:    Number(c.prime_count)   || 0,
		strong_count:   Number(c.strong_count)  || 0,
		open_actions:   Number(a.open_actions)  || 0,
		total_resolved: totalResolved,
		total_wins:     totalWins,
		win_rate:       winRate,
		best_ath:       o.best_ath != null ? Number(o.best_ath) : null,
		agents_armed:   Number(ar.agents_armed) || 0,
	}, {
		'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120',
	});
});
