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
	const txns = p.txns || {};

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
		// Multi-timeframe price change (% per window) — the shape of the move, not
		// just the 24 h endpoint. Lets the signal read acceleration vs. exhaustion.
		momentum: {
			m5: num(p.priceChange?.m5),
			h1: num(p.priceChange?.h1),
			h6: num(p.priceChange?.h6),
			h24: num(p.priceChange?.h24),
		},
		// Buy/sell transaction counts over 24 h — real order flow, the difference
		// between accumulation and distribution behind the same price move.
		txns_24h: { buys: num(txns.h24?.buys), sells: num(txns.h24?.sells) },
	};
}

/** Money formatter for risk-factor copy — compact, human, no library. */
function usd(n) {
	if (n == null || !Number.isFinite(n)) return '$?';
	if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
	return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** Human pair age from a millisecond span. */
function fmtAge(ms) {
	if (ms == null || !Number.isFinite(ms)) return 'unknown age';
	const h = ms / 3_600_000;
	if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
	if (h < 48) return `${Math.round(h)}h`;
	return `${Math.round(h / 24)}d`;
}

/**
 * Score the safety of any token from its live market shape — the due-diligence
 * layer behind the CA → x402 oracle. Higher score = MORE risk (0 safe … 100
 * critical). Every input is real DexScreener data; nothing is fabricated, and a
 * missing field degrades to an honest "unknown" factor rather than a fake pass.
 *
 * `now` is injectable so the result is deterministic under test.
 *
 * @param {object} m a fetchTokenMarket() result
 * @param {number} [now] epoch ms, defaults to wall clock
 * @returns {{ score:number, level:'low'|'medium'|'high'|'critical',
 *             summary:string, factors:Array<{label:string,status:string,detail:string}> }}
 */
export function buildTokenRisk(m, now = Date.now()) {
	const sym = (m.symbol || 'This token').toUpperCase();
	const factors = [];
	let risk = 0;

	// 1) Liquidity depth — the single biggest exit-risk signal.
	const liq = m.liquidity_usd;
	if (liq == null) {
		factors.push({ label: 'Liquidity', status: 'unknown', detail: 'Pool depth unavailable from upstream.' });
		risk += 18;
	} else if (liq < 5_000) {
		factors.push({ label: 'Liquidity', status: 'critical', detail: `Only ${usd(liq)} pooled — trivially drained, severe exit risk.` });
		risk += 40;
	} else if (liq < 25_000) {
		factors.push({ label: 'Liquidity', status: 'high', detail: `${usd(liq)} is thin — large orders slip hard.` });
		risk += 26;
	} else if (liq < 100_000) {
		factors.push({ label: 'Liquidity', status: 'medium', detail: `${usd(liq)} pooled — moderate depth.` });
		risk += 12;
	} else {
		factors.push({ label: 'Liquidity', status: 'low', detail: `${usd(liq)} pooled — healthy depth.` });
	}

	// 2) Pair age — brand-new pairs are unproven and the most rug-prone.
	const ageMs = m.pair_created_at ? now - m.pair_created_at : null;
	const ageDays = ageMs != null ? ageMs / 86_400_000 : null;
	if (ageDays == null) {
		factors.push({ label: 'Age', status: 'unknown', detail: 'Pair creation time unavailable.' });
	} else if (ageDays < 1) {
		factors.push({ label: 'Age', status: 'high', detail: `Pair is ${fmtAge(ageMs)} old — unproven and volatile.` });
		risk += 22;
	} else if (ageDays < 7) {
		factors.push({ label: 'Age', status: 'medium', detail: `Pair is ${Math.round(ageDays)}d old — still early.` });
		risk += 10;
	} else {
		factors.push({ label: 'Age', status: 'low', detail: `Pair is ${fmtAge(ageMs)} old — established.` });
	}

	// 3) Float vs. depth — a huge cap on thin liquidity is easy to swing/dump.
	const cap = m.market_cap_usd;
	if (cap != null && liq) {
		const ratio = cap / liq;
		if (ratio > 100) {
			factors.push({ label: 'Float', status: 'high', detail: `Cap is ${Math.round(ratio)}× liquidity — thin float, easy to swing.` });
			risk += 16;
		} else if (ratio > 30) {
			factors.push({ label: 'Float', status: 'medium', detail: `Cap is ${Math.round(ratio)}× liquidity.` });
			risk += 7;
		} else {
			factors.push({ label: 'Float', status: 'low', detail: `Cap is ${ratio.toFixed(1)}× liquidity — well backed.` });
		}
	}

	// 4) Order flow — are the trades net buys or net sells over 24 h?
	const buys = m.txns_24h?.buys;
	const sells = m.txns_24h?.sells;
	if (buys != null && sells != null && buys + sells > 0) {
		const sellShare = sells / (buys + sells);
		if (sellShare > 0.62) {
			factors.push({ label: 'Flow', status: 'high', detail: `${Math.round(sellShare * 100)}% of 24 h trades are sells — net distribution.` });
			risk += 12;
		} else if (sellShare < 0.4) {
			factors.push({ label: 'Flow', status: 'low', detail: `${Math.round((1 - sellShare) * 100)}% of 24 h trades are buys — net accumulation.` });
		} else {
			factors.push({ label: 'Flow', status: 'medium', detail: 'Buy/sell flow is roughly balanced.' });
		}
	}

	const score = Math.max(0, Math.min(100, Math.round(risk)));
	const level = score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 22 ? 'medium' : 'low';
	const summary =
		level === 'critical' ? `${sym} carries critical risk — treat any position as speculative.`
		: level === 'high' ? `${sym} shows elevated risk; size positions with care.`
		: level === 'medium' ? `${sym} carries moderate risk — normal memecoin caution applies.`
		: `${sym} clears the basic depth, age, and flow checks.`;

	return { score, level, summary, factors };
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

	// Order-flow clause — buy/sell skew over 24 h, when DexScreener reports txns.
	const buys = m.txns_24h?.buys;
	const sells = m.txns_24h?.sells;
	const pressureLine =
		buys != null && sells != null && buys + sells > 0
			? sells / (buys + sells) > 0.6 ? ' Sellers dominate the tape.'
				: buys / (buys + sells) > 0.6 ? ' Buyers dominate the tape.'
				: ' Tape is two-sided.'
			: '';

	// Acceleration clause — compare the latest hour to the 24 h trend so the
	// rationale flags a move that is fading or reversing, not just its endpoint.
	const h1 = m.momentum?.h1;
	const accelLine =
		h1 == null ? ''
		: change > 1 && h1 < -0.5 ? ' Momentum is cooling in the last hour.'
		: change < -1 && h1 > 0.5 ? ' It is bouncing in the last hour.'
		: change > 1 && h1 > 1 ? ' The last hour confirms the trend.'
		: '';

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

	const rationale = `${sym} is ${change >= 0 ? 'up' : 'down'} ${cStr} over 24 h, trading at ${pStr}. ${flowLine}${pressureLine}${accelLine}`;
	const confidence = Math.min(0.93, 0.64 + Math.min(Math.abs(change) / 20, 0.29));
	return { signal, headline, rationale, confidence };
}
