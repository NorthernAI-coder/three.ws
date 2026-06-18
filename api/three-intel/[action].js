// $THREE Intel — the live on-chain intelligence terminal's HTTP surface.
//
// This is the first real *use* of $THREE beyond Forge: holding the coin unlocks
// live intelligence; spending it buys a synthesized per-token dossier. Three
// actions, one currency:
//
//   GET  /api/three-intel/feed            — the live radar feed. Holders (Bronze+)
//        ?limit=&min_quality=             see it live; everyone else sees the SAME
//                                          feed on a 30-minute delay (the held edge).
//   GET  /api/three-intel/token?mint=     — a free per-token scan: on-chain signals
//                                          + live market + sentiment + a verdict.
//   GET  /api/three-intel/deep-report     — the price quote for the paid Deep Report.
//   POST /api/three-intel/deep-report     — redeem a settled $THREE payment for a
//        { mint, payment_id, ref_id }      synthesized dossier (idempotent, single-use).
//
// Every datum is real: the radar feed is the Coin Intelligence Engine's on-chain
// observations (pump_coin_intel), market data is the shared keyless market module,
// sentiment is live pump.fun commentary scored by the in-repo lexicon, and the
// narrative layer is aixbt when a key is configured. No external key is required
// for the core — aixbt enrichment degrades gracefully when absent.

