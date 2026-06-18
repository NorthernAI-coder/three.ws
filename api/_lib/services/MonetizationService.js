// MonetizationService — one place for skill-monetization business logic.
//
// Before this, the rules for "what does a skill cost", "who may change a
// price", "build a purchase", "confirm a payment", "does this user own a
// skill", and "what has a creator earned" were spread across half a dozen API
// handlers, each re-deriving ownership checks, fee splits, and payout lookups.
// This class is the single seam those handlers call through, so the policy
// lives in one tested unit and the handlers shrink to HTTP plumbing
// (auth → validate → call service → map result/error to a response).
//
// It does not reinvent the lower-level primitives — payout resolution, on-chain
// confirmation, access checks, fee math, and balance accounting already have
// dedicated, tested modules. The service orchestrates them and owns the
// handler-shaped business rules (ownership gating, idempotent purchase create,
// already-owned short-circuit) that previously lived inline.
//
// Errors are thrown with `status` (HTTP code) and `code` (machine string) so a
// handler can map them with `error(res, e.status, e.code, e.message)` without
// knowing the internals.

import { Keypair } from '@solana/web3.js';

import { sql as defaultSql } from '../db.js';
import { hasSkillAccess } from '../skill-access.js';
import { getAvailableBalance } from '../monetization.js';
import { resolveMarketplaceFee } from '../marketplace-platform-fee.js';
import { invalidateSkillPriceCache } from '../skill-price-cache.js';
import {
	confirmSkillPurchase,
	resolvePayoutAddress,
	logEvent,
} from '../purchase-confirm.js';

// Build an Error that carries the HTTP status + machine code a handler maps from.
function svcError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

export class MonetizationService {
	/**
	 * @param {object|string|null} user - a session user ({ id }), an auth object
	 *   ({ userId }), a raw user-id string, or null for anonymous callers.
	 * @param {object} [deps] - injectable dependencies (mainly for tests).
	 * @param {object} [deps.sql] - tagged-template SQL client; defaults to the
	 *   shared Neon client.
	 */
	constructor(user, deps = {}) {
		this.user = user ?? null;
		this.userId =
			typeof user === 'string' ? user : user?.id ?? user?.userId ?? null;
		this.sql = deps.sql || defaultSql;
	}

	requireAuth() {
		if (!this.userId) throw svcError(401, 'unauthorized', 'sign in required');
		return this.userId;
	}

	/**
	 * Load an agent and assert the current user owns it.
	 * @returns {Promise<{id: string, user_id: string}>}
	 * @throws 401 if anonymous, 404 if missing, 403 if not the owner.
	 */
	async assertOwnership(agentId) {
		this.requireAuth();
		const [agent] = await this.sql`
			SELECT id, user_id FROM agent_identities
			WHERE id = ${agentId} AND deleted_at IS NULL
		`;
		if (!agent) throw svcError(404, 'not_found', 'agent not found');
		if (agent.user_id !== this.userId) {
			throw svcError(403, 'forbidden', 'not your agent');
		}
		return agent;
	}

	/**
	 * Active per-skill prices for an agent. Pure read — callers decide whether the
	 * surface is public (marketplace) or owner-gated (dashboard).
	 */
	async getSkillPricesForAgent(agentId) {
		return this.sql`
			SELECT skill, amount, currency_mint, chain, mint_decimals,
			       trial_uses, time_pass_hours, time_pass_amount
			FROM agent_skill_prices
			WHERE agent_id = ${agentId} AND is_active = true
			ORDER BY skill
		`;
	}

