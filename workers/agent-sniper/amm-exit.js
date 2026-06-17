// agent-sniper — post-graduation AMM exit.
//
// When a position's coin graduates off the pump.fun bonding curve onto the
// canonical pump AMM pool, the bonding-curve sell path (PumpTradeClient
// quoteForSell / buildSellInstructions) can no longer price or close it. This
// module re-quotes and builds the sell against the AMM pool instead, so a
// graduated position still exits on stop-loss / trailing / take-profit /
// timeout with a real fill — never parked.
//
// It reuses the SAME pool resolution + SDK calls the user-driven sell path uses
// (api/pump/[action].js → getAmmPoolState + PumpAmmSdk.sellBaseInput), so there
// is one source of truth for AMM pricing across the platform. All amounts are
// quote atomics; the sniper trades SOL-quoted curves (require_sol_quote), so the
// quote currency on the resolved pool is wSOL and atomics are lamports.

import { getAmmPoolState, getConnection } from '../../api/_lib/pump.js';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Resolve the canonical AMM pool for a graduated mint and read everything the
// pricing + instruction builders need. Throws { code:'pool_not_found' } when the
// coin has NOT graduated (no pool yet) so callers can distinguish "still on the
// curve" from a transient RPC error.
async function resolvePool(network, mintStr) {
	const amm = await getAmmPoolState({ network, mint: mintStr });
	const sdk = await import('@pump-fun/pump-swap-sdk');
	return { amm, sdk };
}

/**
 * Has `mint` graduated to the AMM on `network`? Deterministic — a live canonical
 * pool means the coin is off the curve. Returns false for a missing pool (still
 * on the curve); rethrows transient RPC errors so callers don't treat an outage
 * as "not graduated".
 */
export async function isGraduated({ network, mint }) {
	try {
		await getAmmPoolState({ network, mint });
		return true;
	} catch (err) {
		if (err?.code === 'pool_not_found') return false;
		throw err;
	}
}

/**
 * Re-quote a graduated position's current SOL value off the AMM pool. Mirrors
 * the read-side quote in api/pump/[action].js (functional sellBaseInput against
 * live reserves). Returns lamports (atomics) the sale would net, plus the
 * min-out floor and a derived price-impact figure for the circuit breaker.
 *
 * @param {object} p
 * @param {'mainnet'|'devnet'} p.network
 * @param {string} p.mint
 * @param {import('bn.js')} p.baseAmount   token base units held (BN)
 * @param {number} p.slippagePct
 * @returns {Promise<{ poolKey: string, expectedQuoteOut: bigint, minQuoteOut: bigint, priceImpactPct: number }>}
 * @throws {Error} { code: 'pool_not_found' } when the coin has not graduated.
 */
export async function quoteAmmSell({ network, mint, baseAmount, slippagePct }) {
	const { amm, sdk } = await resolvePool(network, mint);
	const priced = priceSellFromPool(amm, sdk, baseAmount, slippagePct);
	return { poolKey: amm.poolKey.toString(), ...priced };
}

// Price a base-token sell against a resolved AMM pool. Mirrors the read-side
// quote in api/pump/[action].js (functional sellBaseInput against live
// reserves). The sniper only opens SOL-quoted curves (require_sol_quote), so a
// pool that resolved to a non-SOL quote breaks the lamports-denominated PnL math
// — refuse rather than mis-price.
function priceSellFromPool(amm, sdk, baseAmount, slippagePct) {
	const { pool, baseReserve, quoteReserve, baseMintAccount, globalConfig, feeConfig } = amm;

	const resolvedQuoteMint = pool.quoteMint?.toString?.() ?? WSOL_MINT;
	if (resolvedQuoteMint !== WSOL_MINT) {
		const e = new Error(`amm pool quote is ${resolvedQuoteMint}, expected wSOL`);
		e.code = 'amm_quote_not_sol';
		throw e;
	}

	const r = sdk.sellBaseInput({
		base: baseAmount,
		slippage: slippagePct,
		baseReserve,
		quoteReserve,
		globalConfig,
		baseMintAccount,
		baseMint: pool.baseMint,
		coinCreator: pool.coinCreator,
		creator: pool.creator,
		feeConfig,
	});
	const expectedQuoteOut = BigInt((r.uiQuote ?? r.minQuote).toString());
	const minQuoteOut = BigInt((r.minQuote ?? r.uiQuote).toString());

	// Price impact: the spot value of the base at current reserves vs. what the
	// constant-product sale actually nets. quote/base spot * base = ideal; the
	// shortfall is impact. Guards a thin post-graduation pool the same way the
	// entry breaker guards a thin curve.
	const priceImpactPct = derivePriceImpact(baseReserve, quoteReserve, baseAmount, expectedQuoteOut);

	return { expectedQuoteOut, minQuoteOut, priceImpactPct };
}

/**
 * Build the AMM sell instructions for a graduated position. Mirrors the
 * user-driven sell builder (api/pump/[action].js): swapSolanaState for the
 * pool + the offline SDK's sellBaseInput, which embeds the slippage-derived
 * min-out floor on-chain. Returns the instructions plus the expected/min SOL out.
 *
 * @param {object} p
 * @param {'mainnet'|'devnet'} p.network
 * @param {string} p.mint
 * @param {import('@solana/web3.js').PublicKey} p.user
 * @param {import('bn.js')} p.baseAmount   token base units held (BN)
 * @param {number} p.slippagePct
 * @returns {Promise<{ instructions: import('@solana/web3.js').TransactionInstruction[], poolKey: string, expectedQuoteOut: bigint, minQuoteOut: bigint, priceImpactPct: number }>}
 * @throws {Error} { code: 'pool_not_found' } when the coin has not graduated.
 */
export async function buildAmmSellInstructions({ network, mint, user, baseAmount, slippagePct }) {
	const { amm, sdk } = await resolvePool(network, mint);
	const priced = priceSellFromPool(amm, sdk, baseAmount, slippagePct);

	const offline = new sdk.PumpAmmSdk();
	const online = new sdk.OnlinePumpAmmSdk(getConnection({ network }));
	const swapState = await online.swapSolanaState(amm.poolKey, user);
	const instructions = await offline.sellBaseInput(swapState, baseAmount, slippagePct);

	return { instructions, poolKey: amm.poolKey.toString(), ...priced };
}

// Constant-product price impact for selling `baseIn` into a pool, as a percent
// of the no-impact (spot) value. Clamped to [0, 100]; returns 0 if reserves are
// missing so a quote can't be falsely rejected by the breaker.
function derivePriceImpact(baseReserve, quoteReserve, baseIn, quoteOut) {
	const b = Number(baseReserve?.toString?.() ?? baseReserve ?? 0);
	const q = Number(quoteReserve?.toString?.() ?? quoteReserve ?? 0);
	const inAmt = Number(baseIn?.toString?.() ?? baseIn ?? 0);
	const out = Number(quoteOut ?? 0);
	if (!(b > 0) || !(q > 0) || !(inAmt > 0)) return 0;
	const spotOut = (inAmt * q) / b; // quote per base at current spot * baseIn
	if (!(spotOut > 0)) return 0;
	const impact = ((spotOut - out) / spotOut) * 100;
	if (!Number.isFinite(impact)) return 0;
	return Math.max(0, Math.min(100, impact));
}
