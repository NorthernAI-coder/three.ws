// api/_lib/x402/autonomous-pay.js
//
// Reusable Solana x402 payment primitive for the autonomous spend pipelines.
//
// The autonomous loop (api/cron/x402-autonomous-loop.js) inlines this same flow
// for its declarative registry entries. Batch pipelines that expose a custom
// run(ctx) — which make many paid calls per tick and write to their own tables —
// use this module so they don't duplicate the 100 lines of tx-building logic.
//
// Real on-chain payments only. Every call:
//   1. probes the resource for a 402 challenge (priced) or 200 (free),
//   2. selects the Solana accepts entry and validates asset + feePayer,
//   3. builds and signs a USDC TransferChecked against the seed keypair,
//   4. fires the request with the X-PAYMENT header,
//   5. parses the settlement signature from X-PAYMENT-RESPONSE.

import { readFileSync } from 'node:fs';
import bs58 from 'bs58';
import {
	PublicKey, Keypair, TransactionMessage, VersionedTransaction,
	ComputeBudgetProgram,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync, createTransferCheckedInstruction,
	createAssociatedTokenAccountIdempotentInstruction,
	TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getMint,
} from '@solana/spl-token';

import { env } from '../env.js';
import { solanaConnection } from '../solana/connection.js';
import { sql } from '../db.js';

const FETCH_TIMEOUT_MS = 20_000;
const FALLBACK_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/**
 * Load the autonomous seed keypair. Prefers the seeder secret, falls back to the
 * agent secret, and (outside production only) a local test-wallet file. Throws
 * when none is configured so callers can record a graceful skip.
 * @returns {Keypair}
 */
export function loadSeedKeypair() {
	const b58 = process.env.X402_SEED_SOLANA_SECRET_BASE58
		|| process.env.X402_AGENT_SOLANA_SECRET_BASE58;
	if (b58) {
		const raw = bs58.decode(b58);
		if (raw.length !== 64) throw new Error(`seed keypair: expected 64 bytes, got ${raw.length}`);
		return Keypair.fromSecretKey(raw);
	}
	if (process.env.NODE_ENV !== 'production') {
		try {
			const arr = JSON.parse(readFileSync('/home/codespace/.config/x402-test-wallets/solana.json', 'utf8'));
			return Keypair.fromSecretKey(Uint8Array.from(arr));
		} catch { /* fall through */ }
	}
	throw new Error('seed keypair not configured (set X402_SEED_SOLANA_SECRET_BASE58)');
}

/**
 * Build the shared per-tick Solana state a pipeline needs to pay: the signing
 * keypair, an RPC connection, a recent blockhash, and the USDC mint info. The
 * autonomous loop already builds these once per tick and passes them in; a
 * standalone caller (or a direct test) builds them here.
 * @param {{ usdcMint?: string, rpcUrl?: string }} [opts]
 */
export async function prepareSolanaContext({ usdcMint, rpcUrl } = {}) {
	const mint = usdcMint || env.X402_ASSET_MINT_SOLANA || FALLBACK_USDC_MINT;
	const buyer = loadSeedKeypair();
	const conn = solanaConnection({ url: rpcUrl || env.SOLANA_RPC_URL, commitment: 'confirmed' });
	const [{ blockhash }, mintInfo] = await Promise.all([
		conn.getLatestBlockhash('confirmed'),
		getMint(conn, new PublicKey(mint)),
	]);
	return { buyer, conn, blockhash, mintInfo, usdcMint: mint };
}

async function fetchWithTimeout(url, opts = {}) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'manual' });
		let body = null;
		try { body = await res.json(); } catch { try { body = await res.text(); } catch { body = null; } }
		return { ok: res.ok, status: res.status, headers: res.headers, body };
	} finally {
		clearTimeout(t);
	}
}

function parseSolanaAccept(challenge) {
	if (!challenge || !Array.isArray(challenge.accepts)) return null;
	return challenge.accepts.find(
		(a) => typeof a?.network === 'string' && a.network.startsWith('solana'),
	) || null;
}

