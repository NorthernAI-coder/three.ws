// Oracle — known-wallet prior (cold-start enrichment).
//
// The conviction engine's pedigree pillar is strongest when the data brain has
// already judged a coin's buyers — but that takes outcomes to accumulate, so a
// brand-new deploy reads every wallet as "unproven." This seed fixes the cold
// start: a curated set of Solana wallets already labeled by gmgn.ai (smart
// money, KOL, sniper) — sourced from github.com/nirholas/kol-quest — so the
// moment a known wallet shows up in a launch's order book, Oracle can credit it
// immediately, before its own track record matures. As the brain learns, its
// computed reputation takes over; this is only ever a prior.
//
// Wallet addresses + labels only — no token mints (the platform references only
// $THREE; this seed never carries a coin).

import { readFileSync } from 'node:fs';

let SEED = { wallets: {}, meta: { total: 0, counts: {} } };
try {
	SEED = JSON.parse(readFileSync(new URL('./known-wallets.json', import.meta.url), 'utf8'));
} catch { /* seed absent — known-wallet enrichment simply no-ops */ }

const WALLETS = SEED.wallets || {};

// A synthetic reputation score for a known label, used only until the brain has
// a real one. Deliberately below a fully-proven brain score (≤100) and ordered:
// smart money > KOL > sniper > top dev.
const LABEL_SCORE = { smart_money: 80, kol: 74, sniper: 55, top_dev: 50 };

/** Attribution + counts for the UI ("seeded with N known wallets"). */
export const KNOWN_META = {
	source: SEED.meta?.source || 'gmgn.ai',
	total: SEED.meta?.total || Object.keys(WALLETS).length,
	counts: SEED.meta?.counts || {},
};

/**
 * Look up a wallet's known label, or null. Returns a notable-ready shape with a
 * synthetic score + source tag so callers can fold it straight into pedigree.
 * @param {string} address
 */
export function knownWallet(address) {
	const hit = WALLETS[address];
	if (!hit) return null;
	return {
		label: hit.label,
		score: LABEL_SCORE[hit.label] ?? 50,
		pnl_30d: hit.pnl_30d ?? null,
		profit_30d_usd: hit.profit_30d_usd ?? null,
		tag: hit.tag || null,
		source: 'gmgn',
	};
}

/** Whether a (possibly known) label is one Oracle treats as proven-positive. */
export function knownIsProven(label) {
	return label === 'smart_money' || label === 'kol';
}
