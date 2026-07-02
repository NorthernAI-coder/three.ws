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
 * Pedigree — the quality of the wallets buying AND the wallet that launched the
 * coin. Driven by the data brain's pre-computed coin_smart_money.score when
 * present (it is already pedigree-weighted 0–100), then nudged by the count of
 * proven wallets, dragged down hard by any flagged (rugger/dumper) wallets in the
 * book, by proven money already exiting, and by a creator with a rug history.
 *
 * Returns an optional `cap` (≤100): a confirmed serial-rugger creator ceilings the
 * FINAL score the same way a bundle structure does — pedigree among buyers can't
 * paper over the dev who shipped a graveyard of dead launches.
 *
 * @param {object} sm smartMoney slice of CoinIntel
 * @param {object} creator creator slice of CoinIntel { label, launches, launchWins, dumpRate }
 * @returns {{score:number, reasons:string[], cap:number}}
 */
export function pedigreeScore(sm = {}, creator = {}) {
	const reasons = [];
	let cap = 100;
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

	// Proven money already heading for the exit. If the smart wallets that bought
	// are selling a meaningful share of what they put in, the pedigree signal is
	// being unwound in real time — discount it.
	const provenSell = num(sm.provenSellLamports);
	if (proven > 0 && provenSell > 0) {
		const exitShare = provenSell / proven;
		if (exitShare >= 0.5) { score -= 16; reasons.push(`smart money already sold ${Math.round(exitShare * 100)}% of its position`); }
		else if (exitShare >= 0.25) { score -= 8; reasons.push(`smart money trimming (${Math.round(exitShare * 100)}% sold)`); }
	}

	// Creator track record. A proven shipper lifts pedigree; a serial rugger both
	// drags it and ceilings the final score. First-time / unjudged creators are
	// neutral — absence of a record is not a red flag.
	const launches = num(creator?.launches);
	const launchWins = num(creator?.launchWins);
	if (isFlagged(creator?.label) || (launches >= 3 && launchWins === 0)) {
		score -= 22; cap = Math.min(cap, 45);
		reasons.push(launches >= 3
			? `creator has ${launches} prior launches, none graduated — rug pattern`
			: 'creator wallet flagged as a rugger');
	} else if (launchWins >= 3) {
		score += 12; reasons.push(`creator has shipped ${launchWins} graduated launches`);
	} else if (launchWins >= 1) {
		score += 6; reasons.push(`creator shipped ${launchWins} graduated launch${launchWins > 1 ? 'es' : ''}`);
	}
	const creatorDump = num(creator?.dumpRate); // 0..1
	if (launches >= 2 && creatorDump >= 0.5) {
		score -= 8; reasons.push(`creator dumps ${Math.round(creatorDump * 100)}% of their launches`);
	}

	// Coverage: how much of this pillar's input was actually present vs. defaulted.
	// A verdict built on empty pedigree data is a guess, not a read — the caller
	// fuses these into an overall confidence so thin-data coins are flagged.
	const coverage = fracPresent([
		Number.isFinite(num(sm.score, NaN)),
		notable.length > 0,
		total > 0,
		launches > 0 || !!creator?.label,
	]);

	return { score: clamp(score), reasons, cap, coverage };
}

