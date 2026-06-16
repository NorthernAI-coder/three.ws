// Oracle — source adapter over the data brain.
//
// This is the only place Oracle touches the platform's existing pump.fun tables.
// It reads them defensively (every query is isolated so a missing/younger table
// degrades that one slice to null instead of failing the whole assembly) and
// maps them into the single normalized `CoinIntel` shape the pure conviction
// engine consumes. Keeping the coupling here means a schema change in the brain
// only ever breaks this file, never the scoring logic or the API surface.
//
// Brain tables read:
//   pump_coin_intel    — coin record + precomputed structural/narrative signals
//   coin_smart_money   — pedigree: proven-money score + notable wallets
//   oracle_narrative   — Oracle's own cultural read (virality), if classified
//   pump_coin_outcomes — ground-truth outcome (for the conviction backtest)

import { sql } from '../db.js';

const LAMPORTS = 1e9;
const n = (v) => (v == null ? null : Number(v));
const pct01 = (v) => (v == null ? null : Math.max(0, Math.min(100, Number(v) * 100)));

/** Best-effort single-row query; returns null on any error (missing table etc). */
async function tryRow(fn) {
	try {
		const rows = await fn();
		return rows && rows[0] ? rows[0] : null;
	} catch {
		return null;
	}
}
async function tryRows(fn) {
	try {
		return (await fn()) || [];
	} catch {
		return [];
	}
}

/**
 * Assemble the normalized CoinIntel for one mint from the brain. Any slice that
 * isn't available yet is simply omitted — the conviction engine tolerates gaps.
 *
 * @param {string} mint
 * @param {string} network
 * @returns {Promise<object|null>} CoinIntel, or null if the coin is unknown
 */
export async function assembleIntel(mint, network = 'mainnet') {
	const coin = await tryRow(() => sql`
		select mint, symbol, name, image_uri, category, narrative, classify_confidence,
		       created_at, first_seen_at,
		       dev_buy_lamports, dev_sold, dev_sell_lamports,
		       buy_count, sell_count, buy_volume_lamports, sell_volume_lamports,
		       unique_buyers, largest_buy_lamports,
		       bundle_score, organic_score, concentration_top10, bubblemap_connectivity,
		       quality_score, risk_flags
		from pump_coin_intel where mint = ${mint} and network = ${network} limit 1
	`);
	if (!coin) return null;

	const [smart, narr] = await Promise.all([
		tryRow(() => sql`
			select smart_money_score, smart_wallet_count, proven_buy_lamports, total_buy_lamports, notable
			from coin_smart_money where mint = ${mint} and network = ${network} limit 1
		`),
		tryRow(() => sql`
			select category, narrative, virality, confidence
			from oracle_narrative where mint = ${mint} and network = ${network} limit 1
		`),
	]);

	return toCoinIntel({ coin, smart, narr });
}

/**
 * Map raw brain rows → normalized CoinIntel. Pure given its inputs (exported so
 * it can be unit-tested without a DB).
 */