function buildPaymentTx({ accept, buyer, blockhash, mintInfo, receiverAtaExists, nonce = 0 }) {
	const mint = new PublicKey(accept.asset);
	const payTo = new PublicKey(accept.payTo);
	const feePayer = new PublicKey(accept.extra.feePayer);
	const amount = BigInt(accept.amount);

	const senderAta = getAssociatedTokenAddressSync(
		mint, buyer.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
	);
	const receiverAta = getAssociatedTokenAddressSync(
		mint, payTo, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
	);

	// `nonce` perturbs the priority fee so a batch pipeline that fires many
	// identical-amount payments (same payer/payTo/mint) against one blockhash
	// produces a DISTINCT signature per call. Without it two equal transfers
	// compile to the same message → same signature → the second is rejected as
	// already-processed (and the platform's X-PAYMENT replay guard blocks it).
	// Single-call callers leave nonce at 0 and pay the baseline 5 µlamports.
	const ixs = [
		ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }),
		ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5 + (Number(nonce) % 997) }),
	];
	if (!receiverAtaExists) {
		ixs.push(createAssociatedTokenAccountIdempotentInstruction(
			feePayer, receiverAta, payTo, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
		));
	}
	ixs.push(createTransferCheckedInstruction(
		senderAta, mint, receiverAta, buyer.publicKey,
		amount, mintInfo.decimals, [], TOKEN_PROGRAM_ID,
	));

	const msg = new TransactionMessage({
		payerKey: feePayer,
		recentBlockhash: blockhash,
		instructions: ixs,
	}).compileToV0Message();
	const vtx = new VersionedTransaction(msg);
	vtx.sign([buyer]);
	return Buffer.from(vtx.serialize()).toString('base64');
}

/**
 * Pay for and call an x402 resource. Returns a structured result whether the
 * resource was free (200 on probe), paid (402 → signed payment → 200), or
 * errored. Never throws on an HTTP/payment failure — callers inspect `.ok`.
 *
 * @param {object} args
 * @param {Keypair} args.buyer
 * @param {import('@solana/web3.js').Connection} args.conn
 * @param {string} args.blockhash
 * @param {object} args.mintInfo  result of getMint() (for decimals)
 * @param {string} args.usdcMint  expected accepts.asset
 * @param {string} args.url
 * @param {string} [args.method='POST']
 * @param {*} [args.body]         JSON body (object) — stringified internally
 * @param {object} [args.headers] extra request headers
 * @returns {Promise<{ ok:boolean, status:number, body:*, amountAtomic:number, txSig:string|null, free:boolean, error:string|null }>}
 */
export async function payX402({ buyer, conn, blockhash, mintInfo, usdcMint, url, method = 'POST', body, headers = {}, nonce = 0 }) {
	const baseHeaders = {
		'content-type': 'application/json',
		'accept': 'application/json',
		'user-agent': 'threews-x402-autonomous/1.0',
		...headers,
	};
	const bodyInit = body != null ? { body: JSON.stringify(body) } : {};

	// Step 1 — probe for a 402 challenge.
	const probe = await fetchWithTimeout(url, { method, headers: baseHeaders, ...bodyInit });
	if (probe.status !== 402) {
		// Free resource (or a non-payment error surfaced verbatim to the caller).
		return { ok: probe.ok, status: probe.status, body: probe.body, amountAtomic: 0, txSig: null, free: true, error: probe.ok ? null : `http_${probe.status}` };
	}

	const accept = parseSolanaAccept(probe.body);
	if (!accept) return { ok: false, status: 402, body: probe.body, amountAtomic: 0, txSig: null, free: false, error: 'no_solana_accept' };
	if (!usdcMint || accept.asset !== usdcMint) return { ok: false, status: 402, body: probe.body, amountAtomic: 0, txSig: null, free: false, error: `unexpected_asset:${accept.asset}` };
	if (!accept.extra?.feePayer) return { ok: false, status: 402, body: probe.body, amountAtomic: 0, txSig: null, free: false, error: 'missing_fee_payer' };

	const amountAtomic = Number(accept.amount || 0);

	// Step 2 — does the receiver ATA already exist? (skip the idempotent create ix)
	const receiverAta = getAssociatedTokenAddressSync(
		new PublicKey(accept.asset), new PublicKey(accept.payTo),
		false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
	);
	const receiverAtaInfo = await conn.getAccountInfo(receiverAta).catch(() => null);

	// Step 3 — build + sign the payment tx.
	const txBase64 = buildPaymentTx({
		accept, buyer, blockhash, mintInfo, receiverAtaExists: receiverAtaInfo !== null, nonce,
	});

	const xPayment = Buffer.from(JSON.stringify({
		x402Version: 2,
		scheme: 'exact',
		network: accept.network,
		resource: { url, mimeType: 'application/json' },
		payload: { transaction: txBase64 },
		accepted: accept,
	})).toString('base64');

	// Step 4 — fire with payment.
	const paid = await fetchWithTimeout(url, {
		method,
		headers: { ...baseHeaders, 'x-payment': xPayment },
		...bodyInit,
	});

	let txSig = null;
	if (paid.ok) {
		const responseHeader = paid.headers?.get?.('x-payment-response');
		if (responseHeader) {
			try {
				const settled = JSON.parse(Buffer.from(responseHeader, 'base64').toString('utf8'));
				txSig = settled?.transaction || null;
			} catch { /* non-fatal — payment succeeded, signature just not echoed */ }
		}
	}

	return {
		ok: paid.ok,
		status: paid.status,
		body: paid.body,
		amountAtomic,
		txSig,
		free: false,
		error: paid.ok ? null : `http_${paid.status}`,
	};
}