/** Fraction of a boolean checklist that is true (0..1). */
function fracPresent(checks) {
	if (!checks.length) return 0;
	return checks.filter(Boolean).length / checks.length;
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

	// Sniped launch: a large share of buy volume landed in the first seconds — the
	// open was raced by bots, not discovered organically. High snipe pressure means
	// a thin, reflexive top that distributes onto later buyers.
	const snipeRatio = num(st.snipeRatio, NaN);
	if (Number.isFinite(snipeRatio)) {
		if (snipeRatio >= 70) { score -= 16; cap = Math.min(cap, 50); reasons.push(`${Math.round(snipeRatio)}% of early volume sniped in the first seconds`); }
		else if (snipeRatio >= 45) { score -= 8; reasons.push(`${Math.round(snipeRatio)}% sniped at the open`); }
	}

	// Fresh/farmed-wallet share: a book dominated by brand-new, single-purpose
	// wallets is a farm, not a crowd — the canonical bundle disguise.
	const freshWalletRatio = num(st.freshWalletRatio, NaN);
	if (Number.isFinite(freshWalletRatio)) {
		if (freshWalletRatio >= 70) { score -= 18; cap = Math.min(cap, 48); reasons.push(`${Math.round(freshWalletRatio)}% of buyers are fresh/farmed wallets`); }
		else if (freshWalletRatio >= 45) { score -= 9; reasons.push(`${Math.round(freshWalletRatio)}% of buyers are fresh wallets`); }
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

	const coverage = fracPresent([
		Number.isFinite(organic),
		Number.isFinite(bundleScore) || Number.isFinite(top10),
		Number.isFinite(snipeRatio) || Number.isFinite(freshWalletRatio),
		uniqueBuyers > 0,
		topHolderPct > 0 || creatorHoldPct > 0 || funderClusterPct > 0,
	]);

	return { score: clamp(score), reasons, cap, coverage };
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

	// A real virality read is full coverage; a bare category prior is partial; an
	// unknown category with no virality is essentially no narrative signal.
	const coverage = Number.isFinite(virality) ? 1 : (cat !== 'unknown' ? 0.5 : 0.2);

	return { score: clamp(score), reasons, coverage };
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

	const coverage = fracPresent([
		buys + sells > 0,
		earlyBuyers > 0,
		Number.isFinite(devBuy),
	]);

	return { score: clamp(score), reasons, coverage };
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
 *   reasons:Array<{pillar:string,text:string}>, badges:string[],
 *   structureCap:number, pedigreeCap:number,
 *   confidence:number, confidenceLabel:'high'|'medium'|'low'
 * }}
 */
export function convict(intel = {}) {
	const ped = pedigreeScore(intel.smartMoney, intel.creator);
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
	// over a bundle or a dumping dev. Pedigree carries a ceiling too: a confirmed
	// serial-rugger creator caps the final score the same way a bundle does.
	// The lowest triggered cap wins.
	const cap = Math.min(str.cap, ped.cap);
	score = Math.min(score, cap);
	score = clamp(Math.round(score));

	const tier = TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];

	// Confidence: how much of the verdict rests on real data vs. defaulted inputs.
	// Weighted by the same pillar weights so a missing high-weight pillar (pedigree)
	// costs more confidence than a missing light one (narrative). A high score built
	// on thin data is a lead to watch, not a call to size into — this makes that
	// explicit instead of letting a half-empty intel masquerade as a strong read.
	const coverage =
		ped.coverage * WEIGHTS.pedigree +
		str.coverage * WEIGHTS.structure +
		nar.coverage * WEIGHTS.narrative +
		mom.coverage * WEIGHTS.momentum;
	const confidence = clamp(Math.round(coverage * 100));
	const confidenceLabel = confidence >= 70 ? 'high' : confidence >= 45 ? 'medium' : 'low';

	// Badges: compact, high-signal flags for cards (the UI renders these as pills).
	const badges = [];
	if (num(intel.smartMoney?.smartWalletCount) >= 3) badges.push('smart-money');
	if (str.cap < 50) badges.push('structure-flag');
	// A serial-rugger creator ceilinged the score via pedigree, not structure — the
	// old structure-flag badge missed this case, so the card gave no reason why a
	// high-pedigree coin got capped. Surface it explicitly.
	if (ped.cap < 50) badges.push('pedigree-flag');
	if (String(intel.narrative?.category).toLowerCase() === 'news') badges.push('news');
	if (pillars.momentum >= 72) badges.push('momentum');
	if (confidence < 45) badges.push('thin-data');
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
		pedigreeCap: ped.cap,
		confidence,
		confidenceLabel,
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
