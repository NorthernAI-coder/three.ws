// POST /api/pay/execute — execute an x402 payment using a Payment Session token.
//
// This is the core "agent proposes spend, governance enforces" endpoint.
// The agent presents:
//   - session_token: their payment session bearer token
//   - url: the x402 endpoint to pay
//   - method: GET | POST (optional, default GET)
//   - body: JSON body for POST requests (optional)
//   - idempotency_key: caller's dedup key (optional, recommended)
//
// The platform:
//   1. Verifies the session token and checks governance (budget, allowlist, per-tx cap)
//   2. Probes the endpoint for its 402 challenge
//   3. Reserves the amount from the session budget (atomic, race-safe)
//   4. Signs the Solana USDC transfer with the platform payer wallet
//   5. Presents X-PAYMENT header and returns the endpoint's response
//   6. Records the execution in payment_session_executions
//   7. On failure, rolls back the budget reservation so the session isn't charged
//
// No private key is ever exposed to the caller. The only secret is the session
// token, which is a time-bounded spending grant, not wallet access.

import { readFileSync } from 'node:fs';
import {
	Connection, PublicKey, Keypair, TransactionMessage, VersionedTransaction,
	ComputeBudgetProgram,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync,
	createTransferCheckedInstruction,
	createAssociatedTokenAccountIdempotentInstruction,
	TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getMint,
} from '@solana/spl-token';
import bs58 from 'bs58';

import { cors, error, json, readJson, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { env } from '../_lib/env.js';
import { validatePublicUrl, resolvePublicHost, pinnedAgent, SsrfError } from '../_lib/ssrf.js';
import { solanaConnection } from '../_lib/solana/connection.js';
import {
	usdToAtomics,
	atomicsToUsd,
	reserveSessionSpend,
	rollbackReservation,
	recordExecution,
	SpendGovernorError,
} from '../_lib/pay/spend-governor.js';

const USDC_MAINNET_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOLANA_RPC = env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const FETCH_TIMEOUT_MS = 20_000;

// ── Platform payer keypair ──────────────────────────────────────────────────
// Shared with x402-pay.js; loads X402_AGENT_SOLANA_SECRET_BASE58 or falls back
// to the dev test keypair. This is the wallet that signs session payments on
// behalf of users — it needs to hold USDC to fund the transfers.
let _platformKeypair = null;

function loadPlatformKeypair() {
	if (_platformKeypair) return _platformKeypair;
	const b58 = process.env.X402_AGENT_SOLANA_SECRET_BASE58;
	if (b58) {
		const raw = bs58.decode(b58);
		_platformKeypair = Keypair.fromSecretKey(raw);
		return _platformKeypair;
	}
	if (process.env.NODE_ENV !== 'production') {
		try {
			const arr = JSON.parse(readFileSync('/home/codespace/.config/x402-test-wallets/solana.json', 'utf8'));
			_platformKeypair = Keypair.fromSecretKey(Uint8Array.from(arr));
			return _platformKeypair;
		} catch { /* fall through */ }
	}
	const e = new Error('Platform payer wallet not configured (set X402_AGENT_SOLANA_SECRET_BASE58)');
	e.status = 503;
	e.code = 'wallet_unconfigured';
	throw e;
}

// ── SSRF-guarded fetch ──────────────────────────────────────────────────────
async function guardedFetch(rawUrl, { method = 'GET', headers = {}, body } = {}) {
	const url = validatePublicUrl(rawUrl);
	const addrs = await resolvePublicHost(url.hostname);
	const agent = pinnedAgent(url.hostname, addrs);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			method,
			redirect: 'manual',
			signal: controller.signal,
			dispatcher: agent,
			headers: {
				'user-agent': 'three.ws-payment-session/1.0 (+https://three.ws/)',
				accept: 'application/json, text/plain;q=0.8, */*;q=0.5',
				...(body != null ? { 'content-type': 'application/json' } : {}),
				...headers,
			},
			...(body != null ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
		});
		const text = await res.text();
		return { status: res.status, ok: res.ok, headers: res.headers, text };
	} finally {
		clearTimeout(timer);
		await agent.close().catch(() => {});
	}
}

function safeJson(text) {
	try { return JSON.parse(text); } catch { return null; }
}

function b64decodeJson(s) {
	if (!s) return null;
	try { return JSON.parse(Buffer.from(String(s), 'base64').toString('utf8')); } catch { return null; }
}

