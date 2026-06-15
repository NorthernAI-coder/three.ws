/**
 * Coin Intelligence — public read API.
 *
 *   GET /api/pump/coin-intel?mint=<mint>          → full intel for one coin
 *       &wallets=1                                  ...with the top-trader ledger
 *   GET /api/pump/coin-intel                       → live radar feed (newest first)
 *       &limit=50&min_quality=60&category=ai&network=mainnet&flag=bundle_launch
 *
 * The Coin Intelligence Engine (workers/agent-sniper/intel) watches every new
 * pump.fun coin's first seconds of trading, derives bundle/organic/concentration
 * signals, classifies it, and persists here. Any agent — user-built, MCP, or
 * external — reads the same intelligence the autonomous sniper uses. Public +
 * IP rate-limited; every number traces to an on-chain trade we observed.
 */

import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';

const NETWORKS = new Set(['mainnet', 'devnet']);
const CATEGORIES = new Set([
	'meme', 'tech', 'ai', 'culture', 'community',
	'political', 'news', 'animal', 'celebrity', 'utility', 'unknown',
]);

const lamportsToSol = (v) => (v == null ? null : Number(BigInt(v)) / 1e9);

function shapeRow(r) {
	return {
		mint: r.mint,
		network: r.network,
		symbol: r.symbol,
		name: r.name,
		creator: r.creator,
		image_uri: r.image_uri,
		description: r.description,
		socials: { twitter: r.twitter, telegram: r.telegram, website: r.website },
		created_at: r.created_at,
		first_seen_at: r.first_seen_at,
		observation_seconds: r.observation_seconds,
		// headline signals
		quality_score: r.quality_score,
		bundle_score: r.bundle_score != null ? Number(r.bundle_score) : null,
		organic_score: r.organic_score != null ? Number(r.organic_score) : null,
		snipe_ratio: r.snipe_ratio != null ? Number(r.snipe_ratio) : null,
		concentration_top10: r.concentration_top10 != null ? Number(r.concentration_top10) : null,
		fresh_wallet_ratio: r.fresh_wallet_ratio != null ? Number(r.fresh_wallet_ratio) : null,
		bubblemap_connectivity: r.bubblemap_connectivity != null ? Number(r.bubblemap_connectivity) : null,
		risk_flags: r.risk_flags || [],
		// classification
		category: r.category,
		tags: r.tags || [],
		narrative: r.narrative,
		classify_confidence: r.classify_confidence != null ? Number(r.classify_confidence) : null,
		classify_source: r.classify_source,
		// aggregates
		dev_buy_sol: lamportsToSol(r.dev_buy_lamports),
		dev_sold: r.dev_sold,
		buy_count: r.buy_count,
		sell_count: r.sell_count,
		buy_volume_sol: lamportsToSol(r.buy_volume_lamports),
		sell_volume_sol: lamportsToSol(r.sell_volume_lamports),
		unique_buyers: r.unique_buyers,
		unique_sellers: r.unique_sellers,
		largest_buy_sol: lamportsToSol(r.largest_buy_lamports),
		signals: r.signals || {},
	};
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams;
	const network = NETWORKS.has(params.get('network')) ? params.get('network') : 'mainnet';
	const mint = params.get('mint');

	// ── single coin ───────────────────────────────────────────────────────────
	if (mint) {
		if (mint.length < 32 || mint.length > 64) return json(res, 400, { error: 'invalid mint' });
		const [row] = await sql`select * from pump_coin_intel where mint = ${mint} limit 1`;
		if (!row) {
			return json(res, 404, { error: 'not_found', mint, hint: 'coin not observed (too old, or launched before the intel engine, or still mid-observation)' });
		}
		const out = shapeRow(row);

		const [outcome] = await sql`
			select graduated, rugged, outcome, ath_multiple, ath_market_cap_usd, last_market_cap_usd, labeled_at
			from pump_coin_outcomes where mint = ${mint} limit 1
		`;
		out.outcome = outcome
			? {
				outcome: outcome.outcome, graduated: outcome.graduated, rugged: outcome.rugged,
				ath_multiple: outcome.ath_multiple != null ? Number(outcome.ath_multiple) : null,
				ath_market_cap_usd: outcome.ath_market_cap_usd != null ? Number(outcome.ath_market_cap_usd) : null,
				last_market_cap_usd: outcome.last_market_cap_usd != null ? Number(outcome.last_market_cap_usd) : null,
				labeled_at: outcome.labeled_at,
			}
			: null;

		if (params.get('wallets') === '1') {
			const wallets = await sql`
				select wallet, buy_count, sell_count, buy_lamports, sell_lamports,
				       is_creator, funder, first_seen_at, last_seen_at
				from pump_coin_wallets where mint = ${mint}
				order by (buy_lamports + sell_lamports) desc
				limit 50
			`;
			out.wallets = wallets.map((w) => ({
				wallet: w.wallet,
				buy_count: w.buy_count,
				sell_count: w.sell_count,
				buy_sol: lamportsToSol(w.buy_lamports),
				sell_sol: lamportsToSol(w.sell_lamports),
				net_sol: lamportsToSol(w.buy_lamports) - lamportsToSol(w.sell_lamports),
				is_creator: w.is_creator,
				funder: w.funder,
			}));
		}

		return json(res, 200, out, { 'cache-control': 'public, max-age=15, s-maxage=30' });
	}

	// ── radar feed ──────────────────────────────────────────────────────────────
	const limit = Math.max(1, Math.min(100, parseInt(params.get('limit'), 10) || 50));
	const minQuality = params.get('min_quality') != null ? parseInt(params.get('min_quality'), 10) : null;
	const category = CATEGORIES.has(params.get('category')) ? params.get('category') : null;
	const flag = params.get('flag') || null;

	const rows = await sql`
		select * from pump_coin_intel
		where network = ${network}
		  and (${Number.isFinite(minQuality) ? minQuality : null}::int is null or quality_score >= ${Number.isFinite(minQuality) ? minQuality : null})
		  and (${category}::text is null or category = ${category})
		  and (${flag}::text is null or ${flag} = any(risk_flags))
		order by first_seen_at desc
		limit ${limit}
	`;

	return json(res, 200, {
		network,
		count: rows.length,
		coins: rows.map(shapeRow),
		t: Date.now(),
	}, { 'cache-control': 'public, max-age=10, s-maxage=20' });
});
