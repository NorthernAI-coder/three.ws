/**
 * Oracle — proven wins gallery.
 *
 *   GET /api/oracle/wins
 *       ?network=mainnet     default: mainnet
 *       &period=7d|30d|90d|all  default: 30d
 *       &tier=prime|strong|lean|all  default: all
 *       &min_ath=1           minimum ATH multiple to include
 *       &limit=50            max 100
 *       &before=<iso>        pagination cursor (scored_at <)
 *
 * Returns oracle_conviction rows that have a resolved outcome in
 * pump_coin_outcomes, ordered by ATH multiple descending. This is the
 * "proof of edge" view — coins the oracle called and that subsequently
 * delivered measurable returns.
 *
 * Only includes entries with a positive outcome (graduated OR ath_multiple ≥ 2).
 * Losses/duds are not shown here — that's the backtest endpoint.
 *
 * Public, IP rate-limited, 5-min CDN cache.
 */

import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';

const NETWORKS = new Set(['mainnet', 'devnet']);
const TIERS    = new Set(['prime', 'strong', 'lean', 'watch', 'avoid', 'all']);
const PERIODS  = { '7d': 7, '30d': 30, '90d': 90, 'all': null };

function shapeRow(r) {
	return {
		mint:              r.mint,
		symbol:            r.symbol    || r.mint.slice(0, 6),
		name:              r.name      || null,
		image_uri:         r.image_uri || null,
		tier:              r.tier,
		score:             r.score     != null ? Number(r.score)           : null,
		category:          r.category  || null,
		// Conviction pillars at entry time
		pillars: {
			pedigree:  r.pedigree  != null ? Number(r.pedigree)  : null,
			structure: r.structure != null ? Number(r.structure) : null,
			narrative: r.narrative != null ? Number(r.narrative) : null,
			momentum:  r.momentum  != null ? Number(r.momentum)  : null,
		},
		scored_at:         r.scored_at,
		// Outcome
		ath_multiple:      r.ath_multiple  != null ? Number(r.ath_multiple)  : null,
		last_mc_usd:       r.last_market_cap_usd != null ? Number(r.last_market_cap_usd) : null,
		graduated:         !!r.graduated,
		// convenience
		pump_url: `https://pump.fun/coin/${r.mint}`,
		oracle_url: `/oracle?mint=${r.mint}`,
	};
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params  = new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams;
	const network = NETWORKS.has(params.get('network')) ? params.get('network') : 'mainnet';
	const periodKey = PERIODS.hasOwnProperty(params.get('period')) ? params.get('period') : '30d';
	const days    = PERIODS[periodKey];
	const tier    = TIERS.has(params.get('tier'))    ? params.get('tier')    : 'all';
	const minAth  = Math.max(1, Number(params.get('min_ath')) || 2);
	const limit   = Math.max(1, Math.min(100, parseInt(params.get('limit'), 10) || 50));
	const before  = params.get('before') || null;

	const tierFilter   = tier !== 'all'  ? sql`and c.tier = ${tier}`           : sql``;
	const periodFilter = days != null     ? sql`and c.scored_at >= now() - (${days} || ' days')::interval` : sql``;
	const beforeFilter = before           ? sql`and c.scored_at < ${before}::timestamptz` : sql``;

	const rows = await sql`
		select
			c.mint, c.symbol, c.name, c.image_uri, c.tier, c.score, c.category,
			c.pedigree, c.structure, c.narrative, c.momentum, c.scored_at,
			o.ath_multiple, o.last_market_cap_usd, o.graduated
		from oracle_conviction c
		join pump_coin_outcomes o on o.mint = c.mint and o.network = c.network
		where c.network = ${network}
		  and o.ath_multiple >= ${minAth}
		  and (o.graduated or o.ath_multiple >= 2)
		  ${tierFilter}
		  ${periodFilter}
		  ${beforeFilter}
		order by o.ath_multiple desc nulls last, c.scored_at desc
		limit ${limit}
	`.catch((e) => {
		throw new Error(`wins query failed: ${e.message}`);
	});

	// Summary counts — total wins and best ATH in the period.
	const summary = await sql`
		select
			count(*)::int                                                           as total_wins,
			count(*) filter (where o.ath_multiple >= 5)::int                       as five_x_count,
			count(*) filter (where o.ath_multiple >= 10)::int                      as ten_x_count,
			round(max(o.ath_multiple)::numeric, 2)                                 as best_ath,
			count(*) filter (where o.graduated)::int                               as graduated_count
		from oracle_conviction c
		join pump_coin_outcomes o on o.mint = c.mint and o.network = c.network
		where c.network = ${network}
		  and o.ath_multiple >= ${minAth}
		  and (o.graduated or o.ath_multiple >= 2)
		  ${tierFilter}
		  ${periodFilter}
	`.catch(() => [{}]);

	const s = summary[0] || {};
	const items = rows.map(shapeRow);
	const next_before = items.length >= limit ? items[items.length - 1].scored_at : null;

	return json(res, 200, {
		network,
		period: periodKey,
		tier,
		summary: {
			total_wins:      s.total_wins      ?? 0,
			five_x_count:    s.five_x_count    ?? 0,
			ten_x_count:     s.ten_x_count     ?? 0,
			best_ath:        s.best_ath        ? Number(s.best_ath) : null,
			graduated_count: s.graduated_count ?? 0,
		},
		items,
		next_before,
	}, {
		'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
	});
});
