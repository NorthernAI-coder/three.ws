// POST /api/x402-facilitator/verify
// POST /api/x402-facilitator/settle
// GET  /api/x402-facilitator/supported
//
// three.ws SELF-HOSTED x402 facilitator (Solana). This is the in-house
// replacement for an external facilitator (e.g. PayAI): it validates a
// buyer-signed USDC transfer, co-signs it with OUR sponsor (fee-payer) key,
// broadcasts it over OUR RPC, and logs the exact SOL fee burned. Point
// X402_FACILITATOR_URL_SOLANA at https://three.ws/api/x402-facilitator and no
// third party ever touches settlement of the closed-loop agent economy.
//
// OFF BY DEFAULT. Requires X402_SELF_FACILITATOR_ENABLED=true plus the sponsor
// secret X402_FEE_PAYER_SECRET_BASE58. Only settles payments whose payTo is in
// the platform allowlist (X402_PAY_TO_SOLANA + X402_SELF_FACILITATOR_PAYTO_ALLOWLIST)
// and whose transaction is a single clean USDC transfer — see self-facilitator.js
// validateRingTransaction() for the anti-drain gate.
//
// Wire format matches the x402 v2 facilitator contract consumed by
// api/_lib/x402-spec.js callFacilitator():
//   /verify  → { isValid, network, asset, payer }  |  { isValid:false, invalidReason }
//   /settle  → { success:true, transaction, network, payer }  |  { success:false, errorReason }

import { cors, json, method, wrap, readJson } from '../_lib/http.js';
import { sql } from '../_lib/db.js';
import { env } from '../_lib/env.js';
import { NETWORK_SOLANA_MAINNET, X402_VERSION } from '../_lib/x402-spec.js';
import {
	SELF_FACILITATOR_ENABLED,
	verifyRingPayment,
	settleRingPayment,
	loadFeePayerKeypair,
} from '../_lib/x402/self-facilitator.js';

function actionFrom(req) {
	const q = req.query?.action;
	if (q) return String(q).toLowerCase();
	const path = String(req.url || '').split('?')[0];
	const seg = path.split('/').filter(Boolean).pop();
	return String(seg || '').toLowerCase();
}

// Fire-and-forget settlement audit. A DB hiccup must never fail a settle the
// buyer already funded — the ledger backfill (x402_ring_ledger) is the economic
// source of truth; this table is the per-op facilitator trail.
function logOp(row) {
	sql`
		INSERT INTO x402_self_facilitator_log
			(action, network, payer, pay_to, mint, amount_atomic, tx_sig,
			 fee_lamports, ok, reject_reason, idempotency_key)
		VALUES
			(${row.action}, ${row.network || null}, ${row.payer || null},
			 ${row.payTo || null}, ${row.mint || null}, ${row.amountAtomic ?? null},
			 ${row.txSig || null}, ${row.feeLamports ?? null}, ${row.ok},
			 ${row.reason || null}, ${row.idempotencyKey || null})
	`.catch((err) => console.error('[self-facilitator] log failed', err?.message || err));
}

async function getBody(req) {
	if (req.body && typeof req.body === 'object') return req.body;
	try {
		return await readJson(req);
	} catch {
		return null;
	}
}

export default wrap(async (req, res) => {
	cors(req, res, { origins: '*', methods: 'GET,POST,OPTIONS' });
	if (req.method === 'OPTIONS') {
		res.statusCode = 204;
		res.end();
		return;
	}

	const action = actionFrom(req);

	// /supported is a public capability probe (no payment, no secret needed) so
	// api/x402-status.js probeFacilitators() can confirm we advertise exact/solana.
	if (action === 'supported') {
		if (!method(req, res, ['GET', 'POST'])) return;
		return json(res, 200, {
			kinds: [
				{ x402Version: X402_VERSION, scheme: 'exact', network: NETWORK_SOLANA_MAINNET },
			],
		});
	}

	if (!method(req, res, ['POST'])) return;

	if (!SELF_FACILITATOR_ENABLED) {
		return json(res, 503, {
			isValid: false,
			success: false,
			errorReason: 'self_facilitator_disabled',
			invalidReason: 'self_facilitator_disabled',
		});
	}

	const body = await getBody(req);
	const paymentPayload = body?.paymentPayload;
	const requirement = body?.paymentRequirements;
	if (!paymentPayload || !requirement) {
		return json(res, 400, {
			isValid: false,
			success: false,
			errorReason: 'missing paymentPayload/paymentRequirements',
			invalidReason: 'missing paymentPayload/paymentRequirements',
		});
	}

	// This facilitator settles Solana only. EVM/other networks are not ours here.
	if (!String(requirement.network || '').startsWith('solana')) {
		return json(res, 400, {
			isValid: false,
			success: false,
			errorReason: `unsupported_network:${requirement.network}`,
			invalidReason: `unsupported_network:${requirement.network}`,
		});
	}

	if (action === 'verify') {
		const result = verifyRingPayment({ paymentPayload, requirement });
		logOp({
			action: 'verify',
			network: requirement.network,
			payer: result.payer,
			payTo: requirement.payTo,
			mint: requirement.asset,
			amountAtomic: Number(requirement.amount) || null,
			ok: result.isValid,
			reason: result.invalidReason,
		});
		// 200 either way — callFacilitator inspects isValid; verifyPayment maps a
		// false result to a clean 402 for the paying client.
		return json(res, 200, result);
	}

	if (action === 'settle') {
		let feePayer;
		try {
			feePayer = loadFeePayerKeypair();
		} catch (err) {
			logOp({ action: 'settle', network: requirement.network, ok: false, reason: `no_sponsor_key:${err.message}` });
			return json(res, 200, { success: false, errorReason: 'sponsor_key_unconfigured' });
		}
		const result = await settleRingPayment({ paymentPayload, requirement, feePayer });
		logOp({
			action: 'settle',
			network: requirement.network,
			payer: result.payer,
			payTo: requirement.payTo,
			mint: requirement.asset,
			amountAtomic: Number(requirement.amount) || null,
			txSig: result.transaction,
			feeLamports: result.feeLamports,
			ok: result.success,
			reason: result.reason,
			idempotencyKey: req.headers?.['idempotency-key'] || null,
		});
		if (!result.success) {
			// 200 + success:false → settlePayment throws a clean settle_failed without
			// the transient-5xx retry path.
			return json(res, 200, { success: false, errorReason: result.reason });
		}
		return json(res, 200, {
			success: true,
			transaction: result.transaction,
			network: result.network,
			payer: result.payer,
		});
	}

	return json(res, 404, { error: `unknown_action:${action}` });
});
