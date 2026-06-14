#!/usr/bin/env node
// Devnet smoke trade — real bonding-curve buy + sell against the pump.fun
// program on Solana devnet.
//
// Purpose: verify on-chain the GAP-1 fix from
// docs/pumpfun-program/AUDIT-2026-06-11.md — curve buys used to send
// `amount: new BN(0)` to the bonding curve, so they could never execute. This
// script drives the SAME production helpers the fixed dispatcher buy-prep /
// sell-prep handlers use (getPumpSdk, slippagePercentFromBps,
// resolveTokenProgramForMintOwner, buyV2Instructions / sellV2Instructions with
// a real getBuyTokenAmountFromSolAmount / getSellSolAmountFromTokenAmount),
// signs the transactions with a funded devnet keypair, and submits them.
//
// It does three things end to end:
//   1. (optional) creates a fresh create_v2 bonding-curve token on devnet,
//   2. buys ~0.01 SOL of it on the curve (buy_v2 — the path that was broken),
//   3. sells the full received balance back (sell_v2, with a real min-out floor).
//
// Devnet only. Never point this at mainnet or a mainnet key.
//
// Env / flags:
//   --rpc <url>        | SOLANA_RPC_URL_DEVNET   devnet RPC (default api.devnet.solana.com)
//   --keypair <path>   | DEVNET_TEST_WALLET      JSON byte-array or base58 secret key
//   --mint <base58>                              existing devnet curve mint to trade;
//                                                if omitted, a fresh token is created
//   --sol <n>                                    quote SOL to spend on the buy (default 0.01)
//   --slippage-bps <n>                           default 500 (5%)
//
// Example:
//   node scripts/devnet-smoke-trade.mjs \
//     --rpc https://api.devnet.solana.com \
//     --keypair /tmp/devnet-test-wallet.json

