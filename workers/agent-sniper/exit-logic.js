// agent-sniper — pure exit decision. No I/O, no time source of its own.
//
// The single source of truth for "should this position exit, and why". The live
// position loop (positions.js) calls it every tick with a freshly re-quoted SOL
// value + high-water mark; the historical backtester (api/_lib/strategy-backtest.js)
// calls it at the recorded peak and terminal price points so a projected strategy
// is evaluated with the EXACT stop-loss / trailing-stop / take-profit / timeout
// priority that governs real money. Keeping it here means the two can never drift.

/** Coerce to a finite number, or null. A null/blank input is "disabled" (null) —
 * NOT 0. (Number(null) === 0, so a missing take-profit / trailing-stop would
 * otherwise fire immediately; the schema documents null as "no TP / no trailing
 * stop", and this is the single source of truth that honors that.) */
export function pct(n) {
	if (n == null || n === '') return null;
	const x = Number(n);
	return Number.isFinite(x) ? x : null;
}

/**
 * Decide the exit reason for a position, or null to hold. Evaluated in priority
 * order: stop-loss → signal-flip → trailing-stop → take-profit → timeout.
 *
 * The hard stop-loss always wins. signal_flip is an EARLY warning that cuts a
 * losing position before it reaches the stop, driven by the per-coin x402
 * sentiment the worker already pays for — so it only fires while the position is
 * underwater and never overrides a take-profit. It is inert unless the caller
 * passes a `sentiment` (the live loop does so only when SNIPER_EXIT_ON_BEARISH
 * is set); the backtester omits it, so replays are byte-for-byte unchanged.
 *
 * @param {object} pos   position-like: { entry_quote_lamports, stop_loss_pct,
 *                        trailing_stop_pct, take_profit_pct, max_hold_seconds, opened_at }
 * @param {number} value current SOL value of the position (lamports)
 * @param {number} peak  high-water mark of `value` since entry (lamports)
 * @param {number} [now] epoch ms for the timeout clock (defaults to Date.now()).
 *                        Pass an explicit clock from a replay to keep it pure.
 * @param {{ signal?: string, confidence?: number, minConfidence?: number }|null} [sentiment]
 *                        live x402 sentiment read; null/omitted disables signal_flip.
 * @returns {'stop_loss'|'signal_flip'|'trailing_stop'|'take_profit'|'timeout'|null}
 */
export function decideExit(pos, value, peak, now = Date.now(), sentiment = null) {
	const entry = BigInt(pos.entry_quote_lamports || '0');
	if (entry <= 0n) return null;
	const ev = Number(entry);
	const sl = pct(pos.stop_loss_pct);
	const ts = pct(pos.trailing_stop_pct);
	const tp = pct(pos.take_profit_pct);

	if (sl != null && value <= ev * (1 - sl / 100)) return 'stop_loss';
	if (isBearishFlip(sentiment) && value < ev) return 'signal_flip';
	if (ts != null && peak > 0 && value <= peak * (1 - ts / 100)) return 'trailing_stop';
	if (tp != null && value >= ev * (1 + tp / 100)) return 'take_profit';

	const heldS = (now - new Date(pos.opened_at).getTime()) / 1000;
	if (pos.max_hold_seconds != null && heldS >= pos.max_hold_seconds) return 'timeout';
	return null;
}

/** A confident bearish sentiment read. minConfidence defaults to 0.7. */
function isBearishFlip(sentiment) {
	if (!sentiment || sentiment.signal !== 'bearish') return false;
	const conf = Number(sentiment.confidence);
	const floor = Number(sentiment.minConfidence);
	return Number.isFinite(conf) && conf >= (Number.isFinite(floor) ? floor : 0.7);
}
