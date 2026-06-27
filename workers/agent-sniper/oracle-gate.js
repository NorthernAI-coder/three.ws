// agent-sniper — Oracle conviction gate.
//
// Checked AFTER the pure scorers (scoreMint, scoreClaim, scoreIntel) pass.
// Only fires when a strategy has min_oracle_score set; skips silently when
// the coin has no Oracle score yet (e.g. brand-new mints that haven't been
// classified). Caches each result within a 30-second window so repeated
// lookups within a burst share one DB round-trip.
//
// Macro signal adjustment: reads oracle_intel_signals (populated by the
// x402 autonomous loop) to widen or tighten the min_oracle_score threshold
// based on current SOL/BTC/pump market sentiment.

import { sql } from '../../api/_lib/db.js';
import { log } from './log.js';

const _cache = new Map(); // key → { score, ts }
const CACHE_TTL_MS = 30_000;

// Macro signal cache — shared across all gate calls, refreshed every 2 min.
let _macroCache = null;
let _macroCacheTs = 0;
const MACRO_TTL_MS = 120_000;

function n(v) {
	const x = Number(v);
	return Number.isFinite(x) ? x : null;
}

/**
 * Fetch recent macro signals from oracle_intel_signals and compute a
 * threshold adjustment in score points.
 *
 * Returns a number: positive = raise bar (bearish), negative = lower bar (bullish).
 * Returns 0 on any error (fail-open).
 */
async function getMacroAdjustment() {
	if (_macroCache !== null && Date.now() - _macroCacheTs < MACRO_TTL_MS) {
		return _macroCache;
	}
	try {
		const rows = await sql`
			select source_id, topic, signal, confidence, ts
			from oracle_intel_signals
			where topic in ('solana', 'bitcoin', 'pump')
			  and ts > now() - interval '1 hour'
			order by ts desc
		`;

		if (!rows.length) {
			_macroCache = 0;
			_macroCacheTs = Date.now();
			return 0;
		}

		// Latest signal per topic (rows already ordered desc by ts).
		const latest = {};
		for (const row of rows) {
			if (!latest[row.topic]) latest[row.topic] = row;
		}

		let adjustment = 0;
		const WEIGHTS = { solana: 1.2, bitcoin: 0.8, pump: 1.5 };

		for (const [topic, row] of Object.entries(latest)) {
			const w = WEIGHTS[topic] ?? 1.0;
			const conf = n(row.confidence) ?? 50;
			const confFactor = conf / 100;
			const sig = (row.signal ?? '').toLowerCase();

			if (sig === 'bearish') {
				// Raise threshold — harder to snipe in bearish macro.
				adjustment += Math.round(10 * w * confFactor);
			} else if (sig === 'bullish') {
				// Lower threshold — easier to snipe in bullish macro.
				adjustment -= Math.round(5 * w * confFactor);
			}
			// 'neutral' → no adjustment.
		}

		// Clamp: never move the bar more than ±15 points.
		adjustment = Math.max(-15, Math.min(15, adjustment));
		_macroCache = adjustment;
		_macroCacheTs = Date.now();
		return adjustment;
	} catch (err) {
		log.warn('oracle gate macro signal error — no adjustment', { err: err?.message });
		_macroCache = 0;
		_macroCacheTs = Date.now();
		return 0;
	}
}

/**
 * Look up the Oracle conviction score for a mint and decide whether the
 * strategy's min_oracle_score threshold is met.
 *
 * The effective threshold = min_oracle_score + macro_adjustment, where
 * macro_adjustment is derived from oracle_intel_signals (populated by
 * the x402 autonomous spend loop every 5 minutes).
 *
 * Returns:
 *   { pass: true }                         — scored and above threshold (or no threshold)
 *   { pass: false, reason: string }         — scored and below threshold
 *   { pass: true, skipped: true }           — no Oracle score yet; gate deferred
 *   All results include macro_adjustment when a threshold was evaluated.
 *
 * @param {string} mint
 * @param {string} network
 * @param {object} strat   agent_sniper_strategies row
 */
export async function oracleGate(mint, network, strat) {
	const minScore = strat.min_oracle_score != null ? n(strat.min_oracle_score) : null;
	if (minScore == null) return { pass: true };

	const cacheKey = `${network}:${mint}`;
	const cached = _cache.get(cacheKey);
	let score;
	if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
		score = cached.score;
	} else {
		try {
			const [row] = await sql`
				select score from oracle_conviction
				where mint = ${mint} and network = ${network}
				limit 1
			`;
			score = row?.score != null ? n(row.score) : null;
			_cache.set(cacheKey, { score, ts: Date.now() });
			// Prune the cache when it grows large.
			if (_cache.size > 2000) {
				const cutoff = Date.now() - CACHE_TTL_MS;
				for (const [k, v] of _cache) if (v.ts < cutoff) _cache.delete(k);
			}
		} catch (err) {
			log.warn('oracle gate db error — allowing snipe', { mint, err: err?.message });
			return { pass: true, skipped: true };
		}
	}

	if (score == null) {
		// Not yet scored — allow the snipe (Oracle lags new mints by design).
		return { pass: true, skipped: true };
	}

	// Apply macro signal adjustment from x402 autonomous loop intel.
	const macroAdj = await getMacroAdjustment();
	const effectiveMin = minScore + macroAdj;

	if (score < effectiveMin) {
		return {
			pass: false,
			reason: `oracle_below_min:${score}<${effectiveMin}${macroAdj !== 0 ? `(base:${minScore}+macro:${macroAdj})` : ''}`,
			macro_adjustment: macroAdj,
		};
	}

	return { pass: true, macro_adjustment: macroAdj };
}
