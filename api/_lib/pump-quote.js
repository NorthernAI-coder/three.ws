// Quote-currency resolution for pump.fun agent-token launches.
//
// Agent tokens earn USDC (x402 payments → buyback vault) and burn via the
// USDC-funded buyback. For that buyback to swap USDC → the agent's token, the
// coin's bonding curve must be USDC-paired (quote mint = USDC). This module is
// the single place that classifies a requested launch quote into SOL- vs
// USDC-paired so the launch handlers, persistence, and UI stay consistent.
//
// Pure + dependency-light so it is unit-testable without the chain.

import { SOLANA_USDC_MINT, SOLANA_USDC_MINT_DEVNET } from '../payments/_config.js';

// Wrapped SOL — the canonical quote mint for SOL-paired coins under the v2
// unified interface. On-chain SOL curves store `bonding_curve.quote_mint` as the
// system default pubkey (all-zeros); both mean "SOL-paired".
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const SYSTEM_DEFAULT_PUBKEY = '11111111111111111111111111111111';

/** The USDC mint for a network ('mainnet' | 'devnet'). */
export function usdcMintFor(network) {
	return network === 'devnet' ? SOLANA_USDC_MINT_DEVNET : SOLANA_USDC_MINT;
}

/**
 * Classify a requested launch quote mint.
 *
 * @param {object} args
 * @param {string|null|undefined} args.quoteMint  Requested quote mint (base58),
 *   or null/omitted for SOL-paired.
 * @param {'mainnet'|'devnet'} [args.network='mainnet']
 * @returns {{ isUsdc: boolean, quoteMint: string|null, label: 'SOL'|'USDC'|'TOKEN' }}
 *   - `quoteMint`: canonical value to persist — `null` for SOL-paired (so the
 *     SDK/curve uses native SOL), or the explicit mint for a stable pair.
 *   - `isUsdc`: true for any non-SOL quote (stable-paired).
 *   - `label`: display label; 'USDC' when it matches the network USDC mint.
 */
export function classifyLaunchQuote({ quoteMint, network = 'mainnet' } = {}) {
	const q = typeof quoteMint === 'string' ? quoteMint.trim() : '';
	if (!q || q === WSOL_MINT || q === SYSTEM_DEFAULT_PUBKEY) {
		return { isUsdc: false, quoteMint: null, label: 'SOL' };
	}
	return { isUsdc: true, quoteMint: q, label: q === usdcMintFor(network) ? 'USDC' : 'TOKEN' };
}
