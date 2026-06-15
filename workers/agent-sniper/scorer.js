// agent-sniper — entry scoring. Pure, no I/O.
//
// Given an enriched mint event (from connectPumpFunFeed) and a strategy row,
// decide whether the agent should snipe it. Returns { pass, score, reasons }.
// `reasons` always explains the verdict — kept on skipped events too so the
// logs show WHY a mint was passed over, which is what you stare at when tuning.

function n(v) {
	if (v == null) return null;
	const x = Number(v);
	return Number.isFinite(x) ? x : null;
}

/**
 * @param {object} mint  enriched PumpPortal mint event
 * @param {object} strat agent_sniper_strategies row
 * @returns {{ pass: boolean, score: number, reasons: string[] }}
 */
export function scoreMint(mint, strat) {
	const reasons = [];
	let score = 0;

	// ── hard filters (any failure → skip) ────────────────────────────────────
	if (strat.require_sol_quote && mint.is_usdc_pair) {
		return { pass: false, score: 0, reasons: ['quote_not_sol'] };
	}

	const mcUsd = n(mint.market_cap_usd);
	const minMc = n(strat.min_market_cap_usd);
	const maxMc = n(strat.max_market_cap_usd);
	if (minMc != null && (mcUsd == null || mcUsd < minMc)) {
		return { pass: false, score: 0, reasons: ['mc_below_min'] };
	}
	if (maxMc != null && mcUsd != null && mcUsd > maxMc) {
		return { pass: false, score: 0, reasons: ['mc_above_max'] };
	}

	const launches = n(mint.creator_launches);
	const graduated = n(mint.creator_graduated);
	const maxLaunches = n(strat.max_creator_launches);
	const minGrad = n(strat.min_creator_graduated);
	// Serial-rugger guard: many launches, none graduated.
	if (maxLaunches != null && launches != null && launches > maxLaunches) {
		return { pass: false, score: 0, reasons: ['creator_too_many_launches'] };
	}
	if (minGrad != null && (graduated == null || graduated < minGrad)) {
		return { pass: false, score: 0, reasons: ['creator_too_few_graduated'] };
	}

	const hasSocials = !!(mint.twitter || mint.telegram || mint.website);
	if (strat.require_socials && !hasSocials) {
		return { pass: false, score: 0, reasons: ['no_socials'] };
	}

	// ── soft signals (contribute to score; tie-break / future ranking) ───────
	if (hasSocials) { score += 1; reasons.push('has_socials'); }
	if (graduated != null && graduated > 0) { score += graduated; reasons.push(`creator_graduated:${graduated}`); }
	const initBuy = n(mint.initial_buy_sol);
	if (initBuy != null && initBuy >= 1) { score += 1; reasons.push(`initial_buy:${initBuy.toFixed(2)}sol`); }
	if (mcUsd != null) reasons.push(`mc_usd:${Math.round(mcUsd)}`);

	return { pass: true, score, reasons };
}
