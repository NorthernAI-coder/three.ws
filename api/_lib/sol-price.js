// @ts-check
// Canonical SOL/USD spot price, cached ~60s. Used anywhere a SOL amount needs a
// USD valuation captured at the moment it happens (accounting ledgers, receipts).
//
// The economy ledger records `sol_usd` on every transfer so an accountant reads
// the dollar value as of the transfer instant, not as of report time. This is the
// one shared implementation — see api/_lib/pump-alert-runner.js / pump-launch-feed.js
// for the older inline copies this consolidates.

const TTL_MS = 60_000;
const ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

let _price = 0;
let _at = 0;

async function fetchJsonWithTimeout(url, ms) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ms);
	try {
		const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
		if (!r.ok) throw new Error(`http_${r.status}`);
		return await r.json();
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Current SOL price in USD (spot), cached for 60s. Returns the last good value on
 * a fetch failure, or 0 if it has never resolved — callers store 0 as "unpriced"
 * rather than corrupting a valuation with a guess.
 * @param {number} [now]
 * @returns {Promise<number>}
 */
export async function solPriceUsd(now = Date.now()) {
	if (now - _at < TTL_MS && _price > 0) return _price;
	try {
		const d = await fetchJsonWithTimeout(ENDPOINT, 3000);
		const p = d?.solana?.usd;
		if (typeof p === 'number' && p > 0) {
			_price = p;
			_at = now;
		}
	} catch {
		/* keep last good value; 0 until first success */
	}
	return _price || 0;
}
