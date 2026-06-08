// POST /api/agents/a2a-call — autonomous, mandate-authorized agent-to-agent payment.
//
// This is the load-bearing piece of agent-to-agent commerce: it lets one of the
// caller's agents discover a peer's paid A2A skill, pay for it under a signed
// Intent Mandate, and return the peer's result — without a human approving each
// individual payment. Safety comes from three gates, all enforced here before a
// single token moves:
//
//   1. Mandate signature + per-call policy (mandate.js): is this spend authorized
//      at all, on this network, to this peer, in this currency, under the per-call cap?
//   2. Cumulative budget (spend-ledger.js): would this push lifetime spend under
//      the mandate over its total cap? Reserved atomically, released on failure.
//   3. Reputation (reputation-gate.js): does the peer clear the caller's ERC-8004
//      trust bar? Opt-in per call.
//
// Settlement itself reuses the existing A2A x402 client (api/_lib/x402/a2a-client.js)
// so this inherits the spec-compliant two-leg handshake. Solana is the primary
// rail — USDC SPL TransferChecked, partially signed by the platform payer and
// co-signed by the peer's facilitator fee payer — with EVM EIP-3009 as fallback.

import { authenticateBearer, extractBearer, getSessionUser } from '../_lib/auth.js';
import { cors, error, json, method, rateLimited, readJson, respondError, wrap } from '../_lib/http.js';
import { limits } from '../_lib/rate-limit.js';
import { env } from '../_lib/env.js';
import { assertSafePublicUrl, SsrfBlockedError } from '../_lib/ssrf-guard.js';
import { assertMandateAllows, MandateError, verifyIntentMandate } from '../_lib/a2a/mandate.js';
import { release, reserve } from '../_lib/a2a/spend-ledger.js';
import { assertReputationOk, ReputationError } from '../_lib/a2a/reputation-gate.js';
import {
	A2AClientError,
	buildEvmExactPayload,
	buildSolanaExactPayload,
	createPrivateKeySigner,
	createSolanaSigner,
	isSolanaNetwork,
	NETWORK_SOLANA_MAINNET,
	requestQuote,
	submitPayment,
} from '../_lib/x402/a2a-client.js';

// Solana is the primary settlement rail; EVM chains are the fallback.
const DEFAULT_NETWORK_PREFERENCE = [
	NETWORK_SOLANA_MAINNET,
	'eip155:8453',
	'eip155:84532',
	'eip155:1',
];

// Choose the accept entry to pay against, honoring the caller's network
// preference and only ever picking a `scheme=exact` entry on a rail we can
// settle — Solana SPL or an EVM chain. Solana is preferred when both are
// offered without an explicit preference.
function pickAccept(accepts, preference) {
	const order = preference?.length ? preference : DEFAULT_NETWORK_PREFERENCE;
	for (const net of order) {
		const match = accepts.find((a) => a.network === net && a.scheme === 'exact');
		if (match) return match;
	}
	const solana = accepts.find((a) => a.scheme === 'exact' && isSolanaNetwork(a.network));
	if (solana) return solana;
	const evm = accepts.find((a) => a.scheme === 'exact' && /^eip155:\d+$/.test(a.network));
	if (evm) return evm;
	throw new A2AClientError(
		'no_supported_accept',
		'peer offered no supported (scheme=exact) accept entry on Solana or EVM',
		{ accepts: accepts.map(({ network, scheme }) => ({ network, scheme })) },
	);
}