export function toCoinIntel({ coin, smart, narr }) {
	const riskFlags = Array.isArray(coin.risk_flags) ? coin.risk_flags : [];
	const devBuy = n(coin.dev_buy_lamports);
	const buyVol = n(coin.buy_volume_lamports) || 0;
	const largest = n(coin.largest_buy_lamports);

	// Single-biggest-buyer share of buy volume — a top-holder proxy.
	const topHolderPct = largest != null && buyVol > 0 ? (largest / buyVol) * 100 : null;
	// Dev footprint as a share of buy volume — a creator-hold proxy.
	const creatorHoldPct = devBuy != null && buyVol > 0 ? (devBuy / buyVol) * 100 : null;
	const devSoldPct = coin.dev_sold && devBuy
		? (n(coin.dev_sell_lamports) || 0) / devBuy * 100
		: 0;

	const bundleScore = pct01(coin.bundle_score);          // 0..100
	const organicScore = pct01(coin.organic_score);
	const top10Pct = pct01(coin.concentration_top10);
	const connectivity = pct01(coin.bubblemap_connectivity);
	const bundleFlag = riskFlags.includes('bundle_launch') || (bundleScore != null && bundleScore >= 60);

	// Narrative: Oracle's own classification (has virality) wins; else fall back
	// to the brain's category with a virality proxy derived from quality/organic.
	const narrative = narr
		? { category: narr.category, virality: n(narr.virality), confidence: n(narr.confidence) }
		: {
			category: coin.category || 'unknown',
			virality: n(coin.quality_score) != null ? Math.round(n(coin.quality_score) * 0.8 + (organicScore || 0) * 0.2) : null,
			confidence: n(coin.classify_confidence) ?? 0.5,
		};

	const notable = Array.isArray(smart?.notable) ? smart.notable
		: (typeof smart?.notable === 'string' ? safeJson(smart.notable) : []);

	return {
		mint: coin.mint,
		symbol: coin.symbol,
		name: coin.name,
		image_uri: coin.image_uri,
		category: narrative.category,
		createdAt: coin.created_at || coin.first_seen_at,

		smartMoney: {
			score: n(smart?.smart_money_score),
			smartWalletCount: n(smart?.smart_wallet_count) || (Array.isArray(notable) ? notable.length : 0),
			provenBuyLamports: n(smart?.proven_buy_lamports) || 0,
			totalBuyLamports: n(smart?.total_buy_lamports) || buyVol,
			notable: Array.isArray(notable) ? notable : [],
		},
		structure: {
			uniqueBuyers: n(coin.unique_buyers) || 0,
			topHolderPct,
			creatorHoldPct,
			devSoldPct,
			organicScore,
			bundleScore,
			top10Pct,
			bubblemapConnectivity: connectivity,
			bundleFlag,
		},
		narrative,
		behavior: {
			devBuySol: devBuy != null ? devBuy / LAMPORTS : null,
			buyCount: n(coin.buy_count) || 0,
			sellCount: n(coin.sell_count) || 0,
			buyVolSol: buyVol / LAMPORTS,
			sellVolSol: (n(coin.sell_volume_lamports) || 0) / LAMPORTS,
			earlyBuyerCount: n(coin.unique_buyers) || 0,
		},
		riskFlags,
		qualityScore: n(coin.quality_score),
	};
}

function safeJson(s) {
	try { return JSON.parse(s); } catch { return []; }
}

/**
 * Recent coins worth (re)scoring — newest first from the brain's coin table.
 * Used by the ingestion augmentor and as a fallback when oracle_conviction is
 * cold.
 *
 * @param {object} opts { network, limit, sinceSeconds }
 * @returns {Promise<string[]>} mints
 */
export async function recentMints({ network = 'mainnet', limit = 100, sinceSeconds = 6 * 3600 } = {}) {
	const rows = await tryRows(() => sql`
		select mint from pump_coin_intel
		where network = ${network}
		  and first_seen_at > now() - (${sinceSeconds} || ' seconds')::interval
		order by first_seen_at desc
		limit ${Math.min(500, Math.max(1, limit))}
	`);
	return rows.map((r) => r.mint);
}

/**
 * A wallet's reputation + recent footprint, for the wallet profile endpoint.
 * @param {string} wallet
 * @param {string} network
 */
export async function walletProfile(wallet, network = 'mainnet') {
	const rep = await tryRow(() => sql`
		select wallet, coins_traded, early_entries, wins, early_wins, duds, dumps,
		       creator_count, creator_wins, win_rate, early_win_rate, dump_rate,
		       smart_money_score, label, first_seen_at, last_active_at
		from wallet_reputation where wallet = ${wallet} and network = ${network} limit 1
	`);
	const recent = await tryRows(() => sql`
		select w.mint, w.buy_lamports, w.sell_lamports, w.is_creator, w.last_seen_at,
		       i.symbol, i.name, i.image_uri, i.category
		from pump_coin_wallets w
		left join pump_coin_intel i on i.mint = w.mint
		where w.wallet = ${wallet}
		order by w.last_seen_at desc
		limit 25
	`);
	return { rep, recent };
}

/**
 * Ground-truth outcome for a mint (for the conviction-tier backtest).
 * @param {string} mint
 */
export async function coinOutcome(mint, network = 'mainnet') {
	return tryRow(() => sql`
		select graduated, rugged, ath_multiple, last_market_cap_usd
		from pump_coin_outcomes where mint = ${mint} limit 1
	`).catch(() => null);
}
