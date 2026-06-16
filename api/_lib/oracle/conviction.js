// Oracle — the fused conviction engine.
//
// Every other system on the platform scores ONE dimension of a pump.fun launch:
// coin-intel scores the coin's quality, smart-money scores the pedigree of its
// buyers, the sniper scores entry filters. Oracle's job is the synthesis no
// single dimension can give: one 0–100 conviction number that fuses *who* is
// buying, *how* they're buying, *what* the coin is, and *how it's moving* — with
// a transparent breakdown so a human (or an agent) can see exactly why.
//
// The thesis: on pump.fun, edge comes from full-coverage data. We observe every
// wallet's track record, every coin's footprint, and every outcome. Fusing those
// in real time is the highest-signal "should I touch this" the platform can
// produce — and it's only possible because we have the most data.
//
// This module is PURE: it takes a normalized CoinIntel object (assembled by
// sources.js from the data-brain tables) and returns a verdict. No I/O, no DB,
// no clock — deterministic and fully unit-tested. The numbers are designed so a
// coin can never look strong on pedigree alone if its structure screams bundle,
// and never look safe on structure alone if known ruggers are in it.

import { isProven, isFlagged } from './archetype.js';

// Pillar weights. Pedigree (who's in) leads because buyer track record is the
// single most predictive signal we have; structure (is it a fair launch) is a
// near-equal guardrail; narrative and momentum refine. Sum = 1.
export const WEIGHTS = Object.freeze({
	pedigree: 0.34,
	structure: 0.30,
	narrative: 0.18,
	momentum: 0.18,
});

// Tier thresholds on the final 0–100 score. Names are chosen to be honest:
// most launches are noise, so the bar for "prime" is deliberately high.
const TIERS = [
	{ min: 86, tier: 'prime', label: 'Prime' },
	{ min: 72, tier: 'strong', label: 'Strong' },
	{ min: 56, tier: 'lean', label: 'Lean' },
	{ min: 34, tier: 'watch', label: 'Watch' },
	{ min: 0, tier: 'avoid', label: 'Avoid' },
];

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * Pedigree — the quality of the wallets buying. Driven by the data brain's
 * pre-computed coin_smart_money.score when present (it is already pedigree-
 * weighted 0–100), then nudged by the count of proven wallets and dragged down
 * hard by any flagged (rugger/dumper) wallets in the book.
 *
 * @param {object} sm smartMoney slice of CoinIntel
 * @returns {{score:number, reasons:string[]}}
 */
export function pedigreeScore(sm = {}) {
	const reasons = [];
	const notable = Array.isArray(sm.notable) ? sm.notable : [];
	const provenWallets = notable.filter((w) => isProven(w.label, w.score));
	const flaggedWallets = notable.filter((w) => isFlagged(w.label));

	// Base: prefer the brain's composite if we have one, else derive from the
	// notable wallets' average reputation.
	let base = num(sm.score, NaN);
	if (!Number.isFinite(base)) {
		if (provenWallets.length || notable.length) {
			const avg = notable.reduce((s, w) => s + num(w.score), 0) / Math.max(1, notable.length);
			base = avg;
		} else {
			base = 0;
		}
	}

	let score = base;
	const provenCount = num(sm.smartWalletCount, provenWallets.length);
	if (provenCount >= 5) { score += 14; reasons.push(`${provenCount} smart-money wallets already in`); }
	else if (provenCount >= 3) { score += 9; reasons.push(`${provenCount} smart-money wallets in`); }
	else if (provenCount >= 1) { score += 5; reasons.push(`${provenCount} smart-money wallet in`); }
	else if (notable.length === 0) { reasons.push('no proven wallets identified yet'); }

	// Proven money share of total buys — conviction, not just headcount.
	const proven = num(sm.provenBuyLamports);
	const total = num(sm.totalBuyLamports);
	if (total > 0 && proven > 0) {
		const share = proven / total;
		if (share >= 0.4) { score += 8; reasons.push(`${Math.round(share * 100)}% of buy volume is proven money`); }
		else if (share >= 0.2) { score += 4; }
	}

	// Flagged wallets are a hard drag — exit liquidity / rug history in the book.
	if (flaggedWallets.length) {
		score -= 12 * Math.min(3, flaggedWallets.length);
		reasons.push(`${flaggedWallets.length} flagged wallet${flaggedWallets.length > 1 ? 's' : ''} (rugger/dumper) in the book`);
	}

	return { score: clamp(score), reasons };
}

/**
 * Structure — is this a fair, organic launch or an engineered one? Penalizes
 * bundle launches, high holder concentration, single-funder clusters, and a dev
 * that is already dumping. Rewards a wide, distributed early base.
 *
 * @param {object} st structure slice of CoinIntel
 * @returns {{score:number, reasons:string[], cap:number}}
 */
