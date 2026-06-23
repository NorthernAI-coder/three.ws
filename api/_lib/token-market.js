// Generic, coin-agnostic token market reader + signal builder.
//
// The mint is supplied at runtime by the caller — this is the plumbing the
// CA → x402 resolver (/ca2x402) and the generic /api/x402/token-intel service
// share. It is deliberately symbol-aware (no hardcoded ticker) so it works for
// any token a user pastes, while the platform still only ever *promotes*
// $THREE. Data is live DexScreener (no key, no mock path).
//
// The $THREE-specific oracle (/api/x402/three-intel) keeps its own THREE-branded
// copy on purpose — it is pinned to one mint and unit-tested as such.

import { isValidSolanaAddress, isValidEvmAddress } from './validate.js';

const DEXSCREENER_TOKENS = 'https://api.dexscreener.com/latest/dex/tokens/';

/**
 * Is this string a plausible token contract address we can resolve?
 * Accepts Solana base58 mints and EVM 0x addresses — DexScreener indexes both.
 * @param {string} ca
 * @returns {boolean}
 */
export function isResolvableAddress(ca) {
	return isValidSolanaAddress(ca) || isValidEvmAddress(ca);
}

/** Chain family of a contract address, or null if unrecognized. */
export function chainOf(ca) {
	if (isValidEvmAddress(ca)) return 'evm';
	if (isValidSolanaAddress(ca)) return 'solana';
	return null;
}

function num(v) {
	const n = typeof v === 'string' ? parseFloat(v) : v;
	return Number.isFinite(n) ? n : null;
}

/**
 * Fetch live market + identity for any token by contract address.
 *
 * Picks the deepest-liquidity pair across all DEXs/chains DexScreener knows
 * about for the address. Returns null when the token is unknown or upstream is
 * unavailable — callers decide how to surface that (the resolver renders a
 * designed "not found" state; the paid endpoint throws 503 before settling so
 * the buyer is never charged for missing data).
 *
 * @param {string} ca contract address (Solana mint or EVM 0x)
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<null | {
 *   mint: string, symbol: string|null, name: string|null, image: string|null,
 *   chain: string|null, dex: string|null, pair_url: string|null,
 *   price_usd: number|null, change_24h: number|null, market_cap_usd: number|null,
 *   liquidity_usd: number|null, volume_24h_usd: number|null, pair_created_at: number|null,
 * }>}
 */
export async function fetchTokenMarket(ca, opts = {}) {
	const r = await fetch(`${DEXSCREENER_TOKENS}${encodeURIComponent(ca)}`, {
		headers: { Accept: 'application/json' },
		signal: opts.signal ?? AbortSignal.timeout(6000),
	});
	if (!r.ok) return null;
	const data = await r.json().catch(() => null);
	const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
	if (!pairs.length) return null;

	pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
	const p = pairs[0];

	// The address can be either side of a pair; pick the token that matches.
	const lc = ca.toLowerCase();
	const base = p.baseToken || {};
	const quote = p.quoteToken || {};
	const tok = (base.address || '').toLowerCase() === lc ? base
		: (quote.address || '').toLowerCase() === lc ? quote
		: base;
	const info = p.info || {};

	return {
		mint: tok.address || ca,
		symbol: tok.symbol || null,
		name: tok.name || null,
		image: info.imageUrl || null,
		chain: p.chainId || null,
		dex: p.dexId || null,
		pair_url: p.url || null,
		price_usd: num(p.priceUsd),
		change_24h: p.priceChange?.h24 ?? null,
		market_cap_usd: num(p.marketCap) ?? num(p.fdv),
		liquidity_usd: num(p.liquidity?.usd),
		volume_24h_usd: num(p.volume?.h24),
		pair_created_at: num(p.pairCreatedAt),
	};
}

/**
 * Build a bullish/bearish/neutral signal from market data, branded to the
 * token's own symbol. Mirrors the $THREE oracle thresholds so the generated
 * service reads consistently with the in-house one.
 *
 * @param {{ symbol?: string|null, price_usd: number|null, change_24h: number,
 *           volume_24h_usd: number|null, liquidity_usd: number|null }} m
 */
export function buildTokenSignal(m) {
	const sym = (m.symbol || 'token').toUpperCase();
	const change = Number(m.change_24h) || 0;
	const fmt = (n) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(6));
	const pStr = m.price_usd != null ? `$${fmt(m.price_usd)}` : '?';
	const sign = change >= 0 ? '+' : '';
	const cStr = `${sign}${change.toFixed(2)}%`;

	const turnover =
		m.volume_24h_usd != null && m.liquidity_usd ? m.volume_24h_usd / m.liquidity_usd : null;
	const flowLine =
		turnover == null ? 'Flow data is thin; weigh the move accordingly.'
		: turnover > 3 ? 'Volume is running hot against liquidity — high conviction behind the move.'
		: turnover > 1 ? 'Volume is healthy against liquidity; participation is real.'
		: 'Volume is light against liquidity; the move has limited backing so far.';

	let signal, headline;
	if (change > 5) {
		signal = 'bullish';
		headline = `${sym} surges ${cStr} in 24 h — strong momentum`;
	} else if (change > 1) {
		signal = 'bullish';
		headline = `${sym} climbs ${cStr} — moderate upside`;
	} else if (change < -5) {
		signal = 'bearish';
		headline = `${sym} drops ${Math.abs(change).toFixed(2)}% — sellers in control`;
	} else if (change < -1) {
		signal = 'bearish';
		headline = `${sym} slips ${cStr} — mild weakness`;
	} else {
		signal = 'neutral';
		headline = `${sym} flat at ${cStr} — consolidating at ${pStr}`;
	}

	const rationale = `${sym} is ${change >= 0 ? 'up' : 'down'} ${cStr} over 24 h, trading at ${pStr}. ${flowLine}`;
	const confidence = Math.min(0.93, 0.64 + Math.min(Math.abs(change) / 20, 0.29));
	return { signal, headline, rationale, confidence };
}
