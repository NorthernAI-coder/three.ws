/**
 * Oracle — conviction accuracy backtest.
 *
 *   GET /api/oracle/backtest?period=7d&tier=prime&network=mainnet
 *
 * Joins oracle_conviction (what the engine scored) against pump_coin_outcomes
 * (ground truth: graduated, rugged, ATH multiple) and returns hit-rate stats
 * per tier. This is the honest answer to "does the oracle engine actually work?"
 *
 * Only coins with a resolved outcome are counted — open positions are excluded
 * from the win-rate calculation so the denominator is accurate.
 *
 * Params:
 *   period   — 1d | 7d | 30d | 90d | all (default: 30d)
 *   tier     — prime | strong | lean | watch | avoid | all (default: all)
 *   network  — mainnet | devnet (default: mainnet)
 *
 * Cached for 5 minutes — the DB table is large and this query is expensive.
 */

import { cors, json, method, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';

const PERIODS = { '1d': 1, '7d': 7, '30d': 30, '90d': 90, 'all': null };
const TIERS = new Set(['prime', 'strong', 'lean', 'watch', 'avoid', 'all']);
const TIER_ORDER = { prime: 5, strong: 4, lean: 3, watch: 2, avoid: 1 };
const NETWORKS = new Set(['mainnet', 'devnet']);

const CACHE_TTL_MS = 5 * 60_000;
const _cache = new Map(); // key → { data, at }

function cacheKey(period, tier, network) { return `${period}:${tier}:${network}`; }

async function query(days, tier, network) {
	const key = cacheKey(days, tier, network);
	const hit = _cache.get(key);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

	// ── per-tier breakdown ────────────────────────────────────────────────────
	const tierFilter = tier !== 'all' ? sql`and c.tier = ${tier}` : sql``;
	const periodFilter = days != null ? sql`and c.scored_at >= now() - (${days} || ' days')::interval` : sql``;

	const rows = await sql`
		select
			c.tier,
			count(*)::int                                                                 as total,
			count(*) filter (where o.graduated or o.ath_multiple >= 2)::int              as wins,
			count(*) filter (where o.rugged or (o.ath_multiple is not null and o.ath_multiple < 1.2 and not o.graduated))::int as losses,
			count(*) filter (where o.ath_multiple is not null)::int                       as with_ath,
			round(avg(o.ath_multiple)::numeric, 2)                                        as avg_ath,
			round(percentile_cont(0.5) within group (order by o.ath_multiple)::numeric, 2) as median_ath,
			count(*) filter (where o.ath_multiple >= 3)::int                             as three_x,
			count(*) filter (where o.ath_multiple >= 5)::int                             as five_x,
			count(*) filter (where o.ath_multiple >= 10)::int                            as ten_x,
			count(*) filter (where o.graduated)::int                                      as graduated,
			count(*) filter (where o.rugged)::int                                         as rugged
		from oracle_conviction c
		join pump_coin_outcomes o on o.mint = c.mint and o.network = c.network
		where c.network = ${network}
		  and (o.graduated or o.rugged or o.ath_multiple is not null)
		  ${tierFilter}
		  ${periodFilter}
		group by c.tier
		order by min(case c.tier when 'prime' then 5 when 'strong' then 4 when 'lean' then 3 when 'watch' then 2 when 'avoid' then 1 else 0 end) desc
	`;

	// ── aggregate across tiers ────────────────────────────────────────────────
	let agg = { total: 0, wins: 0, losses: 0, three_x: 0, five_x: 0, ten_x: 0, graduated: 0, rugged: 0 };
	for (const r of rows) {
		agg.total += r.total;
		agg.wins += r.wins;
		agg.losses += r.losses;
		agg.three_x += r.three_x;
		agg.five_x += r.five_x;
		agg.ten_x += r.ten_x;
		agg.graduated += r.graduated;
		agg.rugged += r.rugged;
	}
	const resolved = agg.wins + agg.losses;
	agg.win_rate = resolved ? Math.round((agg.wins / resolved) * 100) : null;

	// ── top performers in the period ─────────────────────────────────────────
	const topFilter = days != null ? sql`and c.scored_at >= now() - (${days} || ' days')::interval` : sql``;
	const topTierFilter = tier !== 'all' ? sql`and c.tier = ${tier}` : sql``;
	const top = await sql`
		select c.mint, c.symbol, c.name, c.score, c.tier, o.ath_multiple, o.graduated, o.rugged
		from oracle_conviction c
		join pump_coin_outcomes o on o.mint = c.mint and o.network = c.network
		where c.network = ${network}
		  and o.ath_multiple is not null
		  ${topTierFilter}
		  ${topFilter}
		order by o.ath_multiple desc nulls last
		limit 10
	`;

	const data = {
		period: days != null ? `${days}d` : 'all',
		tier,
		network,
		by_tier: rows.map((r) => ({
			tier: r.tier,
			total: r.total,
			wins: r.wins,
			losses: r.losses,
			win_rate: (r.wins + r.losses) > 0 ? Math.round((r.wins / (r.wins + r.losses)) * 100) : null,
			avg_ath: r.avg_ath ? Number(r.avg_ath) : null,
			median_ath: r.median_ath ? Number(r.median_ath) : null,
			three_x: r.three_x,
			five_x: r.five_x,
			ten_x: r.ten_x,
			graduated: r.graduated,
			rugged: r.rugged,
		})),
		aggregate: agg,
		top_performers: top.map((r) => ({
			mint: r.mint,
			symbol: r.symbol,
			name: r.name,
			score: r.score,
			tier: r.tier,
			ath_multiple: r.ath_multiple ? Number(r.ath_multiple) : null,
			graduated: r.graduated,
			rugged: r.rugged,
		})),
	};

	_cache.set(key, { data, at: Date.now() });
	return data;
}

export default async function handleOracleBacktest(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, 'http://x').searchParams;
	const periodKey = PERIODS.hasOwnProperty(params.get('period')) ? params.get('period') : '30d';
	const days = PERIODS[periodKey];
	const tier = TIERS.has(params.get('tier')) ? params.get('tier') : 'all';
	const network = NETWORKS.has(params.get('network')) ? params.get('network') : 'mainnet';

	try {
		const data = await query(days, tier, network);
		return json(res, 200, data, { 'cache-control': 'public, max-age=300, s-maxage=300' });
	} catch (err) {
		console.error('[oracle/backtest]', err);
		return json(res, 503, { error: 'backtest_unavailable', message: 'Could not run backtest query.' });
	}
}
