/**
 * Client-side SOL/USD price helper — single source of truth for USD equivalents.
 *
 * USDC: treated as exactly $1 (it's a dollar-pegged stablecoin).
 * SOL:  fetched from Jupiter Lite API (CoinGecko fallback), cached 60 s.
 *
 * Never hardcodes a SOL rate; degrades silently on feed failure so prices
 * in USDC still show "≈ $X" while SOL amounts just show the raw amount.
 */

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const CACHE_TTL_MS = 60_000;

let _solPrice = 0;
let _solPriceAt = 0;

/** Fetch (and cache) the live SOL/USD price. Throws if the feed is unavailable. */
export async function getSolPriceUsd() {
	if (Date.now() - _solPriceAt < CACHE_TTL_MS && _solPrice > 0) return _solPrice;
	try {
		const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`);
		if (r.ok) {
			const data = await r.json();
			const p = data?.[SOL_MINT]?.usdPrice ?? data?.[SOL_MINT]?.price ?? 0;
			if (Number(p) > 0) {
				_solPrice = Number(p);
				_solPriceAt = Date.now();
				return _solPrice;
			}
		}
	} catch { /* fall through to CoinGecko */ }
	try {
		const cg = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
		if (!cg.ok) throw new Error(`CoinGecko ${cg.status}`);
		const j = await cg.json();
		const p = j?.solana?.usd ?? 0;
		if (Number(p) > 0) {
			_solPrice = Number(p);
			_solPriceAt = Date.now();
			return _solPrice;
		}
	} catch { /* fall through */ }
	throw Object.assign(new Error('SOL price unavailable'), { code: 'price_unavailable' });
}

/** USDC → USD (1:1, pegged stablecoin). */
export function usdcToUsd(amount) {
	return Number(amount);
}

/** SOL → USD using the live feed. Returns null if the feed fails. */
export async function solToUsd(solAmount) {
	try {
		const price = await getSolPriceUsd();
		return Number(solAmount) * price;
	} catch {
		return null;
	}
}

function fmtUsdValue(n) {
	if (!Number.isFinite(n) || n < 0) return '';
	if (n === 0) return '≈ $0.00';
	if (n < 0.0001) return `≈ $${n.toFixed(6).replace(/0+$/, '')}`;
	if (n < 0.01)   return `≈ $${n.toFixed(4)}`;
	if (n < 1)      return `≈ $${n.toFixed(3)}`;
	if (n < 1000)   return `≈ $${n.toFixed(2)}`;
	return `≈ $${Math.round(n).toLocaleString()}`;
}

/** Format a USDC amount as a USD equivalent string (synchronous, no feed needed). */
export function formatUsdcEq(usdcAmount) {
	return fmtUsdValue(usdcToUsd(usdcAmount));
}

/** Format a SOL amount as a USD equivalent string (async, needs live feed). */
export async function formatSolEq(solAmount) {
	const usd = await solToUsd(solAmount);
	return usd !== null ? fmtUsdValue(usd) : '';
}

/**
 * Attach a live USD-equivalent hint to a DOM element.
 *
 * Immediately inserts a `<span class="usd-eq">` next to the element's price
 * text (hidden while loading). Once the price resolves, the span becomes
 * visible with "≈ $X.XX". On feed failure for SOL, the span stays hidden —
 * the original crypto amount is unaffected.
 *
 * @param {Element}  el       Element that holds or follows the price display
 * @param {number}   amount   Crypto amount (human units: USDC or SOL)
 * @param {string}   currency 'USDC' | 'SOL'
 * @returns {HTMLSpanElement}  The injected span (can be discarded)
 */
export function attachUsdEq(el, amount, currency) {
	let span = el.querySelector('.usd-eq');
	if (!span) {
		span = document.createElement('span');
		span.className = 'usd-eq';
		el.appendChild(span);
	}
	span.textContent = '';
	span.hidden = true;

	const cur = (currency || '').toUpperCase();
	if (cur === 'USDC') {
		const eq = formatUsdcEq(amount);
		if (eq) { span.textContent = eq; span.hidden = false; }
	} else if (cur === 'SOL') {
		formatSolEq(amount).then((eq) => {
			if (eq) { span.textContent = eq; span.hidden = false; }
		});
	}
	return span;
}
