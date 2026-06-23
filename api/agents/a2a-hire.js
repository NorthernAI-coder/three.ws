// POST /api/agents/a2a-hire — one agent autonomously hires and pays another for a
// real, executable skill, over the real x402 rails, bounded by the hiring agent's
// spend policy + kill switch, and recorded as a real on-chain invocation receipt.
//
// This is the load-bearing piece of the agent-to-agent economy. The flow, every
// step real, every spend gated server-side:
//
//   1. Owner-gate: the caller must own the hiring agent (agent_identities.user_id).
//   2. Resolve the provider's offer from the real offer registry (agent_paid_services
//      → /api/x402/service/<slug>), which pays the PROVIDER agent's own wallet.
//   3. Reserve the spend against the hiring agent's spend policy (agent-trade-guards):
//      per-tx + daily ceilings, withdraw allowlist, and the kill switch (frozen) —
//      all enforced atomically BEFORE any money moves. Idempotent: a retry with the
//      same key never double-charges.
//   4. Pay over the real x402 protocol (x402-user-payer → @x402/svm exact scheme):
//      the hiring agent's custodial Solana wallet settles USDC to the provider, and
//      the provider's upstream executes the REAL skill. The x402 endpoint settles
//      ONLY after the work succeeds (verify → work → settle), so a failed invocation
//      can never charge the hirer — "real value or no transaction" by construction.
//   5. Record a real on-chain invocation receipt (agent-invocation program) with the
//      hiring agent as invoker and the provider agent as target — auditable on both
//      sides with explorer links.
//   6. Finalize the hire + custody ledger so both wallets show the income/outlay and
//      the marketplace's completion stats update from real data only.

import { authenticateBearer, extractBearer, getSessionUser } from '../_lib/auth.js';
import { cors, error, json, method, rateLimited, readJson, wrap } from '../_lib/http.js';
import { requireCsrf } from '../_lib/csrf.js';
import { limits } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';
import { randomUUID } from 'node:crypto';

import {
	SpendLimitError,
	reserveSpendUsd,
	releaseSpendReservation,
	updateCustodyEvent,
	recordCustodyEvent,
} from '../_lib/agent-trade-guards.js';
import { payExternalX402, resolveSpendEnabled } from '../_lib/x402-user-payer.js';
import { serviceResourceUrl } from '../_lib/agent-paid-services.js';
import { recoverSolanaAgentKeypair } from '../_lib/agent-wallet.js';
import { recordInvocationReceipt } from '../_lib/agent-invocation-onchain.js';
import {
	atomicsToUsdc,
	getOfferBySlug,
	recordHire,
	updateHire,
} from '../_lib/agent-economy.js';

// Pull the settlement signature out of the x402 receipt header object, whatever
// shape the facilitator returned it in.
function receiptSignature(receipt) {
	if (!receipt || typeof receipt !== 'object') return null;
	return receipt.transaction || receipt.signature || receipt.txHash || receipt.tx || null;
}

