// api/_lib/x402/pay.js
//
// Shared Solana x402 payment client for the autonomous spend loop and every
// run()-style registry entry. The autonomous loop (api/cron/x402-autonomous-loop.js)
// pays declarative registry entries inline; richer entries that monitor a queue,
// poll a worker, or fan a call across rows declare a run(ctx) function and use
// payX402() here to settle their own USDC payments with the same primitives.
//
// Real on-chain payments only. No mocks. If the seed keypair is not configured,
// loadSeedKeypair() throws and callers degrade gracefully.

import { readFileSync } from 'node:fs';
import bs58 from 'bs58';
import {
	Connection, PublicKey, Keypair, TransactionMessage, VersionedTransaction,
	ComputeBudgetProgram,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync, createTransferCheckedInstruction,
	createAssociatedTokenAccountIdempotentInstruction,
	TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getMint,
} from '@solana/spl-token';

import { env } from '../env.js';
import { solanaConnection } from '../solana/connection.js';

export const USDC_MINT = env.X402_ASSET_MINT_SOLANA;
export const SOLANA_RPC = env.SOLANA_RPC_URL;
export const FETCH_TIMEOUT_MS = 20_000;

// ── Fee floor ─────────────────────────────────────────────────────────────────
// The ring's operating rule is "lowest fees always": 1-signature self-pay
// settlement (5,000 lamports base) with the priority fee pinned at the floor.
// These constants are the single source of truth for the ring's priority-fee
// config — buildPaymentTx uses them, and the ceiling guard below reasons about
// the same numbers, so the builder and the guard can never drift apart.

export const SIGNATURE_FEE_LAMPORTS = 5000;
export const RING_CU_LIMIT = 60_000;

// Priority fee for a ring payment at batch position `nonce`. Baseline 5
// µlamports; the nonce perturbation (see buildPaymentTx) tops out at 1001
// µlamports ≈ 60 lamports over 60k CU — negligible against the 5,000 base.
export function ringPriorityMicrolamports(nonce = 0) {
	return 5 + (Number(nonce) % 997);
}

// Self-pay is the OPERATIVE DEFAULT for ring-internal payments: the buyer pays
// its own fee → 1 signature = 5,000 lamports, half the 2-signature sponsored
// base, and the facilitator broadcasts without co-signing. An explicit
// X402_RING_SELF_PAY=false is still honored (sponsor mode stays available for
// gasless buyers); anything else — unset included — means self-pay.
export function ringSelfPayDefault() {
	return String(process.env.X402_RING_SELF_PAY ?? '').trim().toLowerCase() !== 'false';
}

// Hard per-transaction fee ceiling for ring payments (lamports). The default
// 10,000 admits the worst legitimate case (2-signature sponsor mode at the
// baseline priority fee) and nothing more; the self-pay path runs at ~5,000.
export function ringMaxFeePerTxLamports() {
	return Number(process.env.X402_RING_MAX_FEE_PER_TX_LAMPORTS || 10_000);
}

// Worst-case lamports a payment with this fee config can cost on-chain. Pure —
// the fee-floor regression tests assert the ring's builders stay under the
// ceiling for every possible nonce, and payX402 applies the same math at
// runtime. Priority lamports use integer floor division, mirroring the
// facilitator's guard math (self-facilitator.js) and the runtime's sub-lamport
// truncation.
export function expectedFeeLamports({ selfPay, priorityMicrolamports = 0, cuLimit = RING_CU_LIMIT }) {
	const signatures = selfPay ? 1 : 2;
	const priorityLamports = Math.floor(
		(Number(priorityMicrolamports) * Number(cuLimit)) / 1_000_000,
	);
	return SIGNATURE_FEE_LAMPORTS * signatures + priorityLamports;
}

// Load the autonomous payer keypair. Seed wallet preferred; agent wallet is the
// documented fallback. In non-prod a local test wallet file is honored so the
// loop and manual tests can run without env wiring.
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
	throw new Error('x402 pay: seed keypair not configured (set X402_SEED_SOLANA_SECRET_BASE58)');
}