	/**
	 * Atomically replace the agent's active price set with the submitted prices.
	 * Deactivates everything currently active, then upserts the submitted rows in
	 * one transaction. Input is expected to be already validated by the caller.
	 *
	 * @param {string} agentId
	 * @param {Array<{skill,amount,currency_mint,chain,trial_uses?,time_pass_hours?,time_pass_amount?}>} prices
	 * @param {object} [opts]
	 * @param {boolean} [opts.skipOwnershipCheck] - set when the caller already
	 *   verified ownership (avoids a redundant lookup).
	 */
	async setSkillPrices(agentId, prices, { skipOwnershipCheck = false } = {}) {
		if (!skipOwnershipCheck) await this.assertOwnership(agentId);

		// Neon's serverless driver runs a transaction as an ARRAY of queries in a
		// single round-trip. Every statement is known up front, so we build the
		// array and pass it. Atomic: the deactivate + all upserts commit together
		// or not at all.
		const statements = [
			this.sql`UPDATE agent_skill_prices SET is_active = false WHERE agent_id = ${agentId}`,
			...prices.map(
				(p) => this.sql`
					INSERT INTO agent_skill_prices
						(agent_id, skill, amount, currency_mint, chain, is_active, trial_uses, time_pass_hours, time_pass_amount)
					VALUES
						(${agentId}, ${p.skill}, ${p.amount}, ${p.currency_mint}, ${p.chain}, true,
						 ${p.trial_uses ?? 0}, ${p.time_pass_hours ?? null}, ${p.time_pass_amount ?? null})
					ON CONFLICT (agent_id, skill) DO UPDATE SET
						amount = EXCLUDED.amount,
						currency_mint = EXCLUDED.currency_mint,
						chain = EXCLUDED.chain,
						is_active = true,
						trial_uses = EXCLUDED.trial_uses,
						time_pass_hours = EXCLUDED.time_pass_hours,
						time_pass_amount = EXCLUDED.time_pass_amount,
						updated_at = now()
				`,
			),
		];

		await this.sql.transaction(statements);
		await invalidateSkillPriceCache(agentId);
		return { ok: true, count: prices.length };
	}