// A short, human summary of the provider's result for the hire record + speech.
function summarizeResult(result) {
	try {
		if (result == null) return null;
		if (typeof result === 'string') return result.slice(0, 280);
		const inner = result.result ?? result;
		const s = typeof inner === 'string' ? inner : JSON.stringify(inner);
		return s.slice(0, 280);
	} catch {
		return null;
	}
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	if (!session && !bearer) return error(res, 401, 'unauthorized', 'sign in required to hire an agent');
	const userId = session?.id ?? bearer?.userId;

	// CSRF on the session (cookie) path, like every other custodial write.
	if (session && !(await requireCsrf(req, res, userId))) return;

	const rl = await limits.mcpAgentPay(userId || 'anon');
	if (!rl.success) return rateLimited(res, rl, 'hire rate limit exceeded');

	const body = (await readJson(req)) || {};
	const { hirerAgentId, serviceSlug, input = null, maxUsd } = body;
	const idempotencyKey = body.idempotencyKey || randomUUID();

	if (!hirerAgentId || typeof hirerAgentId !== 'string') {
		return error(res, 400, 'validation_error', 'hirerAgentId is required');
	}
	if (!serviceSlug || typeof serviceSlug !== 'string') {
		return error(res, 400, 'validation_error', 'serviceSlug is required');
	}

	// ── Owner gate: the caller must own the hiring agent ────────────────────
	const [hirer] = await sql`
		SELECT id, user_id, name, meta FROM agent_identities
		WHERE id = ${hirerAgentId} AND deleted_at IS NULL
	`;
	if (!hirer) return error(res, 404, 'not_found', 'hiring agent not found');
	if (hirer.user_id !== userId) {
		return error(res, 403, 'forbidden', 'you do not own this agent');
	}
	if (!hirer.meta?.solana_address || !hirer.meta?.encrypted_solana_secret) {
		return error(res, 409, 'no_wallet', 'this agent has no Solana wallet provisioned to pay from');
	}

	// ── Resolve the provider's offer ────────────────────────────────────────
	const offer = await getOfferBySlug(serviceSlug);
	if (!offer) return error(res, 404, 'offer_not_found', `no service offer at ${serviceSlug}`);
	if (!offer.provider?.id) return error(res, 409, 'offer_unavailable', 'this offer has no provider agent');
	if (offer.provider.is_public === false) {
		return error(res, 409, 'offer_unavailable', 'this provider is not currently available');
	}
	if (offer.provider.id === hirerAgentId) {
		return error(res, 400, 'self_hire', 'an agent cannot hire its own service');
	}

	const usd = atomicsToUsdc(offer.price_atomics);
	const priceNetwork = offer.network === 'solana' ? 'solana' : 'base';

	// Owner-set per-call ceiling for this hire (can only lower the price gate).
	if (typeof maxUsd === 'number' && Number.isFinite(maxUsd) && usd > maxUsd + 1e-9) {
		return error(res, 402, 'over_cap', `this service costs $${usd.toFixed(2)}, above your $${maxUsd.toFixed(2)} per-call limit`, {
			price_usd: usd,
			max_usd: maxUsd,
		});
	}

	if (!resolveSpendEnabled()) {
		return error(res, 501, 'spend_disabled', 'autonomous agent spending is not enabled on this server (set THREEWS_AGENT_PAY_ENABLED=1)');
	}

	// ── Idempotency: never double-charge a retried hire ─────────────────────
	let hireRow;
	try {
		const { row, existing } = await recordHire({
			hirerAgentId,
			hirerUserId: userId,
			providerAgentId: offer.provider.id,
			serviceId: offer.service_id,
			serviceSlug: offer.slug,
			skillName: offer.name,
			amountAtomics: offer.price_atomics,
			usd,
			currency: 'USDC',
			network: priceNetwork,
			payerAddress: hirer.meta.solana_address,
			payoutAddress: offer.provider.solana_address || null,
			idempotencyKey,
			meta: { hirer_name: hirer.name || null, provider_name: offer.provider.name },
		});
		hireRow = row;
		if (existing) {
			if (row.status === 'completed') {
				return json(res, 200, { ok: true, idempotent: true, hire: publicHire(row, offer) });
			}
			if (row.status === 'pending') {
				return error(res, 409, 'hire_in_progress', 'a hire with this key is already in progress');
			}
			// failed/refunded/disputed: tell the caller to retry with a fresh key.
			return error(res, 409, 'hire_terminal', `a prior hire with this key ended '${row.status}'; retry with a new idempotencyKey`, {
				status: row.status,
			});
		}
	} catch (err) {
		console.error('[a2a-hire] recordHire failed', err?.message || err);
		return error(res, 500, 'hire_record_failed', 'could not record the hire');
	}

	// ── Reserve the spend against the hiring agent's spend policy ────────────
	// Per-tx + daily ceilings + kill switch (frozen), atomic, BEFORE payment.
	let reservationId = null;
	try {
		const reservation = await reserveSpendUsd({
			agentId: hirerAgentId,
			userId,
			meta: hirer.meta,
			category: 'x402',
			usdValue: usd,
			asset: 'USDC',
			network: 'mainnet',
			rowMeta: { kind: 'a2a_hire', slug: offer.slug, provider_agent_id: offer.provider.id, hire_id: hireRow.id },
		});
		reservationId = reservation.reservationId;
		await sql`UPDATE agent_hires SET spend_reservation_id = ${reservationId}, updated_at = now() WHERE id = ${hireRow.id}`;
	} catch (err) {
		await updateHire(hireRow.id, { status: 'failed', error: err?.message || 'spend policy blocked' });
		if (err instanceof SpendLimitError) {
			return error(res, err.status || 403, err.code || 'spend_blocked', err.message, err.detail || {});
		}
		console.error('[a2a-hire] reserve failed', err?.message || err);
		return error(res, 500, 'reserve_failed', 'could not reserve the spend');
	}

	// ── Pay over the real x402 rails (settles to the provider's wallet) ──────
	let payment;
	try {
		payment = await payExternalX402({
			userId,
			agentId: hirerAgentId,
			url: serviceResourceUrl(offer.slug),
			method: offer.method === 'POST' ? 'POST' : 'GET',
			body: offer.method === 'POST' ? (input ?? {}) : undefined,
			maxUsd: usd,
		});
	} catch (err) {
		// The x402 endpoint settles only after the provider's work succeeds, so a
		// throw here means NO money moved: release the hold and fail honestly.
		await releaseSpendReservation(reservationId, 'hire_payment_failed');
		await updateHire(hireRow.id, { status: 'failed', error: err?.message || String(err) });
		const code = err?.code || 'payment_failed';
		const status = code === 'spend_disabled' ? 501 : code === 'no_wallet' || code === 'no_solana_wallet' ? 409 : 502;
		console.error('[a2a-hire] payment failed', code, err?.message || err);
		return error(res, status, code, `the hire did not complete — no funds were moved: ${err?.message || code}`);
	}

	const paymentSignature = receiptSignature(payment.receipt);
	const payerAddress = payment.payer || hirer.meta.solana_address;

	// Finalize the spend reservation as confirmed (real, settled).
	await updateCustodyEvent(reservationId, {
		status: 'confirmed',
		signature: paymentSignature,
		meta: { settled: true },
	}).catch((e) => console.error('[a2a-hire] finalize custody failed', e?.message));

	// Record the provider's income in the custody ledger so it surfaces in the
	// live money pulse / money-cam as the provider earning (real inflow, real tx).
	if (offer.provider.id) {
		recordCustodyEvent({
			agentId: offer.provider.id,
			userId: null,
			eventType: 'tip',
			category: null,
			network: 'mainnet',
			asset: 'USDC',
			usd,
			signature: paymentSignature,
			status: 'confirmed',
			meta: { source: 'a2a_hire', from_agent_id: hirerAgentId, from: payerAddress, hire_id: hireRow.id, skill: offer.name },
		}).catch((e) => console.error('[a2a-hire] provider income record failed', e?.message));
	}

	// ── Write the real on-chain invocation receipt ──────────────────────────
	let invocation = null;
	let invocationError = null;
	try {
		const invokerKeypair = await recoverSolanaAgentKeypair(hirer.meta.encrypted_solana_secret, {
			agentId: hirerAgentId,
			userId,
			reason: 'a2a_hire_invocation_receipt',
		});
		const targetAuthority = offer.provider.solana_address;
		if (!targetAuthority) throw new Error('provider has no Solana authority to record against');
		invocation = await recordInvocationReceipt({
			invokerKeypair,
			targetAuthority,
			skillName: offer.name,
			parameters: JSON.stringify({ slug: offer.slug, hire: hireRow.id, usd }).slice(0, 480),
		});
	} catch (err) {
		// The payment + work are real and done; a receipt-write failure (e.g. the
		// agent wallet lacks SOL for the fee) must not undo a completed hire. Record
		// the reason and surface it honestly rather than faking a signature.
		invocationError = err?.message || String(err);
		console.error('[a2a-hire] invocation receipt failed', invocationError);
	}

	// ── Finalize the hire ───────────────────────────────────────────────────
	const finalized = await updateHire(hireRow.id, {
		status: 'completed',
		paymentSignature,
		payerAddress,
		invocationSignature: invocation?.signature || null,
		invocationError,
		resultSummary: summarizeResult(payment.result),
		meta: {
			receipt: payment.receipt || null,
			invocation: invocation || null,
		},
	});

	return json(res, 200, {
		ok: true,
		hire: publicHire(finalized || hireRow, offer, { invocation, payment }),
		result: payment.result ?? null,
	});
});

