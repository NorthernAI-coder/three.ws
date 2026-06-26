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
//   1. Verifies the session token and reads the session's network preference
//   2. Probes the endpoint for its 402 challenge, selecting the right network accept
//   3. Enforces governance (budget, allowlist, per-tx cap) and reserves budget atomically
//   4. Signs the payment using the platform payer wallet for the session's network:
//      • solana → Solana USDC SPL transfer (X402_AGENT_SOLANA_SECRET_BASE58)
//      • base   → EIP-3009 transferWithAuthorization via viem (X402_EVM_AGENT_PRIVATE_KEY)
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
	verifySessionToken,
	reserveSessionSpend,
	rollbackReservation,
	recordExecution,
	SpendGovernorError,
} from '../_lib/pay/spend-governor.js';
import { createPrivateKeySigner, buildEvmExactPayload } from '../_lib/x402/a2a-client.js';

// Known USDC mint addresses per network
const USDC_SOLANA_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_CHAIN_ID = 8453; // eip155:8453

const SOLANA_RPC = env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const FETCH_TIMEOUT_MS = 20_000;

// ── Platform payer: Solana ───────────────────────────────────────────────────
let _solanaKeypair = null;

function loadSolanaKeypair() {
	if (_solanaKeypair) return _solanaKeypair;
	const b58 = process.env.X402_AGENT_SOLANA_SECRET_BASE58;
	if (b58) {
		_solanaKeypair = Keypair.fromSecretKey(bs58.decode(b58));
		return _solanaKeypair;
	}
	if (process.env.NODE_ENV !== 'production') {
		try {
			const arr = JSON.parse(readFileSync('/home/codespace/.config/x402-test-wallets/solana.json', 'utf8'));
			_solanaKeypair = Keypair.fromSecretKey(Uint8Array.from(arr));
			return _solanaKeypair;
		} catch { /* fall through */ }
	}
	const e = new Error('Platform Solana payer wallet not configured (set X402_AGENT_SOLANA_SECRET_BASE58)');
	e.status = 503;
	e.code = 'wallet_unconfigured';
	throw e;
}

// ── Platform payer: EVM ──────────────────────────────────────────────────────
let _evmSigner = null;

