// Pure math + policy parsing for the programmatic $THREE buyback.
//
// Deliberately free of DB / RPC / web3 imports so it can be unit-tested in
// isolation and reused without dragging in the Solana stack. All money math is
// BigInt-on-atomics; only display conversions return Number.

export const USDC_DECIMALS = 6;
export const USDC_ATOMICS = 10n ** BigInt(USDC_DECIMALS);

/** Parse a positive-USD env value, falling back when unset/invalid. */
export function envUsd(raw, fallback) {
	if (raw === undefined || String(raw).trim() === '') return fallback;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Parse a slippage-bps env value (0 < bps ≤ 5000), else fallback. */
export function envSlippageBps(raw, fallback = 300) {
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 && n <= 5000 ? Math.round(n) : fallback;
}

/** Whole USD → USDC atomics (6dp), floored. */
export function usdToUsdcAtomics(usd) {
	return BigInt(Math.floor(Number(usd) * Number(USDC_ATOMICS)));
}

/** USDC atomics (6dp) → whole USD. */
export function usdcAtomicsToUsd(atomics) {
	return Number(BigInt(atomics)) / Number(USDC_ATOMICS);
}

/** Token atomics → whole tokens at the given decimals. */
export function atomicsToTokens(atomics, decimals) {
	return Number(BigInt(atomics)) / 10 ** Number(decimals);
}

/**
 * Decide how much USDC to deploy this run: spend up to the per-run cap, bounded
 * by the wallet's live balance, and only if it clears the minimum (so a run never
 * pays more in fees than it buys). Pure — the single source of sizing truth.
 *
 * @param {bigint|string|number} walletUsdcAtomics live USDC balance (atomics)
 * @param {{ maxUsd: number, minUsd: number }} caps
 * @returns {{ spendAtomics: bigint, reason: 'ok'|'empty'|'below_threshold' }}
 */
export function computeSpend(walletUsdcAtomics, { maxUsd, minUsd }) {
	const wallet = BigInt(walletUsdcAtomics);
	const cap = usdToUsdcAtomics(maxUsd);
	const min = usdToUsdcAtomics(minUsd);
	const spend = wallet > cap ? cap : wallet;
	if (spend < min) {
		return { spendAtomics: 0n, reason: wallet === 0n ? 'empty' : 'below_threshold' };
	}
	return { spendAtomics: spend, reason: 'ok' };
}

/** Share of revenue already deployed to buybacks, clamped to [0,100]. */
export function deployedPct(deployedUsd, revenueUsd) {
	if (!(revenueUsd > 0)) return 0;
	return Math.min(100, (deployedUsd / revenueUsd) * 100);
}