// ── Probe a 402 endpoint ────────────────────────────────────────────────────
async function probe402(url, { method, body }) {
	let res;
	try {
		res = await guardedFetch(url, { method, body });
	} catch (err) {
		if (err instanceof SsrfError) {
			throw Object.assign(new Error('Target URL is not a reachable public endpoint'), {
				status: 400, code: 'blocked_url',
			});
		}
		throw Object.assign(new Error(`Could not reach endpoint: ${err?.message}`), {
			status: 502, code: 'endpoint_unreachable',
		});
	}

	if (res.status !== 402) {
		return { free: true, status: res.status, result: safeJson(res.text) ?? res.text };
	}

	const challenge = safeJson(res.text) || b64decodeJson(res.headers.get('payment-required'));
	if (!challenge || !Array.isArray(challenge.accepts)) {
		throw Object.assign(new Error('Service returned an unreadable payment challenge'), {
			status: 502, code: 'invalid_challenge',
		});
	}

	const accept = challenge.accepts.find(
		(a) => typeof a?.network === 'string' && a.network.startsWith('solana'),
	);
	if (!accept) {
		throw Object.assign(new Error('Service has no Solana payment option (only EVM may be supported)'), {
			status: 422, code: 'no_solana_accept',
			detail: { networks: [...new Set(challenge.accepts.map((a) => a?.network).filter(Boolean))] },
		});
	}

	// Security: only allow the known Solana USDC mint — no arbitrary SPL tokens
	if (accept.asset !== USDC_MAINNET_MINT) {
		throw Object.assign(new Error('Service requested payment in a non-USDC asset; sessions only pay Solana USDC'), {
			status: 422, code: 'unsupported_asset',
			detail: { asset: accept.asset, expected: USDC_MAINNET_MINT },
		});
	}

	if (!accept.extra?.feePayer) {
		throw Object.assign(new Error('Service did not advertise a Solana fee payer'), {
			status: 422, code: 'missing_fee_payer',
		});
	}

	const resource =
		challenge.resource && typeof challenge.resource === 'object'
			? challenge.resource
			: { url: typeof challenge.resource === 'string' ? challenge.resource : url };

	return { challenge, accept, resource };
}