export function structureScore(st = {}) {
	const reasons = [];
	let cap = 100;  // a hard ceiling some red flags impose on the FINAL score

	// Anchor on the data brain's precomputed organic_score when we have it (it's
	// a far better base than any single proxy); otherwise start neutral-organic.
	const organic = num(st.organicScore, NaN); // 0..100
	let score = Number.isFinite(organic) ? 30 + organic * 0.55 : 62;
	if (Number.isFinite(organic)) {
		if (organic >= 70) reasons.push(`organic-demand score ${Math.round(organic)}/100`);
		else if (organic <= 30) reasons.push(`weak organic demand (${Math.round(organic)}/100)`);
	}

	// Precise bundle / concentration / wallet-graph signals (0..100) when present.
	const bundleScore = num(st.bundleScore, NaN);
	if (Number.isFinite(bundleScore)) {
		if (bundleScore >= 60) { score -= 20; cap = Math.min(cap, 46); reasons.push(`coordinated-launch likelihood ${Math.round(bundleScore)}%`); }
		else if (bundleScore >= 35) { score -= 11; reasons.push(`some launch coordination (${Math.round(bundleScore)}%)`); }
	}
	const top10 = num(st.top10Pct, NaN);
	if (Number.isFinite(top10)) {
		if (top10 >= 80) { score -= 22; cap = Math.min(cap, 44); reasons.push(`top-10 wallets hold ${Math.round(top10)}%`); }
		else if (top10 >= 60) { score -= 12; reasons.push(`top-10 wallets hold ${Math.round(top10)}%`); }
		else if (top10 > 0 && top10 < 35) { score += 6; }
	}
	const connectivity = num(st.bubblemapConnectivity, NaN);
	if (Number.isFinite(connectivity) && connectivity >= 60) {
		score -= 10; cap = Math.min(cap, 55);
		reasons.push(`buyers are heavily interconnected (${Math.round(connectivity)}%)`);
	}

	const uniqueBuyers = num(st.uniqueBuyers);
	if (uniqueBuyers >= 60) { score += 16; reasons.push(`${uniqueBuyers} unique early buyers — broad base`); }
	else if (uniqueBuyers >= 25) { score += 9; reasons.push(`${uniqueBuyers} unique early buyers`); }
	else if (uniqueBuyers > 0 && uniqueBuyers < 8) { score -= 8; reasons.push(`only ${uniqueBuyers} unique buyers — thin`); }

	const topHolderPct = num(st.topHolderPct);
	if (topHolderPct >= 50) { score -= 26; cap = Math.min(cap, 45); reasons.push(`top wallet holds ${Math.round(topHolderPct)}% — extreme concentration`); }
	else if (topHolderPct >= 30) { score -= 14; reasons.push(`top wallet holds ${Math.round(topHolderPct)}%`); }
	else if (topHolderPct > 0 && topHolderPct < 12) { score += 6; }

	const creatorHoldPct = num(st.creatorHoldPct);
	if (creatorHoldPct >= 25) { score -= 16; reasons.push(`creator still holds ${Math.round(creatorHoldPct)}%`); }

	const devSoldPct = num(st.devSoldPct);
	if (devSoldPct >= 50) { score -= 24; cap = Math.min(cap, 38); reasons.push(`dev already sold ${Math.round(devSoldPct)}% — bailing`); }
	else if (devSoldPct >= 20) { score -= 10; reasons.push(`dev sold ${Math.round(devSoldPct)}%`); }

	// Single-funder cluster: many "different" wallets fed by one source = a
	// bundle wearing a wide-base costume.
	const funderClusterPct = num(st.funderClusterPct);
	if (funderClusterPct >= 50) { score -= 22; cap = Math.min(cap, 42); reasons.push(`${Math.round(funderClusterPct)}% of buyers share one funder — bundle`); }
	else if (funderClusterPct >= 30) { score -= 12; reasons.push(`${Math.round(funderClusterPct)}% of buyers share a funder`); }

	if (st.bundleFlag) { score -= 18; cap = Math.min(cap, 48); reasons.push('flagged as a bundle launch'); }

	if (reasons.length === 0) reasons.push('clean, distributed launch structure');

	return { score: clamp(score), reasons, cap };
}

/**
 * Narrative — cultural strength of the coin itself. The classifier supplies a
 * virality estimate (0–100) and a category; some categories carry more durable
 * upside on pump.fun than others. This pillar is intentionally the lightest
 * mover: a great story can't save a rugged structure, but it breaks ties.
 *
 * @param {object} nv narrative slice of CoinIntel
 * @returns {{score:number, reasons:string[]}}
 */
export function narrativeScore(nv = {}) {
	const reasons = [];
	const virality = num(nv.virality, NaN);
	const confidence = num(nv.confidence, 0.5);

	// Category priors: how often this flavor sustains attention. Tuned, not gospel.
	const CATEGORY_PRIOR = {
		news: 70, culture: 66, ai: 64, meme: 60, animal: 56, celebrity: 54,
		political: 52, community: 58, tech: 50, utility: 46, unknown: 40,
	};
	const cat = String(nv.category || 'unknown').toLowerCase();
	const prior = CATEGORY_PRIOR[cat] ?? 40;

	let score;
	if (Number.isFinite(virality)) {
		// Blend the classifier's virality with the category prior, weighted by the
		// classifier's confidence so a low-confidence call leans on the prior.
		score = virality * (0.4 + 0.4 * confidence) + prior * (0.6 - 0.4 * confidence);
		reasons.push(`${cat} narrative, virality ${Math.round(virality)}/100`);
	} else {
		score = prior;
		reasons.push(`${cat} narrative (no virality estimate yet)`);
	}

	if (cat === 'news') reasons.push('riding a live news story — fast but fragile');
	if (cat === 'unknown') reasons.push('narrative unclassified — treat with caution');

	return { score: clamp(score), reasons };
}

