// x402-checkout — buyer-side helper for the drop-in modal.
//
// The buyer's wallet (Phantom for Solana, MetaMask for EVM) needs to sign the
// payment payload that goes into the `X-PAYMENT` header. For EVM that's an
// EIP-712 typed-data signature the wallet builds locally. For Solana the
// wallet only signs serialized transactions — it does NOT build instructions.
// So we expose this endpoint: client posts { accept, buyer }, server returns
// a partially-signed v0 transaction ready for Phantom to add the payer's sig.
//
// Endpoints:
//   POST /api/x402-checkout?action=prepare   { accept, buyer }
//      → { network, tx_base64 }              v0 SPL transferChecked, fee payer
//                                            is accept.extra.feePayer (the
//                                            facilitator's sponsor account)
//   POST /api/x402-checkout?action=encode    { signed_tx_base64, accept, resource_url }
//      → { x_payment }                       base64 paymentPayload ready for
//                                            X-PAYMENT header
//
// We split prepare + encode so the modal can show "Sign in your wallet…" while
// Phantom is open, then "Sending…" while we wrap the signed tx into the
// x402 envelope. Keeps each step short and visible.

import { z } from 'zod';
import { solanaConnection } from './_lib/solana/connection.js';
import {
	PublicKey,
	TransactionMessage,
	VersionedTransaction,
	ComputeBudgetProgram,
} from '@solana/web3.js';
import {
	TOKEN_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID,
	getAssociatedTokenAddressSync,
	createAssociatedTokenAccountIdempotentInstruction,
	createTransferCheckedInstruction,
	getMint,
} from '@solana/spl-token';
import { cors, json, method, readJson, wrap, error, rateLimited } from './_lib/http.js';
import { parse } from './_lib/validate.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { NETWORK_SOLANA_MAINNET, NETWORK_SOLANA_DEVNET } from './_lib/x402-spec.js';
import { env } from './_lib/env.js';

// Routed through env.* so the `api-mainnet.helius-rpc.com` misconfig is repaired
// (env.normalizeRpcUrl) — a bad host 404'd getAccountInfo on the USDC mint here.
const SOLANA_RPC = env.SOLANA_RPC_URL;
const SOLANA_DEVNET_RPC = env.SOLANA_RPC_URL_DEVNET;

// Short-lived caches so repeated prepare calls don't re-issue identical RPC
// round-trips. Mint decimals are effectively immutable; a blockhash is valid for
// ~60-90s on Solana, so a few seconds of reuse cuts redundant traffic without
// handing out a stale-enough blockhash for the buyer's signed tx to fail.
const MINT_DECIMALS_TTL_MS = 5 * 60 * 1000;
const BLOCKHASH_TTL_MS = 8 * 1000;
const mintDecimalsCache = new Map(); // `${rpc}:${mint}` -> { decimals, at }
const blockhashCache = new Map(); // rpc -> { blockhash, at }