// ── Build and sign the Solana USDC transfer ─────────────────────────────────
async function buildPaymentPayload({ accept, buyer, conn, resourceUrl }) {
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
	const mintInfo = await getMint(conn, mint);

	const ixs = [
		ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }),
		ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
	];
	const receiverInfo = await conn.getAccountInfo(receiverAta);
	if (!receiverInfo) {
		ixs.push(createAssociatedTokenAccountIdempotentInstruction(
			feePayer, receiverAta, payTo, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
		));
	}
	ixs.push(createTransferCheckedInstruction(
		senderAta, mint, receiverAta, buyer.publicKey,
		amount, mintInfo.decimals, [], TOKEN_PROGRAM_ID,
	));

	const { blockhash } = await conn.getLatestBlockhash('confirmed');
	const message = new TransactionMessage({
		payerKey: feePayer,
		recentBlockhash: blockhash,
		instructions: ixs,
	}).compileToV0Message();
	const vtx = new VersionedTransaction(message);
	vtx.sign([buyer]);

	return {
		x402Version: 2,
		scheme: 'exact',
		network: accept.network,
		resource: { url: resourceUrl, mimeType: 'application/json' },
		accepted: accept,
		payload: { transaction: Buffer.from(vtx.serialize()).toString('base64') },
	};
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', origins: '*' })) return;
	if (req.method?.toUpperCase() !== 'POST') {
		return error(res, 405, 'method_not_allowed', 'POST required');
	}

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const body = await readJson(req, res);
	if (!body) return;

	const sessionToken = body.session_token;
	if (!sessionToken) return error(res, 400, 'missing_token', 'session_token is required');

	const targetUrl = body.url;
	if (!targetUrl) return error(res, 400, 'missing_url', 'url is required');

	const method = body.method === 'POST' ? 'POST' : 'GET';
	const requestBody = method === 'POST' ? body.body ?? null : null;
	const idempotencyKey = body.idempotency_key ?? null;

	// Validate the URL is reachable (not SSRF)
	try {
		validatePublicUrl(targetUrl);
	} catch {
		return error(res, 400, 'invalid_url', 'url must be a public https endpoint');
	}

	const t0 = Date.now();

	// Phase 1: probe the endpoint for its 402 challenge
	let probeResult;
	try {
		probeResult = await probe402(targetUrl, { method, body: requestBody });
	} catch (err) {
		return error(res, err.status ?? 502, err.code ?? 'probe_failed', err.message, err.detail);
	}

	// Endpoint is free — return the result directly without touching the session
	if (probeResult.free) {
		return json(res, 200, {
			ok: true,
			paid: false,
			note: 'Endpoint served response without a 402 — no payment needed.',
			status: probeResult.status,
			result: probeResult.result,
		});
	}

	const { accept, resource, challenge } = probeResult;
	const amountAtomics = BigInt(accept.amount);
	const amountUsd = atomicsToUsd(amountAtomics);

	// Phase 2: governance enforcement — check session, allowlist, budget
	let sessionRecord, reservationId;
	try {
		const reservation = await reserveSessionSpend({
			token: sessionToken,
			url: targetUrl,
			amountAtomics,
		});
		sessionRecord = reservation.session;
		reservationId = reservation.reservationId;
	} catch (err) {
		if (err instanceof SpendGovernorError) {
			return error(res, err.status, err.code, err.message, err.detail);
		}
		throw err;
	}

	// Phase 3: load platform payer and sign
	let keypair;
	try {
		keypair = loadPlatformKeypair();
	} catch (err) {
		// Roll back — we reserved but can't sign
		await rollbackReservation(sessionRecord.id, amountAtomics).catch(() => {});
		return error(res, 503, 'wallet_unconfigured', 'Platform payment wallet is not configured');
	}

	const conn = solanaConnection({ url: SOLANA_RPC, commitment: 'confirmed' });
	let paymentPayload;
	try {
		paymentPayload = await buildPaymentPayload({
			accept,
			buyer: keypair,
			conn,
			resourceUrl: resource.url,
		});
	} catch (err) {
		await rollbackReservation(sessionRecord.id, amountAtomics).catch(() => {});
		return error(res, 502, 'build_failed', `Failed to build payment: ${err?.message}`);
	}

	const xPayment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

	// Phase 4: submit payment to the endpoint
	let paid;
	try {
		paid = await guardedFetch(targetUrl, {
			method,
			body: requestBody,
			headers: { 'X-PAYMENT': xPayment },
		});
	} catch (err) {
		// Network failure AFTER signing — chain state unknown, do NOT roll back.
		// The wallet may have been debited. Record as 'failed' in the audit log.
		await recordExecution({
			sessionId: sessionRecord.id,
			userId: sessionRecord.user_id,
			endpointUrl: targetUrl,
			method,
			amountAtomics,
			network: accept.network,
			txHash: null,
			payerAddress: keypair.publicKey.toBase58(),
			payeeAddress: accept.payTo,
			status: 'failed',
			errorCode: 'settle_uncertain',
			errorMessage: err?.message,
			durationMs: Date.now() - t0,
			idempotencyKey,
		}).catch(() => {});
		return error(res, 502, 'settle_uncertain',
			'Payment was submitted but confirmation was not received — do not retry immediately.');
	}

	const paidJson = safeJson(paid.text) ?? paid.text;
	const settled = b64decodeJson(paid.headers.get('x-payment-response'));
	const txHash = settled?.transaction || null;
	const payer = settled?.payer || keypair.publicKey.toBase58();
	const durationMs = Date.now() - t0;

	// Handle endpoint rejection after payment attempt
	if (!paid.ok) {
		if (paid.status === 402) {
			// Explicit pre-settlement rejection — no funds moved, safe to roll back
			await rollbackReservation(sessionRecord.id, amountAtomics).catch(() => {});
			await recordExecution({
				sessionId: sessionRecord.id,
				userId: sessionRecord.user_id,
				endpointUrl: targetUrl,
				method,
				amountAtomics,
				network: accept.network,
				txHash: null,
				payerAddress: payer,
				payeeAddress: accept.payTo,
				status: 'failed',
				errorCode: 'payment_rejected',
				errorMessage: 'Service rejected the payment before settlement',
				durationMs,
				idempotencyKey,
			}).catch(() => {});
			return error(res, 402, 'payment_rejected',
				'Service rejected the payment before settlement — budget has been restored.',
				typeof paidJson === 'object' ? paidJson : null);
		}

		// Non-402 error after payment — chain state uncertain
		await recordExecution({
			sessionId: sessionRecord.id,
			userId: sessionRecord.user_id,
			endpointUrl: targetUrl,
			method,
			amountAtomics,
			network: accept.network,
			txHash,
			payerAddress: payer,
			payeeAddress: accept.payTo,
			status: 'failed',
			errorCode: 'upstream_error',
			errorMessage: `Endpoint returned HTTP ${paid.status}`,
			responseBody: typeof paidJson === 'object' ? paidJson : null,
			durationMs,
			idempotencyKey,
		}).catch(() => {});
		return error(res, 502, 'upstream_error',
			`Endpoint returned HTTP ${paid.status} after payment — check wallet activity before retrying.`);
	}

	// Phase 5: success — record the settled execution
	await recordExecution({
		sessionId: sessionRecord.id,
		userId: sessionRecord.user_id,
		endpointUrl: targetUrl,
		method,
		amountAtomics,
		network: accept.network,
		txHash,
		payerAddress: payer,
		payeeAddress: accept.payTo,
		status: 'settled',
		responseBody: typeof paidJson === 'object' ? paidJson : null,
		durationMs,
		idempotencyKey,
	}).catch(() => {});

	return json(res, 200, {
		ok: true,
		paid: true,
		result: paidJson,
		payment: {
			session_id: sessionRecord.id,
			amount_usd: amountUsd,
			network: accept.network,
			payer,
			pay_to: accept.payTo,
			tx_hash: txHash,
			explorer: txHash ? `https://solscan.io/tx/${txHash}` : null,
		},
		session: {
			id: sessionRecord.id,
			spent_usd: atomicsToUsd(sessionRecord.spent_usdc),
			remaining_usd: atomicsToUsd(
				BigInt(sessionRecord.budget_usdc) - BigInt(sessionRecord.spent_usdc),
			),
		},
		duration_ms: durationMs,
	});
});