// Normalize the on-chain asset name to a currency symbol for the mandate check.
function currencyOf(accept) {
	const name = accept?.extra?.name || '';
	return /usdc|usd coin/i.test(name) ? 'USDC' : name || undefined;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	if (!session && !bearer) return error(res, 401, 'unauthorized', 'sign in required');
	const userId = session?.id ?? bearer?.userId;

	const rl = await limits.mcpAgentPay(userId || 'anon');
	if (!rl.success) return rateLimited(res, rl, 'a2a payment rate limit exceeded');

	const body = await readJson(req);
	const {
		mandate: mandateJws,
		endpoint,
		text = 'Initiate paid skill.',
		networkPreference,
		reputation,
	} = body || {};

	if (!endpoint || typeof endpoint !== 'string') {
		return error(res, 400, 'validation_error', 'endpoint (peer A2A URL) is required');
	}

	// The peer endpoint is fully caller-controlled and we make a server-side
	// request to it — guard against SSRF into internal addresses.
	let safeEndpoint;
	try {
		safeEndpoint = (await assertSafePublicUrl(endpoint, { allowHttp: false })).toString();
	} catch (err) {
		if (err instanceof SsrfBlockedError) {
			return error(res, 400, 'invalid_endpoint', err.message);
		}
		throw err;
	}

	// ── Gate 1a: mandate is valid and belongs to this user ──────────────────
	let mandate;
	try {
		mandate = await verifyIntentMandate(mandateJws);
	} catch (err) {
		if (err instanceof MandateError) return error(res, err.status, err.code, err.message);
		throw err;
	}
	if (mandate.ownerUserId !== userId) {
		return error(res, 403, 'mandate_not_yours', 'this mandate was issued to a different user');
	}

	// ── Discover the peer's price (first leg of the A2A handshake) ──────────
	let quote;
	try {
		quote = await requestQuote({ endpoint: safeEndpoint, text });
	} catch (err) {
		if (err instanceof A2AClientError) {
			return error(res, 502, 'quote_failed', `could not get a quote from peer: ${err.message}`);
		}
		throw err;
	}

	let accept;
	try {
		accept = pickAccept(quote.required.accepts, networkPreference);
	} catch (err) {
		return error(res, 422, err.code || 'no_supported_accept', err.message);
	}
	const amount = accept.amount;
	const network = accept.network;

	// ── Gate 1b: per-call policy ────────────────────────────────────────────
	try {
		assertMandateAllows({
			mandate,
			amountAtomics: amount,
			network,
			resource: safeEndpoint,
			currency: currencyOf(accept),
		});
	} catch (err) {
		if (err instanceof MandateError) return error(res, err.status, err.code, err.message);
		throw err;
	}

	// ── Gate 3: peer reputation (opt-in) ────────────────────────────────────
	if (reputation && typeof reputation === 'object') {
		try {
			await assertReputationOk({
				agentId: reputation.agentId,
				chainId: reputation.chainId,
				minAverage: Number(reputation.minAverage) || 0,
				minCount: Number(reputation.minCount) || 0,
			});
		} catch (err) {
			if (err instanceof ReputationError) {
				return respondError(res, err.status, err.code, err);
			}
			throw err;
		}
	}

	// ── Gate 2: reserve against the total budget (atomic) ───────────────────
	const nowSec = Math.floor(Date.now() / 1000);
	const ledgerTtl = Math.max(60, (mandate.expiresAt || nowSec) - nowSec);
	const reservation = await reserve(mandate.mandateId, amount, mandate.maxAtomics, ledgerTtl);
	if (!reservation.ok) {
		return error(res, 402, 'budget_exceeded', 'mandate budget would be exceeded by this payment', {
			spent: reservation.spent,
			cap: reservation.cap,
			amount,
		});
	}

	// ── Settle ──────────────────────────────────────────────────────────────
	// Pick the payer wallet for the chosen rail. Solana is primary (SPL
	// TransferChecked co-signed by the peer's facilitator fee payer); EVM is the
	// fallback (EIP-3009 transferWithAuthorization).
	const onSolana = isSolanaNetwork(network);
	const payerKey = onSolana ? env.A2A_PAYER_SOLANA_SECRET : env.A2A_PAYER_PRIVATE_KEY;
	if (!payerKey) {
		await release(mandate.mandateId, amount);
		return error(
			res,
			501,
			'payer_not_configured',
			onSolana
				? 'autonomous Solana payer wallet is not configured (set A2A_PAYER_SOLANA_SECRET)'
				: 'autonomous EVM payer wallet is not configured (set A2A_PAYER_PRIVATE_KEY)',
			{ network },
		);
	}

	try {
		const resource = quote.required.resource || { url: safeEndpoint, mimeType: 'application/json' };
		let signer;
		let paymentPayload;
		let payerAddress;
		if (onSolana) {
			signer = await createSolanaSigner(payerKey);
			payerAddress = signer.address;
			paymentPayload = await buildSolanaExactPayload({
				accept,
				signer,
				resource,
				rpcUrl: env.SOLANA_RPC_URL,
			});
		} else {
			signer = await createPrivateKeySigner(payerKey);
			payerAddress = signer.address;
			paymentPayload = await buildEvmExactPayload({ accept, signer, resource });
		}
		const result = await submitPayment({
			endpoint: safeEndpoint,
			taskId: quote.taskId,
			paymentPayload,
		});

		if (result.state !== 'completed') {
			await release(mandate.mandateId, amount);
			return error(res, 502, 'payment_failed', result.receipts?.[0]?.errorReason || `peer task ended in state ${result.state}`, {
				state: result.state,
				receipts: result.receipts || [],
			});
		}

		const artifacts = Array.isArray(result.task?.artifacts) ? result.task.artifacts : [];
		return json(res, 200, {
			ok: true,
			mandate_id: mandate.mandateId,
			task_id: quote.taskId,
			amount,
			network,
			currency: currencyOf(accept) || null,
			payer: payerAddress,
			spent: reservation.spent,
			cap: reservation.cap,
			receipts: result.receipts || [],
			artifacts,
		});
	} catch (err) {
		// Any failure after reservation but before a confirmed settlement must
		// release the hold so the mandate's budget isn't silently consumed.
		await release(mandate.mandateId, amount);
		if (err instanceof A2AClientError) {
			return error(res, 502, err.code || 'payment_failed', err.message, { details: err.details });
		}
		return respondError(res, err.status || 502, 'payment_failed', err);
	}
});