async function loadEvmSigner() {
	if (_evmSigner) return _evmSigner;
	const privateKey = process.env.X402_EVM_AGENT_PRIVATE_KEY;
	if (!privateKey) {
		const e = new Error('Platform EVM payer wallet not configured (set X402_EVM_AGENT_PRIVATE_KEY)');
		e.status = 503;
		e.code = 'wallet_unconfigured';
		throw e;
	}
	_evmSigner = await createPrivateKeySigner(privateKey);
	return _evmSigner;
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

// Classify a network string into 'solana' | 'base' | 'evm' | 'unknown'
function classifyNetwork(network) {
	if (!network) return 'unknown';
	if (typeof network === 'string' && network.startsWith('solana')) return 'solana';
	if (network === 'eip155:8453' || network === 'base') return 'base';
	if (/^eip155:\d+$/.test(network)) return 'evm';
	return 'unknown';
}

// ── Probe a 402 endpoint and select the best matching accept ────────────────
// networkPreference: 'solana' | 'base' | 'evm' — used to pick the right
// accept from the challenge's offers. Falls back to Solana if preferred network
// isn't available.
async function probe402(rawUrl, { method, body, networkPreference = 'solana' }) {
	let res;
	try {
		res = await guardedFetch(rawUrl, { method, body });
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

	// Select the accept that matches the session's network preference.
	// For Solana: look for a solana:* accept with the known USDC mint.
	// For Base: look for eip155:8453 with the known USDC address.
	// If the preferred network isn't available, fail clearly — mixing networks
	// between session policy and endpoint capability is not allowed.
	let accept = null;

	if (networkPreference === 'solana') {
		accept = challenge.accepts.find(
			(a) => typeof a?.network === 'string' &&
				a.network.startsWith('solana') &&
				a.asset === USDC_SOLANA_MINT,
		);
		if (!accept) {
			// Accept any Solana option as fallback (validate asset separately)
			accept = challenge.accepts.find(
				(a) => typeof a?.network === 'string' && a.network.startsWith('solana'),
			);
		}
		if (!accept) {
			throw Object.assign(new Error('Service has no Solana payment option; endpoint may be EVM-only'), {
				status: 422, code: 'no_solana_accept',
				detail: { networks: [...new Set(challenge.accepts.map((a) => a?.network).filter(Boolean))] },
			});
		}
		if (accept.asset !== USDC_SOLANA_MINT) {
			throw Object.assign(new Error(`Service requested payment in a non-USDC asset (${accept.asset})`), {
				status: 422, code: 'unsupported_asset',
				detail: { asset: accept.asset, expected: USDC_SOLANA_MINT },
			});
		}
		if (!accept.extra?.feePayer) {
			throw Object.assign(new Error('Solana 402 challenge is missing feePayer'), {
				status: 422, code: 'missing_fee_payer',
			});
		}
	} else if (networkPreference === 'base') {
		accept = challenge.accepts.find(
			(a) => (a?.network === 'eip155:8453' || a?.network === 'base') &&
				typeof a?.asset === 'string' &&
				a.asset.toLowerCase() === USDC_BASE_ADDRESS.toLowerCase(),
		);
		if (!accept) {
			// Fall back to any EVM accept on Base
			accept = challenge.accepts.find(
				(a) => a?.network === 'eip155:8453' || a?.network === 'base',
			);
		}
		if (!accept) {
			throw Object.assign(new Error('Service has no Base/EVM payment option; endpoint may be Solana-only'), {
				status: 422, code: 'no_evm_accept',
				detail: { networks: [...new Set(challenge.accepts.map((a) => a?.network).filter(Boolean))] },
			});
		}
		if (accept.asset?.toLowerCase() !== USDC_BASE_ADDRESS.toLowerCase()) {
			throw Object.assign(new Error(`Service requested payment in a non-USDC EVM asset (${accept.asset})`), {
				status: 422, code: 'unsupported_asset',
				detail: { asset: accept.asset, expected: USDC_BASE_ADDRESS },
			});
		}
	} else {
		// Unknown network preference — try to find any Solana accept first, then any EVM
		accept = challenge.accepts.find((a) => typeof a?.network === 'string' && a.network.startsWith('solana'))
			|| challenge.accepts[0];
		if (!accept) {
			throw Object.assign(new Error('Service has no recognized payment options'), {
				status: 422, code: 'no_accept',
			});
		}
	}

	const resource =
		challenge.resource && typeof challenge.resource === 'object'
			? challenge.resource
			: { url: typeof challenge.resource === 'string' ? challenge.resource : rawUrl };

	return { challenge, accept, resource };
}

// ── Build and sign the Solana USDC transfer ─────────────────────────────────
async function buildSolanaPayload({ accept, buyer, conn, resourceUrl }) {
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

// ── Build and sign an EVM EIP-3009 transferWithAuthorization ────────────────
async function buildEvmPayload({ accept, signer, resourceUrl }) {
	const payload = await buildEvmExactPayload({
		accept,
		signer,
		resource: { url: resourceUrl, mimeType: 'application/json' },
	});
	return payload;
}

// Explorer URL for a given tx hash and network
function explorerUrl(txHash, network) {
	if (!txHash) return null;
	if (typeof network === 'string' && network.startsWith('solana')) {
		return `https://solscan.io/tx/${txHash}`;
	}
	if (network === 'eip155:8453' || network === 'base') {
		return `https://basescan.org/tx/${txHash}`;
	}
	return null;
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

	try {
		validatePublicUrl(targetUrl);
	} catch {
		return error(res, 400, 'invalid_url', 'url must be a public https endpoint');
	}

	const t0 = Date.now();

	// Phase 0: peek at the session to know the network preference before probing.
	// This is a read-only lookup — the atomic reservation happens later in phase 3.
	let sessionPreview;
	try {
		sessionPreview = await verifySessionToken(sessionToken);
	} catch (err) {
		if (err instanceof SpendGovernorError) {
			return error(res, err.status, err.code, err.message, err.detail);
		}
		throw err;
	}

	const networkPreference = classifyNetwork(sessionPreview.network) === 'base' ? 'base' : 'solana';

	// Phase 1: probe the endpoint for its 402 challenge
	let probeResult;
	try {
		probeResult = await probe402(targetUrl, { method, body: requestBody, networkPreference });
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

	const { accept, resource } = probeResult;
	const amountAtomics = BigInt(accept.amount);
	const amountUsd = atomicsToUsd(amountAtomics);

	// Phase 2: governance enforcement — check session, allowlist, budget (atomic)
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

	// Phase 3: load platform payer and build the signed payment payload
	let paymentPayload;
	let payerAddress;

	if (networkPreference === 'base') {
		let signer;
		try {
			signer = await loadEvmSigner();
		} catch (err) {
			await rollbackReservation(sessionRecord.id, amountAtomics).catch(() => {});
			return error(res, 503, 'wallet_unconfigured', 'Platform EVM payment wallet is not configured');
		}
		payerAddress = signer.address;
		try {
			paymentPayload = await buildEvmPayload({
				accept,
				signer,
				resourceUrl: resource.url || targetUrl,
			});
		} catch (err) {
			await rollbackReservation(sessionRecord.id, amountAtomics).catch(() => {});
			return error(res, 502, 'build_failed', `Failed to build EVM payment: ${err?.message}`);
		}
	} else {
		let keypair;
		try {
			keypair = loadSolanaKeypair();
		} catch (err) {
			await rollbackReservation(sessionRecord.id, amountAtomics).catch(() => {});
			return error(res, 503, 'wallet_unconfigured', 'Platform Solana payment wallet is not configured');
		}
		payerAddress = keypair.publicKey.toBase58();
		const conn = solanaConnection({ url: SOLANA_RPC, commitment: 'confirmed' });
		try {
			paymentPayload = await buildSolanaPayload({
				accept,
				buyer: keypair,
				conn,
				resourceUrl: resource.url || targetUrl,
			});
		} catch (err) {
			await rollbackReservation(sessionRecord.id, amountAtomics).catch(() => {});
			return error(res, 502, 'build_failed', `Failed to build Solana payment: ${err?.message}`);
		}
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
		await recordExecution({
			sessionId: sessionRecord.id,
			userId: sessionRecord.user_id,
			endpointUrl: targetUrl,
			method,
			amountAtomics,
			network: accept.network,
			txHash: null,
			payerAddress,
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
	const txHash = settled?.transaction || settled?.txHash || null;
	const payer = settled?.payer || payerAddress;
	const durationMs = Date.now() - t0;

	// Explicit pre-settlement rejection — no funds moved, safe to roll back
	if (paid.status === 402) {
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

	// Non-402 non-success — chain state uncertain
	if (!paid.ok) {
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
			explorer: explorerUrl(txHash, accept.network),
		},
		session: {
			id: sessionRecord.id,
			spent_usd: atomicsToUsd(BigInt(sessionRecord.spent_usdc)),
			remaining_usd: atomicsToUsd(
				BigInt(sessionRecord.budget_usdc) - BigInt(sessionRecord.spent_usdc),
			),
		},
		duration_ms: durationMs,
	});
});