// Shape the hire for the client, including explorer links derived from the real
// on-chain signatures. The embodied layer + money-cam consume `embodied`.
function publicHire(row, offer, extra = {}) {
	const cluster = (extra?.invocation?.network || 'mainnet') === 'devnet' ? '?cluster=devnet' : '';
	const paymentSig = row.payment_signature || null;
	const invSig = row.invocation_signature || extra?.invocation?.signature || null;
	return {
		id: row.id,
		status: row.status,
		skill_name: row.skill_name,
		service_slug: row.service_slug,
		amount_atomics: String(row.amount_atomics),
		usd: row.usd != null ? Number(row.usd) : atomicsToUsdc(row.amount_atomics),
		currency: row.currency || 'USDC',
		network: row.network,
		hirer_agent_id: row.hirer_agent_id,
		provider_agent_id: row.provider_agent_id,
		provider: offer?.provider || null,
		payer_address: row.payer_address || null,
		payout_address: row.payout_address || null,
		payment_signature: paymentSig,
		payment_explorer: paymentSig ? `https://solscan.io/tx/${paymentSig}` : null,
		invocation_signature: invSig,
		invocation_explorer: invSig
			? `https://solscan.io/tx/${invSig}${cluster}`
			: null,
		invocation_error: row.invocation_error || null,
		result_summary: row.result_summary || null,
		created_at: row.created_at,
		completed_at: row.completed_at || null,
		// Drives the embodied 3D hand-off + Galaxy money-cam flow on the client.
		embodied: {
			from: row.hirer_agent_id,
			to: row.provider_agent_id,
			amountUsdc: row.usd != null ? Number(row.usd) : atomicsToUsdc(row.amount_atomics),
			type: 'payment',
		},
	};
}