	/**
	 * Prepare a Solana-Pay skill purchase for the current user. Resolves the
	 * price + payout wallet, computes the platform-fee split, short-circuits if
	 * the user already has active access, reuses a still-valid pending row
	 * (idempotent), and otherwise records a new pending purchase.
	 *
	 * Returns the payment quote the client signs against (reference, recipient,
	 * amounts, fee leg, time-pass window). Despite the name it returns Solana-Pay
	 * parameters rather than a serialized transaction — the wallet builds the tx
	 * from these; the serialized-tx variant lives in payments/prepare-skill-purchase.
	 *
	 * Gifting: pass `recipientUserId` to buy the skill for someone else. The
	 * payer stays in `user_id` (they sign + confirm the payment); the recipient
	 * is recorded in `recipient_user_id` and is the one who receives access. The
	 * already-owned check and the access grant both key off the beneficiary
	 * (`COALESCE(recipient_user_id, user_id)`), so a buyer may gift the same skill
	 * to many distinct recipients without colliding with their own copy.
	 *
	 * @param {string} agentId
	 * @param {string} skillName
	 * @param {object} [opts]
	 * @param {number|null} [opts.durationHours] - explicit time-pass length.
	 * @param {string|null} [opts.referrerUserId] - resolved referrer (handler reads the request).
	 * @param {string|null} [opts.recipientUserId] - gift beneficiary (resolved by the handler).
	 */
	async preparePurchaseTransaction(agentId, skillName, { durationHours = null, referrerUserId = null, recipientUserId = null } = {}) {
		this.requireAuth();

		const isGift = !!recipientUserId && recipientUserId !== this.userId;
		if (recipientUserId && recipientUserId === this.userId) {
			throw svcError(400, 'cannot_gift_self', 'you already own purchases you make for yourself');
		}
		const beneficiaryId = isGift ? recipientUserId : this.userId;

		const [price] = await this.sql`
			SELECT amount, currency_mint, chain, mint_decimals, trial_uses, time_pass_hours, time_pass_amount
			FROM agent_skill_prices
			WHERE agent_id = ${agentId} AND skill = ${skillName} AND is_active = true
		`;
		if (!price) throw svcError(404, 'not_found', 'this skill is not for sale');

		const payoutAddress = await resolvePayoutAddress(agentId, price.chain);
		if (!payoutAddress) {
			throw svcError(412, 'creator_wallet_missing', 'agent owner has not configured a payout wallet');
		}

		// Already-owned short-circuit: any active access (confirmed purchase, live
		// trial, unexpired time-pass) the BENEFICIARY already holds returns early so
		// nobody pays twice. For a gift this means "the recipient already owns it" —
		// the buyer is told without their own ownership leaking into the answer.
		const [existing] = await this.sql`
			SELECT reference, status, tx_signature, confirmed_at, valid_until, trial_remaining, kind
			FROM skill_purchases
			WHERE COALESCE(recipient_user_id, user_id) = ${beneficiaryId}
			  AND agent_id = ${agentId} AND skill = ${skillName}
			  AND status IN ('confirmed', 'trial')
			  AND (valid_until IS NULL OR valid_until > now())
			ORDER BY (status = 'confirmed') DESC, confirmed_at DESC NULLS LAST
			LIMIT 1
		`;
		if (existing) {
			if (isGift) {
				// Don't surface the recipient's own purchase reference / tx to the buyer.
				return { already_owned: true, recipient_owns: true };
			}
			return {
				already_owned: true,
				reference: existing.reference,
				status: existing.status,
				tx_signature: existing.tx_signature,
				confirmed_at: existing.confirmed_at,
				valid_until: existing.valid_until,
				trial_remaining: existing.trial_remaining,
				kind: existing.kind,
			};
		}

		// Idempotent create: reuse a fresh pending row for the same (buyer, agent,
		// skill, recipient) rather than minting a new reference on every retry click.
		// `IS NOT DISTINCT FROM` matches a NULL recipient (self-purchase) too, and
		// keeps gifts to different recipients on their own pending rows.
		const [pending] = await this.sql`
			SELECT reference, amount, currency_mint, chain, expires_at,
			       platform_fee_amount, platform_fee_wallet
			FROM skill_purchases
			WHERE user_id = ${this.userId} AND agent_id = ${agentId} AND skill = ${skillName}
			  AND recipient_user_id IS NOT DISTINCT FROM ${recipientUserId}
			  AND status = 'pending'
			  AND expires_at > now()
			ORDER BY created_at DESC
			LIMIT 1
		`;

		// Time-pass: prefer an explicit duration, else the skill's configured window.
		const effectiveDurationHours = durationHours ?? (price.time_pass_hours || null);
		const isTimePass = effectiveDurationHours != null;
		const purchaseAmount = isTimePass && price.time_pass_amount ? price.time_pass_amount : price.amount;
		const purchaseKind = isTimePass ? 'time_pass' : 'purchase';

		// Platform fee (Solana only — the split is one atomic SPL transfer the buyer
		// signs). Computed once at create and persisted on the row so confirm
		// verifies the exact split quoted, even if fee config changes meanwhile.
		const feeInfo = price.chain === 'solana'
			? await resolveMarketplaceFee({ grossAtomics: BigInt(purchaseAmount) })
			: null;
		const platformFeeAmount = feeInfo ? feeInfo.feeAtomics : 0n;
		const platformFeeWallet = feeInfo ? feeInfo.recipient.toBase58() : null;

		const reference = pending?.reference ?? Keypair.generate().publicKey.toBase58();
		const label = isTimePass
			? `${effectiveDurationHours}h Access: ${skillName.slice(0, 30)}`
			: `Skill: ${skillName.slice(0, 40)}`;
		const message = isTimePass
			? `Get ${effectiveDurationHours}-hour access to '${skillName}'`
			: `Unlock '${skillName}' for this agent`;

		let row = pending;
		if (!pending) {
			const validUntil = isTimePass
				? this.sql`now() + (${effectiveDurationHours} || ' hours')::interval`
				: this.sql`null`;

			const [inserted] = await this.sql`
				INSERT INTO skill_purchases (
					user_id, agent_id, skill, status, reference,
					amount, currency_mint, chain, expires_at, kind, referrer_user_id, valid_until,
					platform_fee_amount, platform_fee_wallet, recipient_user_id
				)
				VALUES (
					${this.userId}, ${agentId}, ${skillName}, 'pending', ${reference},
					${purchaseAmount}, ${price.currency_mint}, ${price.chain},
					now() + interval '30 minutes', ${purchaseKind}, ${referrerUserId}, ${validUntil},
					${platformFeeAmount.toString()}, ${platformFeeWallet}, ${recipientUserId}
				)
				RETURNING reference, amount, currency_mint, chain, expires_at, valid_until,
				          platform_fee_amount, platform_fee_wallet
			`;
			row = inserted;
			await logEvent(row.reference, 'created', { agent_id: agentId, skill: skillName, kind: purchaseKind, gift: isGift });
		} else {
			await logEvent(pending.reference, 'create_idempotent_hit', { agent_id: agentId, skill: skillName });
		}

		// The split the buyer signs, derived from the PERSISTED row so the quote
		// matches exactly what confirm verifies on-chain. `amount` is the full
		// price; `creator_amount` is the seller's leg; `fee` is the treasury leg
		// (omitted entirely when no fee applies).
		const rowFee = BigInt(row.platform_fee_amount || 0);
		const creatorAmount = (BigInt(row.amount) - rowFee).toString();
		const feeBlock = rowFee > 0n && row.platform_fee_wallet
			? {
					fee: {
						recipient: row.platform_fee_wallet,
						amount: rowFee.toString(),
						bps: Number((rowFee * 10000n) / BigInt(row.amount)),
					},
				}
			: {};

		return {
			already_owned: false,
			reference: row.reference,
			recipient: payoutAddress,
			amount: String(row.amount),
			creator_amount: creatorAmount,
			currency_mint: row.currency_mint,
			chain: row.chain,
			mint_decimals: price.mint_decimals,
			expires_at: row.expires_at,
			valid_until: row.valid_until,
			kind: purchaseKind,
			label,
			message,
			...feeBlock,
			...(isGift ? { is_gift: true, gift_recipient_id: recipientUserId } : {}),
			...(isTimePass ? { duration_hours: effectiveDurationHours } : {}),
			...(price.time_pass_hours
				? { time_pass_hours: price.time_pass_hours, time_pass_amount: price.time_pass_amount }
				: {}),
		};
	}