/**
 * Ensure the x402_autonomous_log table exists. The autonomous loop also creates
 * it; this lets a pipeline's run() be exercised directly (manual test) before
 * the loop has ever run. DDL is kept identical to the loop's definition.
 */
export async function ensureAutonomousLogTable() {
	try {
		await sql`
			CREATE TABLE IF NOT EXISTS x402_autonomous_log (
				id              bigserial PRIMARY KEY,
				run_id          uuid NOT NULL,
				ts              timestamptz DEFAULT now(),
				endpoint_type   text NOT NULL CHECK (endpoint_type IN ('self', 'external')),
				service_name    text NOT NULL,
				endpoint_url    text NOT NULL,
				network         text NOT NULL DEFAULT 'solana:mainnet',
				amount_atomic   bigint NOT NULL DEFAULT 0,
				asset           text,
				tx_signature    text,
				response_data   jsonb,
				signal_data     jsonb,
				duration_ms     int,
				success         boolean NOT NULL,
				error_msg       text,
				pipeline        text
			)
		`;
	} catch { /* already exists or handled by the migration system */ }
}

/**
 * Insert one row into x402_autonomous_log. Shared by every batch run() pipeline
 * so success AND failure are recorded identically to the cron loop's inline
 * path. Never throws — a logging failure must never crash the spend loop.
 *
 * The conceptual "value_extracted" payload is stored in the table's existing
 * `signal_data` jsonb column (the canonical extracted-value field across the
 * autonomous loop); pass it as `valueExtracted`.
 * @returns {Promise<void>}
 */
export async function recordAutonomousLog({
	runId, serviceName, endpointUrl, endpointType = 'self', pipeline = 'self',
	network = 'solana:mainnet', amountAtomic = 0, asset = null, txSig = null,
	responseData = null, durationMs = 0, success = false, errorMsg = null,
	valueExtracted = null,
}) {
	try {
		await sql`
			INSERT INTO x402_autonomous_log
				(run_id, endpoint_type, service_name, endpoint_url,
				 network, amount_atomic, asset, tx_signature,
				 response_data, signal_data, duration_ms, success, error_msg, pipeline)
			VALUES
				(${runId}, ${endpointType}, ${serviceName}, ${endpointUrl},
				 ${network}, ${amountAtomic || 0},
				 ${asset || env.X402_ASSET_MINT_SOLANA || FALLBACK_USDC_MINT},
				 ${txSig || null},
				 ${responseData ? JSON.stringify(responseData) : null},
				 ${valueExtracted ? JSON.stringify(valueExtracted) : null},
				 ${durationMs || 0}, ${success}, ${errorMsg || null}, ${pipeline})
		`;
	} catch { /* audit insert is best-effort — the loop must keep spending */ }
}