export async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'manual' });
		let body = null;
		try { body = await res.json(); } catch { try { body = await res.text(); } catch { body = null; } }
		return { ok: res.ok, status: res.status, headers: res.headers, body };
	} finally {
		clearTimeout(t);
	}
}

export function parseSolanaAccept(challenge) {
	if (!challenge || !Array.isArray(challenge.accepts)) return null;
	return challenge.accepts.find(
		(a) => typeof a?.network === 'string' && a.network.startsWith('solana'),
	) || null;
}

export function buildPaymentTx({ accept, buyer, blockhash, mintInfo, receiverAtaExists, nonce = 0, selfPay = false }) {
	const mint = new PublicKey(accept.asset);
	const payTo = new PublicKey(accept.payTo);
	// Self-pay: the buyer IS the fee payer → the transaction needs only ONE
	// signature (5000 lamports base) instead of two (buyer + sponsor = 10000), and
	// the facilitator broadcasts it without co-signing. Sponsor mode keeps the
	// advertised fee payer so a buyer without SOL can still be sponsored.
	const feePayer = selfPay ? buyer.publicKey : new PublicKey(accept.extra.feePayer);
	const amount = BigInt(accept.amount);

	const senderAta = getAssociatedTokenAddressSync(
		mint, buyer.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
	);
	const receiverAta = getAssociatedTokenAddressSync(
		mint, payTo, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
	);

	// `nonce` perturbs the priority fee so a batch pipeline firing several
	// identical-amount payments (same payer/payTo/mint) against the one shared
	// blockhash produces a DISTINCT signature per call. Two byte-identical
	// transfers compile to the same message → same signature → the second is
	// rejected as already-processed. Single-call/inline callers leave nonce at 0
	// and pay the unchanged baseline of 5 µlamports.
	const ixs = [
		ComputeBudgetProgram.setComputeUnitLimit({ units: RING_CU_LIMIT }),
		ComputeBudgetProgram.setComputeUnitPrice({ microLamports: ringPriorityMicrolamports(nonce) }),
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

// Build the per-tick shared Solana state once (blockhash + USDC mint info) so a
// run() that pays several rows reuses one blockhash. Standalone callers (manual
// tests) call this to bootstrap a full context without the cron loop.
export async function bootstrapSolanaContext({ buyer } = {}) {
	if (!USDC_MINT) throw new Error('x402 pay: X402_ASSET_MINT_SOLANA not configured');
	const payer = buyer || loadSeedKeypair();
	const conn = solanaConnection({ url: SOLANA_RPC, commitment: 'confirmed' });
	const [{ blockhash }, mintInfo] = await Promise.all([
		conn.getLatestBlockhash('confirmed'),
		getMint(conn, new PublicKey(USDC_MINT)),
	]);
	return { buyer: payer, conn, blockhash, mintInfo };
}

// Settle a single x402 payment against `url`. Probes for the 402 challenge,
// builds + signs the Solana USDC transfer, and replays with the X-PAYMENT header.
//
// Returns a structured outcome — never throws for protocol/network faults:
//   { success, paid, free, skipped, amountAtomic, txSig, status, responseBody, errorMsg }
//
//   paid    — a USDC payment settled on-chain (success true)
//   free    — endpoint answered 200 with no 402 (no payment needed)
//   skipped — a guard rejected the call before paying (cap, asset mismatch, …)
export async function payX402({
	url, method = 'POST', body = null,
	buyer, conn, blockhash, mintInfo,
	remainingCap = Infinity,
	userAgent = 'threews-x402-autonomous/1.0',
	nonce = 0,
	// Self-pay: buyer is its own fee payer → 1 signature (5000 lamports) instead
	// of 2. Half the base fee, no sponsor co-sign. The ring's operative default;
	// only an explicit X402_RING_SELF_PAY=false selects sponsor mode. See
	// ringSelfPayDefault() and buildPaymentTx.
	selfPay = ringSelfPayDefault(),
}) {
	const reqInit = {
		method,
		headers: { 'content-type': 'application/json', 'user-agent': userAgent },
		...(body != null ? { body: JSON.stringify(body) } : {}),
	};

	// Step 1 — probe for the 402 challenge.
	const probe = await fetchWithTimeout(url, reqInit);

	if (probe.status !== 402) {
		return {
			success: probe.ok, paid: false, free: true, skipped: false,
			amountAtomic: 0, txSig: null, status: probe.status,
			responseBody: probe.body,
			errorMsg: probe.ok ? null : `http_${probe.status}`,
		};
	}

	const accept = parseSolanaAccept(probe.body);
	if (!accept) {
		return { success: false, paid: false, free: false, skipped: true, amountAtomic: 0, txSig: null, status: 402, responseBody: probe.body, errorMsg: 'no_solana_accept' };
	}
	if (!USDC_MINT || accept.asset !== USDC_MINT) {
		return { success: false, paid: false, free: false, skipped: true, amountAtomic: 0, txSig: null, status: 402, responseBody: probe.body, errorMsg: `unexpected_asset:${accept.asset}` };
	}
	if (!selfPay && !accept.extra?.feePayer) {
		return { success: false, paid: false, free: false, skipped: true, amountAtomic: 0, txSig: null, status: 402, responseBody: probe.body, errorMsg: 'missing_fee_payer' };
	}

	const amountAtomic = Number(accept.amount || 0);
	if (amountAtomic > remainingCap) {
		return { success: false, paid: false, free: false, skipped: true, amountAtomic, txSig: null, status: 402, responseBody: probe.body, errorMsg: 'cap_would_exceed' };
	}

	// Fee ceiling — refuse to send a payment whose fee config could exceed
	// X402_RING_MAX_FEE_PER_TX_LAMPORTS. A structured skip, not a throw: the
	// caller records it like any other guard rejection. This is the runtime
	// twin of the fee-floor regression tests over expectedFeeLamports().
	const worstCaseFeeLamports = expectedFeeLamports({
		selfPay,
		priorityMicrolamports: ringPriorityMicrolamports(nonce),
		cuLimit: RING_CU_LIMIT,
	});
	const maxFeeLamports = ringMaxFeePerTxLamports();
	if (worstCaseFeeLamports > maxFeeLamports) {
		return {
			success: false, paid: false, free: false, skipped: true,
			amountAtomic, txSig: null, status: 402, responseBody: probe.body,
			errorMsg: `fee_ceiling_exceeded:${worstCaseFeeLamports}>${maxFeeLamports}`,
		};
	}

	// Step 2 — does the receiver ATA already exist? (saves an idempotent create ix)
	const receiverAta = getAssociatedTokenAddressSync(
		new PublicKey(accept.asset), new PublicKey(accept.payTo),
		false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
	);
	const receiverAtaInfo = await conn.getAccountInfo(receiverAta).catch(() => null);

	// Step 3 — build the signed transaction + X-PAYMENT envelope.
	const txBase64 = buildPaymentTx({
		accept, buyer, blockhash, mintInfo,
		receiverAtaExists: receiverAtaInfo !== null,
		nonce, selfPay,
	});
	const xPayment = Buffer.from(JSON.stringify({
		x402Version: 2,
		scheme: 'exact',
		network: accept.network,
		resource: { url, mimeType: 'application/json' },
		payload: { transaction: txBase64 },
		accepted: accept,
	})).toString('base64');

	// Step 4 — replay the request carrying the payment.
	const paidRes = await fetchWithTimeout(url, {
		...reqInit,
		headers: { ...reqInit.headers, 'x-payment': xPayment },
	});

	let txSig = null;
	if (paidRes.ok) {
		const responseHeader = paidRes.headers?.get?.('x-payment-response');
		if (responseHeader) {
			try {
				const settled = JSON.parse(Buffer.from(responseHeader, 'base64').toString('utf8'));
				txSig = settled?.transaction || null;
			} catch { /* non-fatal */ }
		}
	}

	return {
		success: paidRes.ok, paid: paidRes.ok, free: false, skipped: false,
		amountAtomic, txSig, status: paidRes.status,
		responseBody: paidRes.body,
		errorMsg: paidRes.ok ? null : `http_${paidRes.status}`,
	};
}