	/**
	 * Confirm a pending purchase the current user owns, identified by its
	 * Solana-Pay reference. Solana scans the chain by reference; EVM settles by a
	 * tx hash the buyer submits.
	 *
	 * @param {string} reference
	 * @param {object} [opts]
	 * @param {string|null} [opts.txHash] - settlement tx hash (required for EVM).
	 * @returns {Promise<{status:'pending'|'confirmed'|'tipped'|'mismatch', tx_signature?:string, tipped_amount?:string, message?:string}>}
	 * @throws 404 if not found, 410 if expired, 400 if an EVM confirm omits tx_hash.
	 */
	async confirmPurchase(reference, { txHash = null } = {}) {
		this.requireAuth();

		const [pur] = await this.sql`
			SELECT sp.id, sp.user_id, sp.agent_id, sp.skill, sp.status,
			       sp.amount, sp.currency_mint, sp.chain, sp.tx_signature,
			       sp.expires_at, sp.referrer_user_id, sp.recipient_user_id,
			       sp.platform_fee_amount, sp.platform_fee_wallet,
			       COALESCE(asp.mint_decimals, 6) AS mint_decimals
			FROM skill_purchases sp
			LEFT JOIN agent_skill_prices asp
			       ON asp.agent_id = sp.agent_id AND asp.skill = sp.skill
			WHERE sp.reference = ${reference} AND sp.user_id = ${this.userId}
		`;
		if (!pur) throw svcError(404, 'not_found', 'purchase not found');
		if (pur.status === 'confirmed') {
			return { status: 'confirmed', tx_signature: pur.tx_signature };
		}
		if (pur.status === 'expired' || (pur.expires_at && new Date(pur.expires_at) < new Date())) {
			throw svcError(410, 'purchase_expired', 'this pending purchase expired; please start a new one');
		}
		if (pur.chain !== 'solana' && !txHash) {
			throw svcError(400, 'tx_hash_required', 'tx_hash is required to confirm an EVM purchase');
		}

		return confirmSkillPurchase({ ...pur, reference }, { txHash });
	}

