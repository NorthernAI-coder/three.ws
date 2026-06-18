// Signal assessment — the analytical core of $THREE Intel.
//
// Pure, deterministic, dependency-free: it turns the raw on-chain signals the
// Coin Intelligence Engine records (bundle/organic/snipe/concentration/fresh-
// wallet ratios, quality score, risk flags) into a transparent read — a risk
// score, an organic-strength score, a one-word verdict, and the human-readable
// reasons behind them. Every reason traces to a real observed signal, so the
// terminal explains itself rather than asking the user to trust a black box.
//
// Importable on the server (the feed + deep report) and pure enough to unit-test.

// Signals arrive as either 0–1 ratios or 0–100 scores depending on the column;
// normalize everything to a 0–100 scale so the weighting is uniform. null/NaN → 0.
function pct(v) {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return n <= 1 ? Math.round(n * 100) : Math.min(100, Math.round(n));
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Assess one coin's intelligence row.
 * @param {object} row  shaped coin-intel fields (quality_score, bundle_score,
 *   organic_score, snipe_ratio, concentration_top10, fresh_wallet_ratio,
 *   risk_flags, dev_sold, buy_count, sell_count, unique_buyers)
 * @returns {{ risk:number, organic:number, verdict:string, verdictLabel:string, reasons:string[] }}
 */
export function assessCoin(row = {}) {
	const quality = pct(row.quality_score);
	const bundle = pct(row.bundle_score);
	const organic = pct(row.organic_score);
	const snipe = pct(row.snipe_ratio);
	const concentration = pct(row.concentration_top10);
	const fresh = pct(row.fresh_wallet_ratio);
	const flags = Array.isArray(row.risk_flags) ? row.risk_flags : [];

	// Risk: a weighted blend of the adversarial signals, plus a penalty per flag.
	let risk =
		bundle * 0.3 + concentration * 0.25 + snipe * 0.2 + fresh * 0.15 + (100 - organic) * 0.1;
	risk += flags.length * 6;
	if (row.dev_sold) risk += 12;
	risk = clamp(risk);

	// Organic strength: real demand signals net of the adversarial ones.
	const buyers = Number(row.unique_buyers) || 0;
	const buys = Number(row.buy_count) || 0;
	const sells = Number(row.sell_count) || 0;
	const buyPressure = buys + sells > 0 ? (buys / (buys + sells)) * 100 : 50;
	let strength =
		organic * 0.4 + quality * 0.3 + Math.min(100, buyers * 2) * 0.15 + buyPressure * 0.15;
	strength = clamp(strength - bundle * 0.2);

	const reasons = [];
	if (bundle >= 50) reasons.push(`Bundled launch detected (${bundle}% bundle signal)`);
	else if (bundle > 0 && bundle < 25) reasons.push('Low bundle signal — launch looks unbundled');
	if (concentration >= 50) reasons.push(`Top-10 wallets hold a concentrated share (${concentration}%)`);
	if (snipe >= 40) reasons.push(`Heavy first-block sniping (${snipe}% snipe ratio)`);
	if (fresh >= 60) reasons.push(`Mostly fresh wallets (${fresh}%) — possible coordinated farming`);
	if (organic >= 60) reasons.push(`Strong organic demand signal (${organic}%)`);
	if (buyers >= 30) reasons.push(`${buyers} unique buyers observed early`);
	if (row.dev_sold) reasons.push('Dev wallet has already sold');
	for (const f of flags.slice(0, 4)) reasons.push(`Flag: ${String(f).replace(/_/g, ' ')}`);
	if (reasons.length === 0) reasons.push('No strong risk signals in the observed window');

	// Verdict: risk dominates; organic strength breaks ties for the safe band.
	let verdict = 'mixed';
	if (risk >= 70) verdict = 'high_risk';
	else if (risk >= 45) verdict = 'caution';
	else if (strength >= 55) verdict = 'organic';
	else verdict = 'mixed';

	const verdictLabel = {
		organic: 'Organic',
		mixed: 'Mixed',
		caution: 'Caution',
		high_risk: 'High risk',
	}[verdict];

	return { risk, organic: strength, verdict, verdictLabel, reasons };
}
