// agent-sniper — Oracle conviction gate.
//
// Checked AFTER the pure scorers (scoreMint, scoreClaim, scoreIntel) pass.
// Only fires when a strategy has min_oracle_score set; skips silently when
// the coin has no Oracle score yet (e.g. brand-new mints that haven't been
// classified). Caches each result within a 30-second window so repeated
// lookups within a burst share one DB round-trip.

import { sql } from '../../api/_lib/db.js';
import { log } from './log.js';

const _cache = new Map(); // key → { score, ts }
const CACHE_TTL_MS = 30_000;

function n(v) {
	const x = Number(v);
	return Number.isFinite(x) ? x : null;
}

/**
 * Look up the Oracle conviction score for a mint and decide whether the
 * strategy's min_oracle_score threshold is met.
 *
 * Returns:
 *   { pass: true }                        — scored and above threshold (or no threshold)
 *   { pass: false, reason: string }        — scored and below threshold
 *   { pass: true, skipped: true }          — no Oracle score yet; gate deferred
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

	if (score < minScore) {
		return { pass: false, reason: `oracle_below_min:${score}<${minScore}` };
	}

	return { pass: true };
}