/**
 * Momentum / behavior — is real buying pressure showing up, and is the dev's
 * own buy sized like conviction or like a honeypot? Reads the early footprint.
 *
 * @param {object} bh behavior slice of CoinIntel
 * @returns {{score:number, reasons:string[]}}
 */
export function momentumScore(bh = {}) {
	const reasons = [];
	let score = 50;

	const buys = num(bh.buyCount);
	const sells = num(bh.sellCount);
	if (buys + sells > 0) {
		const buyShare = buys / (buys + sells);
		if (buyShare >= 0.8 && buys >= 10) { score += 22; reasons.push(`${buys} buys vs ${sells} sells — strong inflow`); }
		else if (buyShare >= 0.65) { score += 12; reasons.push('buyers outnumber sellers'); }
		else if (buyShare < 0.45) { score -= 16; reasons.push(`${sells} sells vs ${buys} buys — distribution`); }
	}

	const earlyBuyers = num(bh.earlyBuyerCount);
	if (earlyBuyers >= 40) { score += 14; reasons.push('rapid early-buyer pile-in'); }
	else if (earlyBuyers >= 15) { score += 7; }

	// Dev buy sizing: a reasonable dev buy signals skin in the game; a giant one
	// signals the dev is the top holder (honeypot risk); zero is just neutral.
	const devBuy = num(bh.devBuySol, NaN);
	if (Number.isFinite(devBuy)) {
		if (devBuy >= 0.2 && devBuy <= 2.5) { score += 8; reasons.push(`dev bought ${devBuy.toFixed(2)} SOL — skin in the game`); }
		else if (devBuy > 6) { score -= 14; reasons.push(`dev bought ${devBuy.toFixed(1)} SOL — oversized dev position`); }
	}

	if (reasons.length === 0) reasons.push('no clear momentum yet — too early');
	return { score: clamp(score), reasons };
}

/**
 * Fuse the four pillars into Oracle Conviction. Applies the structural cap
 * (a launch can't score "strong" if its structure flags a bundle/rug), assigns
 * a tier, and returns a fully transparent breakdown.
 *
 * @param {object} intel normalized CoinIntel (see sources.js)
 * @returns {{
 *   score:number, tier:string, tierLabel:string,
 *   pillars:{pedigree:number,structure:number,narrative:number,momentum:number},
 *   weights:typeof WEIGHTS,
 *   reasons:string[], badges:string[], structureCap:number
 * }}
 */
export function convict(intel = {}) {
	const ped = pedigreeScore(intel.smartMoney);
	const str = structureScore(intel.structure);
	const nar = narrativeScore(intel.narrative);
	const mom = momentumScore(intel.behavior);

	const pillars = {
		pedigree: Math.round(ped.score),
		structure: Math.round(str.score),
		narrative: Math.round(nar.score),
		momentum: Math.round(mom.score),
	};

	let score =
		ped.score * WEIGHTS.pedigree +
		str.score * WEIGHTS.structure +
		nar.score * WEIGHTS.narrative +
		mom.score * WEIGHTS.momentum;

	// Structural red flags impose a hard ceiling — pedigree/narrative can't paper
	// over a bundle or a dumping dev.
	score = Math.min(score, str.cap);
	score = clamp(Math.round(score));

	const tier = TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];

	// Badges: compact, high-signal flags for cards (the UI renders these as pills).
	const badges = [];
	if (num(intel.smartMoney?.smartWalletCount) >= 3) badges.push('smart-money');
	if (str.cap < 50) badges.push('structure-flag');
	if (String(intel.narrative?.category).toLowerCase() === 'news') badges.push('news');
	if (pillars.momentum >= 72) badges.push('momentum');
	if (score >= 86) badges.push('prime');

	// Order reasons by pillar contribution so the most decisive shows first.
	const reasons = [
		...ped.reasons.map((t) => ({ pillar: 'pedigree', text: t })),
		...str.reasons.map((t) => ({ pillar: 'structure', text: t })),
		...mom.reasons.map((t) => ({ pillar: 'momentum', text: t })),
		...nar.reasons.map((t) => ({ pillar: 'narrative', text: t })),
	];

	return {
		score,
		tier: tier.tier,
		tierLabel: tier.label,
		pillars,
		weights: WEIGHTS,
		structureCap: str.cap,
		reasons,
		badges,
	};
}

/** Map a tier to a UI tone (mirrors the page's CSS class suffixes). */
export function tierTone(tier) {
	switch (tier) {
		case 'prime': return 'good';
		case 'strong': return 'good';
		case 'lean': return 'warn';
		case 'watch': return 'neutral';
		default: return 'bad';
	}
}