	/**
	 * Does the current user have access to a paid skill on an agent? Delegates to
	 * the canonical access check, so trials, time-passes, and agent-level
	 * subscriptions all count — not just confirmed one-off purchases.
	 *
	 * @returns {{has_access:boolean, paid:boolean, owned:boolean, reason?:string,
	 *   trial?:boolean, trial_remaining?:number, via_subscription?:boolean, price?:object}}
	 */
	async checkSkillOwnership(agentId, skillName) {
		const access = await hasSkillAccess(this.userId, agentId, skillName);
		return { has_access: !!access.owned, ...access };
	}

	/**
	 * Creator sales overview for the current user: per-sale ledger entries (skill
	 * royalties + asset sales) plus pending/settled USD totals.
	 *
	 * @returns {Promise<{pending_usd:number, settled_usd:number, entries:Array}>}
	 */
	async getCreatorSalesData() {
		const userId = this.requireAuth();

		const rows = await this.sql`
			SELECT
				rl.id,
				rl.price_usd,
				rl.status,
				rl.created_at,
				ms.name  AS skill_name,
				ai.name  AS agent_name
			FROM royalty_ledger rl
			JOIN marketplace_skills ms ON ms.id = rl.skill_id
			JOIN agent_identities   ai ON ai.id = rl.agent_id
			WHERE rl.author_user_id = ${userId}
			ORDER BY rl.created_at DESC
			LIMIT 100
		`;

		// Asset sales (avatars / agents / plugins). asset_purchases stores amount
		// in atomic USDC units (6 decimals) — divide for USD reporting.
		let assetRows = [];
		try {
			assetRows = await this.sql`
				SELECT
					ap.id,
					ap.item_type,
					ap.item_id,
					ap.amount,
					ap.currency_mint,
					ap.confirmed_at,
					ap.created_at,
					ap.status,
					CASE ap.item_type
						WHEN 'avatar' THEN (SELECT name FROM avatars WHERE id = ap.item_id)
						WHEN 'agent'  THEN (SELECT name FROM agent_identities WHERE id = ap.item_id)
						ELSE NULL
					END AS item_name
				FROM asset_purchases ap
				WHERE ap.seller_user_id = ${userId}
				  AND ap.status = 'confirmed'
				ORDER BY ap.confirmed_at DESC NULLS LAST
				LIMIT 100
			`;
		} catch {
			// asset_purchases migration hasn't run yet — leave list empty.
		}

		const pending_usd = rows
			.filter((r) => r.status === 'pending')
			.reduce((s, r) => s + Number(r.price_usd), 0);

		const settled_usd = rows
			.filter((r) => r.status === 'settled')
			.reduce((s, r) => s + Number(r.price_usd), 0);

		const asset_settled_usd = assetRows.reduce((s, r) => s + Number(r.amount) / 1_000_000, 0);

		const entries = rows.map((r) => ({
			skill_name: r.skill_name,
			agent_name: r.agent_name,
			price_usd: Number(r.price_usd),
			status: r.status,
			created_at: r.created_at,
			kind: 'skill',
		}));
		for (const r of assetRows) {
			entries.push({
				skill_name: `${r.item_type[0].toUpperCase()}${r.item_type.slice(1)} sale`,
				agent_name: r.item_name || '(deleted)',
				price_usd: Number(r.amount) / 1_000_000,
				status: 'settled',
				created_at: r.confirmed_at || r.created_at,
				kind: r.item_type,
			});
		}
		entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

		return {
			pending_usd,
			settled_usd: settled_usd + asset_settled_usd,
			entries,
		};
	}

	/**
	 * Withdrawable balance for the current user across (or filtered to) a
	 * currency. Thin pass-through to the accounting helper so handlers reach
	 * balance state through the same service seam as everything else.
	 */
	async getAvailableBalance(currencyMint = null) {
		const userId = this.requireAuth();
		return getAvailableBalance(userId, currencyMint);
	}
}

export default MonetizationService;
