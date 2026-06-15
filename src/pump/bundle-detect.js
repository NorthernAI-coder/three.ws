/**
 * pump/bundle-detect.js
 * ---------------------
 * Pure analytics over a coin's early trade footprint. No I/O — the coin-intel
 * worker feeds in aggregated per-wallet stats (and a wallet→funder map it
 * resolved from the chain), and these functions derive the organic-vs-bundle
 * signals and the composite intel score the sniper reads. Pure so every number
 * is unit-testable and identical in the worker and the API.
 *
 * A "trader" is one row per wallet for one coin:
 *   { wallet, buy_lamports, sell_lamports, buy_count, sell_count, is_dev }
 * amounts are plain numbers (lamports). Volumes for a fresh launch stay well
 * inside Number.MAX_SAFE_INTEGER (1 SOL = 1e9; 9e15 ≈ 9M SOL).
 */

function num(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}
function pct(part, whole) {
	if (!(whole > 0)) return 0;
	return Math.round((part / whole) * 1000) / 10; // 1 decimal
}
function clamp(n, lo, hi) {
	return Math.max(lo, Math.min(hi, n));
}

/**
 * Roll a coin's per-wallet rows up into headline metrics.
 * @param {Array} traders
 * @returns {object} metrics
 */
export function summarizeTraders(traders) {
	const rows = Array.isArray(traders) ? traders : [];
	let unique_buyers = 0,
		unique_sellers = 0,
		total_buys = 0,
		total_sells = 0,
		buy_volume = 0,
		sell_volume = 0,
		largest_buy = 0,
		dev_buy = 0;
	let dev_sold = false;
	let topBuyerVol = 0;

	for (const t of rows) {
		const b = num(t.buy_lamports);
		const s = num(t.sell_lamports);
		const bc = num(t.buy_count);
		const sc = num(t.sell_count);
		if (b > 0) unique_buyers++;
		if (s > 0) unique_sellers++;
		total_buys += bc;
		total_sells += sc;
		buy_volume += b;
		sell_volume += s;
		if (b > largest_buy) largest_buy = b;
		if (b > topBuyerVol) topBuyerVol = b;
		if (t.is_dev) {
			dev_buy = b;
			if (s > 0) dev_sold = true;
		}
	}

	const avg_buy = unique_buyers > 0 ? Math.round(buy_volume / unique_buyers) : 0;
	return {
		unique_buyers,
		unique_sellers,
		total_buys,
		total_sells,
		buy_volume,
		sell_volume,
		net_volume: buy_volume - sell_volume,
		largest_buy,
		avg_buy,
		dev_buy,
		dev_sold,
		dev_buy_pct: pct(dev_buy, buy_volume),
		top_buyer_pct: pct(topBuyerVol, buy_volume),
	};
}

/**
 * Cluster wallets that share a funding source ("bubblemaps-lite"): a single
 * funder backing ≥2 of a coin's buyers is the classic bundle signature.
 *
 * @param {Array} traders   per-wallet rows (need buy_lamports + wallet)
 * @param {Map<string,string>|object} funderOf  wallet → funder address (null/absent = unknown)
 * @returns {{ bundle_detected, bundle_wallet_count, bundle_buy_pct, cluster_count }}
 */
export function detectBundle(traders, funderOf) {
	const rows = Array.isArray(traders) ? traders : [];
	const lookup = funderOf instanceof Map ? (w) => funderOf.get(w) : (w) => funderOf?.[w];

	// funder → [wallets buying through it]
	const byFunder = new Map();
	let buy_volume = 0;
	const buyVol = new Map();
	for (const t of rows) {
		const b = num(t.buy_lamports);
		buy_volume += b;
		if (b <= 0) continue;
		buyVol.set(t.wallet, b);
		const f = lookup(t.wallet);
		if (!f) continue;
		if (!byFunder.has(f)) byFunder.set(f, []);
		byFunder.get(f).push(t.wallet);
	}

	let bundleWallets = new Set();
	let cluster_count = 0;
	for (const [, wallets] of byFunder) {
		if (wallets.length >= 2) {
			cluster_count++;
			for (const w of wallets) bundleWallets.add(w);
		}
	}

	let bundledVol = 0;
	for (const w of bundleWallets) bundledVol += buyVol.get(w) || 0;

	return {
		bundle_detected: bundleWallets.size > 0,
		bundle_wallet_count: bundleWallets.size,
		bundle_buy_pct: pct(bundledVol, buy_volume),
		cluster_count,
	};
}

/**
 * 0 (heavily bundled / concentrated) … 100 (clean, broad, organic).
 * Transparent penalties so a strategy author can reason about the gate.
 */
export function organicScore(metrics, bundle) {
	let score = 100;
	// shared-funder bundling is the heaviest penalty — dollar-for-dollar.
	score -= num(bundle?.bundle_buy_pct);
	// single-wallet dominance above a quarter of buy volume.
	const top = num(metrics?.top_buyer_pct);
	if (top > 25) score -= (top - 25) * 0.8;
	// dev hoarding above half the buy volume.
	const dev = num(metrics?.dev_buy_pct);
	if (dev > 50) score -= (dev - 50) * 0.6;
	// a launch nobody else has touched yet is not "organic", just empty.
	const buyers = num(metrics?.unique_buyers);
	if (buyers < 5) score -= (5 - buyers) * 8;
	// dev already dumping into the first buyers.
	if (metrics?.dev_sold) score -= 15;
	return clamp(Math.round(score), 0, 100);
}

// Classifications that read as "someone built something", nudged up slightly.
const SUBSTANTIVE = new Set(['tech', 'utility', 'community', 'culture']);

/**
 * Composite 0..100 the sniper gates on. Organic quality is the backbone;
 * socials, a confident classification, and real buyer breadth add to it.
 */
export function intelScore({ metrics, bundle, organic, hasSocials, classification, confidence }) {
	const org = organic != null ? num(organic) : organicScore(metrics, bundle);
	let score = org * 0.6; // organic is 60% of the weight

	// buyer breadth (capped) — up to 20 pts for ≥20 distinct buyers.
	const buyers = num(metrics?.unique_buyers);
	score += clamp(buyers, 0, 20);

	// socials present and a confident category each add headroom.
	if (hasSocials) score += 8;
	const conf = num(confidence);
	if (classification && classification !== 'other') score += clamp(conf * 8, 0, 8);
	if (SUBSTANTIVE.has(classification)) score += 4;

	return clamp(Math.round(score), 0, 100);
}