// Decimals for canonical mints are immutable and universally known. Resolving
// them locally skips an RPC round-trip on the hot checkout path (USDC is the
// default settlement asset) and immunizes prepare against a flaky/rate-limited
// RPC returning 404 for getAccountInfo on the mint — the failure mode that
// 500'd every USDC checkout when the public endpoint was cooling.
const WELL_KNOWN_MINT_DECIMALS = new Map([
	['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6], // USDC (mainnet)
	['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 6], // USDT (mainnet)
	['So11111111111111111111111111111111111111112', 9], // wrapped SOL
]);

async function getMintDecimals(conn, rpc, mint) {
	const mintStr = mint.toBase58();
	const known = WELL_KNOWN_MINT_DECIMALS.get(mintStr);
	if (known != null) return known;

	const key = `${rpc}:${mintStr}`;
	const hit = mintDecimalsCache.get(key);
	if (hit && Date.now() - hit.at < MINT_DECIMALS_TTL_MS) return hit.decimals;
	const info = await getMint(conn, mint);
	mintDecimalsCache.set(key, { decimals: info.decimals, at: Date.now() });
	return info.decimals;
}

async function getRecentBlockhash(conn, rpc) {
	const hit = blockhashCache.get(rpc);
	if (hit && Date.now() - hit.at < BLOCKHASH_TTL_MS) return hit.blockhash;
	const { blockhash } = await conn.getLatestBlockhash('confirmed');
	blockhashCache.set(rpc, { blockhash, at: Date.now() });
	return blockhash;
}

const acceptSchema = z.object({
	scheme: z.literal('exact'),
	network: z.string().min(1).max(80),
	amount: z.string().regex(/^\d+$/),
	asset: z.string().min(32).max(44),
	payTo: z.string().min(32).max(44),
	maxTimeoutSeconds: z.number().int().positive().optional(),
	extra: z
		.object({
			name: z.string().optional(),
			decimals: z.number().int().nonnegative().optional(),
			feePayer: z.string().min(32).max(44),
		})
		.passthrough(),
});

// Optional buyer-approved donations appended to the same signed transaction as
// the payment (charity split + round-up giving). The buyer always sees and
// signs these in the modal — the merchant only configures the destination/rule.
// Routes the same mint as the payment, so each tip is an extra transferChecked
// to the cause's ATA. Capped to keep a misconfigured giving rule from ever
// sweeping a buyer: ≤ 100 tokens and ≤ 50× the payment per recipient.
const TIP_ABS_MAX = 100_000_000n; // 100 USDC in 6-decimal atomics
const tipSchema = z.object({
	to: z.string().min(32).max(44),
	amount: z.string().regex(/^\d+$/),
});

const prepareSchema = z.object({
	accept: acceptSchema,
	buyer: z.string().min(32).max(44),
	tips: z.array(tipSchema).max(2).optional(),
});

const builderCodeBlockSchema = z
	.object({
		a: z.string().regex(/^[a-z0-9_]{1,32}$/),
		w: z
			.string()
			.regex(/^[a-z0-9_]{1,32}$/)
			.optional(),
		s: z
			.array(z.string().regex(/^[a-z0-9_]{1,32}$/))
			.max(32)
			.optional(),
	})
	.optional();

const encodeSchema = z.object({
	accept: acceptSchema,
	signed_tx_base64: z.string().min(40).max(20_000),
	resource_url: z.string().url(),
	builder_code: builderCodeBlockSchema,
});

export default wrap(async (req, res) => {
	// Public, cross-origin endpoint — the drop-in script runs on any merchant
	// site and POSTs here. No credentials, allow any origin.
	if (cors(req, res, { origins: '*', methods: 'POST,OPTIONS' })) return;
	if (!method(req, res, ['POST'])) return;

	const action = req.query?.action;
	if (action === 'prepare') return handlePrepare(req, res);
	if (action === 'encode') return handleEncode(req, res);
	return error(res, 404, 'not_found', `unknown action: ${action ?? '(none)'}`);
});

function isSolanaNetwork(network) {
	return (
		network === NETWORK_SOLANA_MAINNET ||
		network === NETWORK_SOLANA_DEVNET ||
		network === 'solana'
	);
}

function rpcFor(network) {
	if (network === NETWORK_SOLANA_DEVNET) return SOLANA_DEVNET_RPC;
	return SOLANA_RPC;
}

async function handlePrepare(req, res) {
	// Per-IP rate limit: prepare fans out to multiple Solana RPC round-trips, so
	// throttle anonymous callers to stop quota-drain / cost amplification against
	// the (potentially paid) upstream RPC.
	const rl = await limits.x402PayIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl, 'too many prepare requests');

	const body = parse(prepareSchema, await readJson(req));
	const { accept, buyer, tips } = body;
	if (!isSolanaNetwork(accept.network)) {
		return error(
			res,
			400,
			'unsupported_network',
			`prepare only builds Solana transactions; got network=${accept.network}. EVM clients sign EIP-712 typed data locally and don't need this endpoint.`,
		);
	}

	const rpc = rpcFor(accept.network);
	const conn = solanaConnection({ url: rpc, commitment: 'confirmed' });
	const mint = new PublicKey(accept.asset);
	const payTo = new PublicKey(accept.payTo);
	const feePayer = new PublicKey(accept.extra.feePayer);
	const buyerPubkey = new PublicKey(buyer);
	const amount = BigInt(accept.amount);

	const senderAta = getAssociatedTokenAddressSync(
		mint,
		buyerPubkey,
		false,
		TOKEN_PROGRAM_ID,
		ASSOCIATED_TOKEN_PROGRAM_ID,
	);
	const receiverAta = getAssociatedTokenAddressSync(
		mint,
		payTo,
		false,
		TOKEN_PROGRAM_ID,
		ASSOCIATED_TOKEN_PROGRAM_ID,
	);
	const mintDecimals = await getMintDecimals(conn, rpc, mint);

	// Base payment needs ~60k CU; each donation adds a transfer (+ possibly an ATA
	// create), so budget headroom per tip. Unused CU isn't charged — this only
	// raises the ceiling so a tip can't blow the limit and fail the whole tx.
	const tipCount = Array.isArray(tips) ? tips.length : 0;
	const ixs = [
		ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 + tipCount * 40_000 }),
		ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
	];
	const receiverInfo = await conn.getAccountInfo(receiverAta);
	if (!receiverInfo) {
		ixs.push(
			createAssociatedTokenAccountIdempotentInstruction(
				feePayer,
				receiverAta,
				payTo,
				mint,
				TOKEN_PROGRAM_ID,
				ASSOCIATED_TOKEN_PROGRAM_ID,
			),
		);
	}
	ixs.push(
		createTransferCheckedInstruction(
			senderAta,
			mint,
			receiverAta,
			buyerPubkey,
			amount,
			mintDecimals,
			[],
			TOKEN_PROGRAM_ID,
		),
	);

	// Buyer-approved donations (charity + round-up). Each becomes an extra
	// transferChecked of the same mint to the cause's ATA, signed by the buyer in
	// the same transaction. Validate the destination, bound the amount, and dedupe
	// against the merchant's own payout so a tip can never silently inflate it.
	if (Array.isArray(tips) && tips.length) {
		for (const tip of tips) {
			let tipTo;
			try {
				tipTo = new PublicKey(tip.to);
			} catch {
				return error(res, 400, 'invalid_tip', `donation recipient is not a valid address: ${tip.to}`);
			}
			let tipAmount;
			try {
				tipAmount = BigInt(tip.amount);
			} catch {
				return error(res, 400, 'invalid_tip', 'donation amount must be a whole token amount');
			}
			if (tipAmount <= 0n) continue; // nothing to send
			if (tipAmount > TIP_ABS_MAX || tipAmount > amount * 50n) {
				return error(
					res,
					400,
					'tip_too_large',
					'donation exceeds the safety cap (≤ 100 tokens and ≤ 50× the payment) — check the giving configuration',
				);
			}
			if (tipTo.equals(payTo)) {
				return error(res, 400, 'invalid_tip', 'donation recipient cannot be the payment recipient');
			}
			const tipAta = getAssociatedTokenAddressSync(mint, tipTo, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
			const tipAtaInfo = await conn.getAccountInfo(tipAta);
			if (!tipAtaInfo) {
				ixs.push(
					createAssociatedTokenAccountIdempotentInstruction(feePayer, tipAta, tipTo, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
				);
			}
			ixs.push(
				createTransferCheckedInstruction(senderAta, mint, tipAta, buyerPubkey, tipAmount, mintDecimals, [], TOKEN_PROGRAM_ID),
			);
		}
	}

	const blockhash = await getRecentBlockhash(conn, rpc);
	const message = new TransactionMessage({
		payerKey: feePayer,
		recentBlockhash: blockhash,
		instructions: ixs,
	}).compileToV0Message();
	const vtx = new VersionedTransaction(message);

	const txBase64 = Buffer.from(vtx.serialize()).toString('base64');
	return json(res, 200, {
		network: accept.network,
		tx_base64: txBase64,
		recent_blockhash: blockhash,
	});
}

async function handleEncode(req, res) {
	// Per-IP rate limit — same anonymous, cross-origin surface as prepare.
	const rl = await limits.x402PayIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl, 'too many encode requests');

	const body = parse(encodeSchema, await readJson(req));
	const { accept, signed_tx_base64, resource_url, builder_code } = body;
	const payload = {
		x402Version: 2,
		scheme: 'exact',
		network: accept.network,
		resource: { url: resource_url, mimeType: 'application/json' },
		accepted: accept,
		payload: { transaction: signed_tx_base64 },
	};
	if (builder_code) {
		payload.extensions = { 'builder-code': builder_code };
	}
	const xPayment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
	return json(res, 200, { x_payment: xPayment });
}
