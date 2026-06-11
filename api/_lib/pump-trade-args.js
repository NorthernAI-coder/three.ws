// Pure argument helpers for pump.fun trade instruction building.
//
// Two SDK conventions these helpers exist to get right, verified against the
// vendored docs/IDLs in docs/pumpfun-program/ and the installed
// @pump-fun/pump-sdk@1.36.0 / @pump-fun/pump-swap-sdk@1.17.0 sources:
//
// 1. Slippage unit. Every @pump-fun builder takes slippage as a PERCENT
//    (`slippage: 1` = 1%): pump-sdk pads/floors via
//    `amount * floor(slippage * 10) / 1000`, pump-swap-sdk via
//    `1 ± slippage / 100`. Passing a fraction (bps / 10_000) silently
//    truncates the protection to ~0 on the curve and 100x too tight on the AMM.
//
// 2. Base token program. `create_v2` coins (every coin pump.fun mints today,
//    SOL- and USDC-paired alike) use Token-2022 base mints; legacy coins use
//    SPL Token. BUY.md/SELL.md require `base_token_program` to match the mint
//    owner, so it must be read from the mint account, never assumed.
//
// Pure + dependency-light so it is unit-testable without the chain.

import { PublicKey } from '@solana/web3.js';

export const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const KNOWN_TOKEN_PROGRAMS = new Set([
	SPL_TOKEN_PROGRAM_ID.toBase58(),
	TOKEN_2022_PROGRAM_ID.toBase58(),
]);

/**
 * Convert user-facing slippage basis points into the percent unit every
 * @pump-fun SDK builder expects. 100 bps -> 1 (percent).
 * Clamps to [0, 100] percent and returns the default (1%) for non-finite input.
 */
export function slippagePercentFromBps(bps, { defaultBps = 100 } = {}) {
	const n = Number(bps);
	const effective = Number.isFinite(n) ? n : defaultBps;
	return Math.max(0, Math.min(10_000, effective)) / 100;
}

/**
 * Resolve the token program for a mint from its account owner.
 * Throws a typed 422 for mints owned by anything other than SPL Token or
 * Token-2022 — building a trade against an unknown token program can only
 * fail on-chain, so fail fast here.
 *
 * @param {PublicKey|string} owner  The mint account's `owner` field.
 * @returns {PublicKey} SPL_TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID.
 */
export function resolveTokenProgramForMintOwner(owner) {
	const ownerPk = owner instanceof PublicKey ? owner : new PublicKey(owner);
	if (!KNOWN_TOKEN_PROGRAMS.has(ownerPk.toBase58())) {
		const e = new Error(
			`mint owned by unknown token program ${ownerPk.toBase58()} — not an SPL/Token-2022 mint`,
		);
		e.status = 422;
		e.code = 'unsupported_token_program';
		throw e;
	}
	return ownerPk.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : SPL_TOKEN_PROGRAM_ID;
}