import fs from 'node:fs';
import {
	Connection,
	Keypair,
	PublicKey,
	Transaction,
	sendAndConfirmTransaction,
	LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import BN from 'bn.js';
import * as spl from '@solana/spl-token';
import {
	getBuyTokenAmountFromSolAmount,
	getSellSolAmountFromTokenAmount,
	isLegacyQuoteMint,
} from '@pump-fun/pump-sdk';

import { getPumpSdk } from '../api/_lib/pump.js';
import {
	slippagePercentFromBps,
	resolveTokenProgramForMintOwner,
} from '../api/_lib/pump-trade-args.js';

// ── args ─────────────────────────────────────────────────────────────────────

function flag(name, fallbackEnv) {
	const i = process.argv.indexOf(`--${name}`);
	if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
	return fallbackEnv ? process.env[fallbackEnv] : undefined;
}

const RPC = flag('rpc', 'SOLANA_RPC_URL_DEVNET') || 'https://api.devnet.solana.com';
const KEYPAIR_PATH = flag('keypair', 'DEVNET_TEST_WALLET');
const EXISTING_MINT = flag('mint');
const BUY_SOL = Number(flag('sol') || '0.01');
const SLIPPAGE_BPS = Number(flag('slippage-bps') || '500');

if (/mainnet/i.test(RPC)) {
	console.error('Refusing to run against a mainnet RPC. Devnet only.');
	process.exit(1);
}
if (!KEYPAIR_PATH) {
	console.error('Missing --keypair <path> (or DEVNET_TEST_WALLET). Devnet signer required.');
	process.exit(1);
}

function loadKeypair(path) {
	const raw = fs.readFileSync(path, 'utf8').trim();
	try {
		return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
	} catch {
		return Keypair.fromSecretKey(bs58.decode(raw));
	}
}

// ── send helper ──────────────────────────────────────────────────────────────

async function send(connection, instructions, signers, label) {
	const tx = new Transaction();
	tx.add(...instructions);
	tx.feePayer = signers[0].publicKey;
	const sig = await sendAndConfirmTransaction(connection, tx, signers, {
		commitment: 'confirmed',
		skipPreflight: false,
	});
	console.log(`${label} tx: ${sig}`);
	console.log(`  explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
	return sig;
}

// ── main ─────────────────────────────────────────────────────────────────────

const connection = new Connection(RPC, 'confirmed');
const wallet = loadKeypair(KEYPAIR_PATH);
console.log(`RPC:      ${RPC}`);
console.log(`Wallet:   ${wallet.publicKey.toBase58()}`);

const balance = await connection.getBalance(wallet.publicKey);
console.log(`Balance:  ${balance / LAMPORTS_PER_SOL} SOL`);
if (balance < 0.05 * LAMPORTS_PER_SOL) {
	console.error(
		`Insufficient devnet SOL (need ~0.05 for create + buy + sell + rent). ` +
			`Fund ${wallet.publicKey.toBase58()} via https://faucet.solana.com (devnet).`,
	);
	process.exit(1);
}

// getPumpSdk reads SOLANA_RPC_URL_DEVNET for the 'devnet' network — make sure
// the helper sees the same RPC we resolved here.
process.env.SOLANA_RPC_URL_DEVNET = RPC;
const { sdk } = await getPumpSdk({ network: 'devnet' });

const slippagePct = slippagePercentFromBps(SLIPPAGE_BPS);
console.log(`Slippage: ${SLIPPAGE_BPS} bps -> ${slippagePct}% (SDK percent unit)`);

// 1) Resolve or create the test mint ─────────────────────────────────────────
let mintPk;
if (EXISTING_MINT) {
	mintPk = new PublicKey(EXISTING_MINT);
	console.log(`\nUsing existing mint: ${mintPk.toBase58()}`);
} else {
	const mintKp = Keypair.generate();
	mintPk = mintKp.publicKey;
	console.log(`\nCreating devnet test token: ${mintPk.toBase58()}`);
	// create_v2 (Token-2022 base mint), no initial dev buy — the curve starts
	// empty and the standalone buy below exercises the buy_v2 fix in isolation.
	const createIx = await sdk.createV2Instruction({
		mint: mintPk,
		name: 'THREE Test Token',
		symbol: 'T3T',
		uri: 'https://three.ws/t3t-devnet-smoke.json',
		creator: wallet.publicKey,
		user: wallet.publicKey,
		mayhemMode: false,
	});
	await send(connection, Array.isArray(createIx) ? createIx : [createIx], [wallet, mintKp], 'Create');
}

// base_token_program from the mint owner (create_v2 => Token-2022).
const mintInfo = await connection.getAccountInfo(mintPk);
if (!mintInfo) {
	console.error(`mint ${mintPk.toBase58()} not found on devnet`);
	process.exit(1);
}
const baseTokenProgram = resolveTokenProgramForMintOwner(mintInfo.owner);
console.log(`Base token program: ${baseTokenProgram.toBase58()}`);

// 2) BUY on the bonding curve ─────────────────────────────────────────────────
console.log(`\nBuying ${BUY_SOL} SOL of ${mintPk.toBase58()} ...`);
const buyState = await sdk.fetchBuyState(mintPk, wallet.publicKey, baseTokenProgram);
if (!buyState?.bondingCurve || buyState.bondingCurve.complete) {
	console.error('No active bonding curve for this mint (graduated or missing).');
	process.exit(1);
}

const quoteMintPk = buyState.bondingCurve.quoteMint ?? new PublicKey('So11111111111111111111111111111111111111112');
const isUsdcQuote = !isLegacyQuoteMint(quoteMintPk);
if (isUsdcQuote) {
	console.error('This smoke script trades SOL-paired curves only; mint is USDC-paired.');
	process.exit(1);
}

const [global, feeConfig] = await Promise.all([
	sdk.fetchGlobal(),
	sdk.fetchFeeConfig().catch(() => null),
]);
const quoteAtomics = new BN(Math.floor(BUY_SOL * LAMPORTS_PER_SOL));

// The GAP-1 fix: derive a real base-token amount (> 0) from the SOL input.
const tokenAmount = getBuyTokenAmountFromSolAmount({
	global,
	feeConfig,
	mintSupply: buyState.bondingCurve.tokenTotalSupply,
	bondingCurve: buyState.bondingCurve,
	amount: quoteAtomics,
	quoteMint: quoteMintPk,
});
console.log(`  expected tokens out: ${tokenAmount.toString()} (must be > 0 — the fix)`);
if (!tokenAmount.gt(new BN(0))) {
	console.error('amount_too_small: quote amount buys zero tokens. Increase --sol.');
	process.exit(1);
}

const buyIxs = await sdk.buyV2Instructions({
	global,
	bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
	bondingCurve: buyState.bondingCurve,
	associatedUserAccountInfo: buyState.associatedUserAccountInfo,
	mint: mintPk,
	user: wallet.publicKey,
	amount: tokenAmount,
	quoteAmount: quoteAtomics,
	slippage: slippagePct,
	tokenProgram: baseTokenProgram,
	quoteTokenProgram: spl.TOKEN_PROGRAM_ID,
});
const buyTxSig = await send(connection, buyIxs, [wallet], 'Buy');

// 3) SELL the full received balance back ──────────────────────────────────────
await new Promise((r) => setTimeout(r, 2000));
const userAta = spl.getAssociatedTokenAddressSync(mintPk, wallet.publicKey, true, baseTokenProgram);
const ataBalance = await connection.getTokenAccountBalance(userAta);
const tokensHeld = new BN(ataBalance.value.amount);
console.log(`\nToken balance after buy: ${tokensHeld.toString()}`);
if (!tokensHeld.gt(new BN(0))) {
	console.error('Buy produced zero tokens — the GAP-1 bug would do exactly this. FAIL.');
	process.exit(1);
}

const sellState = await sdk.fetchSellState(mintPk, wallet.publicKey, baseTokenProgram);
const expectedQuoteOut = getSellSolAmountFromTokenAmount({
	global,
	feeConfig,
	mintSupply: sellState.bondingCurve.tokenTotalSupply,
	bondingCurve: sellState.bondingCurve,
	amount: tokensHeld,
});
console.log(`  expected SOL out: ${Number(expectedQuoteOut.toString()) / LAMPORTS_PER_SOL}`);

const sellIxs = await sdk.sellV2Instructions({
	global,
	bondingCurveAccountInfo: sellState.bondingCurveAccountInfo,
	bondingCurve: sellState.bondingCurve,
	mint: mintPk,
	user: wallet.publicKey,
	amount: tokensHeld,
	quoteAmount: expectedQuoteOut,
	slippage: slippagePct,
	tokenProgram: baseTokenProgram,
	quoteTokenProgram: spl.TOKEN_PROGRAM_ID,
});
const sellTxSig = await send(connection, sellIxs, [wallet], 'Sell');

// ── summary ──────────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────────');
console.log(`Mint:    ${mintPk.toBase58()}`);
console.log(`Buy tx:  ${buyTxSig}`);
console.log(`Sell tx: ${sellTxSig}`);
console.log('✓ Smoke trade complete — both buy and sell confirmed on devnet.');