import { wrap, cors, method, json, error, readJson, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';
import { resolveCallerLevel } from '../_lib/require-three.js';
import { fetchTokenMarketData } from '../_lib/market/token-market.js';
import { assessCoin } from '../_lib/intel/assess.js';
import { aixbtEnabled, getIntel, getProjects } from '../_lib/aixbt.js';
import { catalogEntry } from '../_lib/pricing/catalog.js';
import { assertIntelPayment, getStoredReport, claimReport } from '../_lib/intel-deep-payment.js';

const SOLANA_MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const INTEL_MIN_LEVEL = 1; // Bronze+ — mirrors GATED_FEATURES['intel.terminal'].minLevel
const NON_HOLDER_DELAY_MIN = 30; // the held edge: non-holders see the feed 30 min late
const PUMPFUN_BASE = 'https://frontend-api-v3.pump.fun';

const lamportsToSol = (v) => (v == null ? null : Number(BigInt(v)) / 1e9);
const num = (v) => (v == null ? null : Number(v));

// Compact terminal-row shape: the headline signals the feed renders, plus the
// derived assessment. (The full 30-field intel row is available via ?mint=.)
function shapeFeedRow(r) {
	const row = {
		mint: r.mint,
		symbol: r.symbol,
		name: r.name,
		image_uri: r.image_uri,
		category: r.category,
		narrative: r.narrative,
		quality_score: num(r.quality_score),
		bundle_score: num(r.bundle_score),
		organic_score: num(r.organic_score),
		snipe_ratio: num(r.snipe_ratio),
		concentration_top10: num(r.concentration_top10),
		fresh_wallet_ratio: num(r.fresh_wallet_ratio),
		risk_flags: r.risk_flags || [],
		first_seen_at: r.first_seen_at,
		observation_seconds: r.observation_seconds,
		buy_count: r.buy_count,
		sell_count: r.sell_count,
		unique_buyers: r.unique_buyers,
		dev_buy_sol: lamportsToSol(r.dev_buy_lamports),
		dev_sold: r.dev_sold,
	};
	row.assessment = assessCoin(row);
	return row;
}

// Live pump.fun commentary, scored by the shared lexicon. Best-effort: any failure
// (rate limit, network, no comments) returns null so a scan/report never 500s on a
// flaky third-party endpoint.
async function fetchSentiment(mint, limit = 80) {
	try {
		const { scoreSentiment } = await import('../../src/social/sentiment.js');
		const controller = new AbortController();
		const t = setTimeout(() => controller.abort(), 7000);
		let res;
		try {
			res = await fetch(`${PUMPFUN_BASE}/replies/${mint}?limit=${limit}&offset=0`, {
				signal: controller.signal,
			});
		} finally {
			clearTimeout(t);
		}
		if (!res.ok) return null;
		const data = await res.json().catch(() => null);
		const replies = Array.isArray(data?.replies) ? data.replies : Array.isArray(data) ? data : [];
		const posts = replies
			.map((r) => ({ text: String(r.text || r.message || '').slice(0, 2000) }))
			.filter((p) => p.text);
		if (posts.length === 0) return null;
		const s = scoreSentiment(posts);
		return {
			score: s.score,
			posPct: Math.round(s.posPct),
			negPct: Math.round(s.negPct),
			neuPct: Math.round(s.neuPct),
			count: s.count,
			examples: s.examples,
		};
	} catch {
		return null;
	}
}

// The full on-chain intel row for one mint (the ?mint= scan + the report subject).
async function fetchCoinIntel(mint, { withWallets = false } = {}) {
	const [row] = await sql`select * from pump_coin_intel where mint = ${mint} limit 1`;
	if (!row) return null;
	const coin = {
		mint: row.mint,
		symbol: row.symbol,
		name: row.name,
		image_uri: row.image_uri,
		description: row.description,
		socials: { twitter: row.twitter, telegram: row.telegram, website: row.website },
		category: row.category,
		tags: row.tags || [],
		narrative: row.narrative,
		first_seen_at: row.first_seen_at,
		observation_seconds: row.observation_seconds,
		quality_score: num(row.quality_score),
		bundle_score: num(row.bundle_score),
		organic_score: num(row.organic_score),
		snipe_ratio: num(row.snipe_ratio),
		concentration_top10: num(row.concentration_top10),
		fresh_wallet_ratio: num(row.fresh_wallet_ratio),
		bubblemap_connectivity: num(row.bubblemap_connectivity),
		risk_flags: row.risk_flags || [],
		dev_buy_sol: lamportsToSol(row.dev_buy_lamports),
		dev_sold: row.dev_sold,
		buy_count: row.buy_count,
		sell_count: row.sell_count,
		unique_buyers: row.unique_buyers,
		unique_sellers: row.unique_sellers,
	};
	if (withWallets) {
		const wallets = await sql`
			select wallet, buy_lamports, sell_lamports, is_creator
			from pump_coin_wallets where mint = ${mint}
			order by (buy_lamports + sell_lamports) desc limit 10
		`;
		coin.top_wallets = wallets.map((w) => ({
			wallet: w.wallet,
			buy_sol: lamportsToSol(w.buy_lamports),
			sell_sol: lamportsToSol(w.sell_lamports),
			is_creator: w.is_creator,
		}));
	}
	return coin;
}

// ── feed ──────────────────────────────────────────────────────────────────────
async function handleFeed(req, res) {
	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams;
	const limit = Math.max(1, Math.min(50, parseInt(params.get('limit'), 10) || 24));
	const minQuality = params.get('min_quality') != null ? parseInt(params.get('min_quality'), 10) : null;

	const caller = await resolveCallerLevel(req, res, null);
	const eligible = caller.level >= INTEL_MIN_LEVEL;
	const delayMin = eligible ? 0 : NON_HOLDER_DELAY_MIN;
	// Non-holders get a capped window so the live edge is real, not cosmetic.
	const effLimit = eligible ? limit : Math.min(limit, 12);

	// A DB hiccup degrades to an empty feed (the UI has a designed empty state) —
	// the access/gating context still renders, so the page never 500s on a read.
	let feed = [];
	try {
		const rows = await sql`
			select mint, symbol, name, image_uri, category, narrative,
			       quality_score, bundle_score, organic_score, snipe_ratio,
			       concentration_top10, fresh_wallet_ratio, risk_flags,
			       first_seen_at, observation_seconds, buy_count, sell_count,
			       unique_buyers, dev_buy_lamports, dev_sold
			from pump_coin_intel
			where network = 'mainnet'
			  and first_seen_at <= now() - make_interval(mins => ${delayMin})
			  and (${Number.isFinite(minQuality) ? minQuality : null}::int is null
			       or quality_score >= ${Number.isFinite(minQuality) ? minQuality : null})
			order by first_seen_at desc
			limit ${effLimit}
		`;
		feed = rows.map(shapeFeedRow);
	} catch {
		feed = [];
	}

	// Narrative layer (aixbt) is a holder enrichment and only when a key exists.
	let narrativeIntel = null;
	if (eligible && aixbtEnabled()) {
		try {
			const { intel } = await getIntel({ limit: 8 });
			narrativeIntel = Array.isArray(intel) ? intel : null;
		} catch {
			narrativeIntel = null;
		}
	}

	return json(
		res,
		200,
		{
			ok: true,
			access: {
				eligible,
				level: caller.level,
				required_level: INTEL_MIN_LEVEL,
				delay_minutes: delayMin,
				reason: eligible ? 'eligible' : caller.hasWallet ? 'insufficient_tier' : caller.hasUser ? 'link_wallet' : 'connect',
			},
			feed,
			narrative_intel: narrativeIntel,
			aixbt_enabled: aixbtEnabled(),
			generatedAt: new Date().toISOString(),
		},
		// Holders bust cache (live); the delayed feed can be edge-cached briefly.
		{ 'cache-control': eligible ? 'private, no-store' : 'public, max-age=30, s-maxage=60' },
	);
}

// ── token scan (free) ───────────────────────────────────────────────────────────
async function handleToken(req, res) {
	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams;
	const mint = (params.get('mint') || '').trim();
	if (!SOLANA_MINT_RE.test(mint)) {
		return error(res, 400, 'invalid_mint', 'mint must be a base58 Solana pubkey');
	}

	const [coin, market, sentiment] = await Promise.all([
		fetchCoinIntel(mint).catch(() => null),
		fetchTokenMarketData(mint).catch(() => null),
		fetchSentiment(mint).catch(() => null),
	]);

	let outcome = null;
	if (coin) {
		const [o] = await sql`
			select outcome, graduated, rugged, ath_multiple, last_market_cap_usd
			from pump_coin_outcomes where mint = ${mint} limit 1
		`.catch(() => []);
		outcome = o
			? {
					outcome: o.outcome,
					graduated: o.graduated,
					rugged: o.rugged,
					ath_multiple: num(o.ath_multiple),
					last_market_cap_usd: num(o.last_market_cap_usd),
				}
			: null;
	}

	return json(
		res,
		200,
		{
			ok: true,
			mint,
			observed: Boolean(coin),
			coin,
			assessment: coin ? assessCoin(coin) : null,
			market: market
				? {
						price_usd: market.price_usd,
						price_change_24h: market.price_change_24h,
						market_cap: market.market_cap,
						volume_24h: market.volume_24h,
						liquidity: market.liquidity,
						holders: market.holders,
					}
				: null,
			sentiment,
			outcome,
			generatedAt: new Date().toISOString(),
		},
		{ 'cache-control': 'public, max-age=15, s-maxage=30' },
	);
}

// ── deep report (paid) ──────────────────────────────────────────────────────────

// Turn the gathered real signals into a synthesized read. Rules-based and fully
// transparent — every number traces to an observed signal, no black box.
function synthesize({ mint, coin, market, sentiment, assessment }) {
	const findings = [];
	let score = 50; // 0 = avoid, 100 = strong — starts neutral, moved by real signals.

	if (assessment) {
		score -= (assessment.risk - 50) * 0.5;
		score += (assessment.organic - 50) * 0.4;
		findings.push(...assessment.reasons.map((r) => ({ kind: 'onchain', text: r })));
	}
	if (market) {
		const chg = Number(market.price_change_24h);
		if (Number.isFinite(chg)) {
			score += Math.max(-15, Math.min(15, chg / 4));
			findings.push({
				kind: 'market',
				text: `24h price ${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%${market.liquidity ? `, $${Math.round(market.liquidity).toLocaleString()} liquidity` : ''}`,
			});
		}
		const liq = Number(market.liquidity);
		if (Number.isFinite(liq) && liq < 5000) {
			score -= 10;
			findings.push({ kind: 'market', text: 'Thin liquidity — exit risk is elevated' });
		}
	}
	if (sentiment && sentiment.count >= 5) {
		score += Math.max(-12, Math.min(12, sentiment.score * 24));
		findings.push({
			kind: 'sentiment',
			text: `Community sentiment ${sentiment.score >= 0.15 ? 'positive' : sentiment.score <= -0.15 ? 'negative' : 'neutral'} across ${sentiment.count} recent comments (${sentiment.posPct}% pos / ${sentiment.negPct}% neg)`,
		});
	}

	score = Math.max(0, Math.min(100, Math.round(score)));
	let stance = 'watch';
	if (score >= 66) stance = 'accumulate-watch';
	else if (score <= 38) stance = 'avoid';
	const stanceLabel = { 'accumulate-watch': 'Constructive', watch: 'Neutral / watch', avoid: 'Defensive' }[stance];

	const symbol = coin?.symbol || market?.symbol || mint.slice(0, 4);
	const headline = `${symbol}: ${assessment?.verdictLabel || 'Unscored'} on-chain, ${stanceLabel.toLowerCase()} read`;

	return {
		headline,
		score,
		stance,
		stanceLabel,
		verdict: assessment?.verdict || 'unknown',
		findings,
		disclaimer:
			'Signal-based intelligence derived from on-chain observation, live market data, and community sentiment. Not financial advice.',
	};
}

async function buildDeepReport(mint) {
	const [coin, market, sentiment] = await Promise.all([
		fetchCoinIntel(mint, { withWallets: true }).catch(() => null),
		fetchTokenMarketData(mint).catch(() => null),
		fetchSentiment(mint, 120).catch(() => null),
	]);
	const assessment = coin ? assessCoin(coin) : null;

	// Narrative match from aixbt momentum-ranked projects, when a key is present.
	let narrative = null;
	if (aixbtEnabled()) {
		try {
			const { projects } = await getProjects({ limit: 12 });
			const sym = (coin?.symbol || '').toLowerCase();
			narrative =
				(Array.isArray(projects) &&
					projects.find((p) => String(p.ticker || p.name || '').toLowerCase().includes(sym) && sym)) ||
				null;
		} catch {
			narrative = null;
		}
	}

	const synthesis = synthesize({ mint, coin, market, sentiment, assessment });

	return {
		mint,
		subject: {
			symbol: coin?.symbol || null,
			name: coin?.name || null,
			image_uri: coin?.image_uri || null,
			category: coin?.category || null,
			socials: coin?.socials || null,
		},
		market: market
			? {
					price_usd: market.price_usd,
					price_change_24h: market.price_change_24h,
					market_cap: market.market_cap,
					volume_24h: market.volume_24h,
					liquidity: market.liquidity,
					holders: market.holders,
				}
			: null,
		onchain: coin,
		assessment,
		sentiment,
		distribution: coin?.top_wallets
			? {
					top_wallets: coin.top_wallets,
					note: 'Top 10 observed wallets by traded volume in the intelligence window.',
				}
			: null,
		narrative,
		synthesis,
		generatedAt: new Date().toISOString(),
	};
}

async function handleDeepReport(req, res) {
	// GET → the price quote so the client knows what to pay (no payment needed).
	if (req.method === 'GET') {
		const entry = catalogEntry('intel.deep');
		return json(res, 200, { ok: true, action: 'intel.deep', label: entry.label, usd: entry.usd }, {
			'cache-control': 'public, max-age=300',
		});
	}

	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	let body;
	try {
		body = await readJson(req);
	} catch {
		return error(res, 400, 'invalid_json', 'invalid json');
	}
	const mint = String(body?.mint || '').trim();
	const paymentId = String(body?.payment_id || '').trim();
	const refId = String(body?.ref_id || '').trim();
	if (!SOLANA_MINT_RE.test(mint)) {
		return error(res, 400, 'invalid_mint', 'mint must be a base58 Solana pubkey');
	}

	// Idempotency / single-use: a payment already redeemed returns its stored
	// dossier for the same mint, or is rejected if replayed against another token.
	const stored = await getStoredReport(paymentId).catch(() => null);
	if (stored) {
		if (stored.mint === mint) {
			return json(res, 200, { ok: true, paid: true, cached: true, report: stored.report });
		}
		return error(res, 409, 'payment_already_used', 'This payment already bought a report for a different token.');
	}

	try {
		await assertIntelPayment({ paymentId, refId });
	} catch (err) {
		return error(res, err.status || 402, err.code || 'payment_invalid', err.message || 'payment could not be verified');
	}

	const report = await buildDeepReport(mint);
	const { report: finalReport } = await claimReport({ paymentId, refId, mint, report });
	return json(res, 200, { ok: true, paid: true, cached: false, report: finalReport });
}

const DISPATCH = {
	feed: { GET: handleFeed },
	token: { GET: handleToken },
	'deep-report': { GET: handleDeepReport, POST: handleDeepReport },
};

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;

	const action = req.query?.action ?? new URL(req.url, 'http://x').pathname.split('/').pop();
	const handlers = DISPATCH[action];
	if (!handlers) return error(res, 404, 'not_found', `unknown intel action: ${action}`);
	const handler = handlers[req.method];
	if (!handler) {
		if (!method(req, res, Object.keys(handlers))) return;
		return;
	}
	return handler(req, res);
});
