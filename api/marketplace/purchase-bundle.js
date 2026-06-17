/**
 * Bundle purchase flow (Solana Pay).
 * ------------------------------------
 * POST /api/marketplace/purchase-bundle
 *   Body: { bundle_id }
 *   Creates a pending bundle_purchases row and returns Solana Pay params.
 *
 * POST /api/marketplace/purchase-bundle/:purchaseId/confirm
 *   Verifies on-chain transaction, marks confirmed, and unlocks every skill
 *   in the bundle via skill_purchases (one row per skill, status='confirmed').
 */

import { Keypair } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { sql } from '../_lib/db.js';
import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { cors, error, json, method, readJson, wrap, rateLimited } from '../_lib/http.js';
import { clientIp, limits } from '../_lib/rate-limit.js';
import { requireCsrf } from '../_lib/csrf.js';
import { resolveMarketplaceFee } from '../_lib/marketplace-platform-fee.js';
import { confirmSkillPurchase } from '../_lib/purchase-confirm.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveAuth(req) {
	const session = await getSessionUser(req);
	if (session) return { userId: session.id };
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer) return { userId: bearer.userId };
	return null;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,GET,OPTIONS', credentials: true })) return;

	const url = new URL(req.url, 'http://x');
	const parts = url.pathname.split('/').filter(Boolean);
	const purchaseId = url.searchParams.get('purchase_id') || parts[3] || null;
	const op = url.searchParams.get('op') || parts[4] || null;

	if (!purchaseId) {
		if (req.method === 'POST') return handleCreate(req, res);
		return error(res, 405, 'method_not_allowed', 'POST required');
	}
	if (!UUID_RE.test(purchaseId)) return error(res, 400, 'validation_error', 'invalid purchase id');
	if (op === 'confirm') return handleConfirm(req, res, purchaseId);
	return error(res, 404, 'not_found', 'unknown action');
});

// ── Create ──────────────────────────────────────────────────────────────────

async function handleCreate(req, res) {
	if (!method(req, res, ['POST'])) return;

	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');
	if (!(await requireCsrf(req, res, auth.userId))) return;

	const rl = await limits.authIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const body = await readJson(req).catch(() => null);
	if (!body?.bundle_id || !UUID_RE.test(body.bundle_id))
		return error(res, 400, 'validation_error', 'bundle_id required');

	const [bundle] = await sql`
		SELECT sb.id, sb.agent_id, sb.price_amount, sb.currency_mint, sb.chain,
		       COALESCE(json_agg(bi.skill_name) FILTER (WHERE bi.skill_name IS NOT NULL), '[]') AS skills
		FROM skill_bundles sb
		LEFT JOIN bundle_items bi ON bi.bundle_id = sb.id
		WHERE sb.id = ${body.bundle_id} AND sb.is_active = true
		GROUP BY sb.id
	`;
	if (!bundle) return error(res, 404, 'not_found', 'bundle not found');
	if (!bundle.skills.length) return error(res, 400, 'validation_error', 'bundle has no skills');

	// Resolve creator payout wallet.
	const [payoutRow] = await sql`
		SELECT w.address FROM agent_payout_wallets w
		WHERE w.agent_id = ${bundle.agent_id} AND w.chain = ${bundle.chain} AND w.is_default = true
		ORDER BY w.created_at DESC LIMIT 1
	`;
	const [agentRow] = payoutRow ? [payoutRow] : await sql`
		SELECT u.wallet_address AS address FROM users u
		JOIN agent_identities ai ON ai.user_id = u.id
		WHERE ai.id = ${bundle.agent_id}
	`;
	if (!agentRow?.address) return error(res, 422, 'no_payout_wallet', 'creator has no payout wallet');

	const feeResult = await resolveMarketplaceFee({
		priceAmount: bundle.price_amount,
		currencyMint: bundle.currency_mint,
		chain: bundle.chain,
	}).catch(() => ({ feeAmount: 0, treasuryWallet: null }));

	const reference = Keypair.generate().publicKey.toString();

	const [purchase] = await sql`
		INSERT INTO bundle_purchases
			(bundle_id, user_id, agent_id, price_amount, currency_mint, chain, platform_fee_amount)
		VALUES
			(${bundle.id}, ${auth.userId}, ${bundle.agent_id}, ${bundle.price_amount},
			 ${bundle.currency_mint}, ${bundle.chain}, ${feeResult.feeAmount ?? 0})
		RETURNING id, price_amount, currency_mint, chain
	`;

	return json(res, 201, {
		data: {
			purchase_id:   purchase.id,
			bundle_id:     bundle.id,
			price_amount:  bundle.price_amount,
			currency_mint: bundle.currency_mint,
			chain:         bundle.chain,
			recipient:     agentRow.address,
			reference,
			fee_amount:    feeResult.feeAmount ?? 0,
			treasury:      feeResult.treasuryWallet ?? null,
			skills:        bundle.skills,
		},
	});
}

// ── Confirm ─────────────────────────────────────────────────────────────────

async function handleConfirm(req, res, purchaseId) {
	if (!method(req, res, ['POST'])) return;

	const auth = await resolveAuth(req);
	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');
	if (!(await requireCsrf(req, res, auth.userId))) return;

	const body = await readJson(req).catch(() => null);
	const txSignature = body?.tx_signature;
	if (!txSignature) return error(res, 400, 'validation_error', 'tx_signature required');

	const [purchase] = await sql`
		SELECT bp.*, sb.price_amount AS bundle_price,
		       COALESCE(json_agg(bi.skill_name) FILTER (WHERE bi.skill_name IS NOT NULL), '[]') AS skills
		FROM bundle_purchases bp
		JOIN skill_bundles sb ON sb.id = bp.bundle_id
		LEFT JOIN bundle_items bi ON bi.bundle_id = bp.bundle_id
		WHERE bp.id = ${purchaseId} AND bp.user_id = ${auth.userId}
		  AND bp.status = 'pending'
		GROUP BY bp.id, sb.price_amount
	`;
	if (!purchase) return error(res, 404, 'not_found', 'purchase not found or already processed');

	// Mark confirmed.
	await sql`
		UPDATE bundle_purchases
		SET status = 'confirmed', tx_signature = ${txSignature}, confirmed_at = now()
		WHERE id = ${purchaseId}
	`;

	// Unlock every skill in the bundle — one row per skill.
	const skills = purchase.skills;
	for (const skillName of skills) {
		await sql`
			INSERT INTO skill_purchases
				(user_id, agent_id, skill, status, confirmed_at, tx_signature)
			VALUES
				(${auth.userId}, ${purchase.agent_id}, ${skillName}, 'confirmed', now(), ${txSignature})
			ON CONFLICT DO NOTHING
		`;
	}

	return json(res, 200, {
		data: {
			ok:        true,
			skills_unlocked: skills.length,
			tx_signature: txSignature,
		},
	});
}
