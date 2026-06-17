// Per-agent spend guardrails + custody ledger — the single policy that governs
// every outbound movement of a custodial agent wallet's funds.
//
// One policy, enforced everywhere:
//   - withdraw  (api/agents/solana-wallet.js handleWithdraw)
//   - x402 pay  (api/x402-pay.js)
//   - snipe     (workers/agent-sniper/executor.js)
//   - trade     (the authenticated agent-wallet trade endpoint — calls these)
//
// Limits are stored on the agent row at meta.spend_limits and are opt-in: an
// unset ceiling (null) means "no global cap" so existing automated flows keep
// their own per-feature caps until an owner tightens the policy. Once an owner
// sets a ceiling it is a HARD limit applied uniformly across all four paths.
//
//   daily_usd          rolling-24h total USD-equivalent outflow ceiling
//   per_tx_usd         max USD-equivalent for any single outbound tx
//   withdraw_allowlist if non-empty, withdraws may only target these addresses
//
// Spends are recorded into agent_custody_events (the audit trail + ledger). The
// daily ceiling is enforced by summing the last 24h of priced spend rows. SOL
// and USDC are always priceable; an arbitrary SPL withdraw that we can't price
// is governed by the allowlist (+ the per-user withdraw rate limit) rather than
// the USD cap — withdraw is an owner-initiated recovery path, not an autonomous
// spend, so we never block the owner from sweeping their own funds out.

import { PublicKey } from '@solana/web3.js';
import { sql } from './db.js';
import { solUsdPrice } from './avatar-wallet.js';
import { logAudit } from './audit.js';

// Base58 alphabet, 32–44 chars covers every ed25519 pubkey. A cheap pre-filter
// before the (heavier) PublicKey parse + curve check.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const MAX_ALLOWLIST = 50;

export const SPEND_LIMIT_DEFAULTS = Object.freeze({
	daily_usd: null,
	per_tx_usd: null,
	withdraw_allowlist: [],
});

/**
 * A spend-policy breach. Always a structured 4xx (never a 500) so the boundary
 * can surface the reason to the user verbatim. `.code` is machine-readable;
 * `.detail` carries the numbers behind the decision for the UI.
 */
export class SpendLimitError extends Error {
	constructor(code, message, detail = {}) {
		super(message);
		this.name = 'SpendLimitError';
		this.status = 403;
		this.code = code;
		this.detail = detail;
	}
}

/**
 * Validate a Solana destination address.
 * @returns {{ valid: boolean, reason?: string, base58?: string, pubkey?: PublicKey, onCurve?: boolean }}
 */
export function validateSolanaAddress(addr) {
	const s = typeof addr === 'string' ? addr.trim() : '';
	if (!s) return { valid: false, reason: 'empty' };
	if (!BASE58_RE.test(s)) return { valid: false, reason: 'not_base58' };
	let pubkey;
	try {
		pubkey = new PublicKey(s);
	} catch {
		return { valid: false, reason: 'not_pubkey' };
	}
	// Off-curve addresses are program-derived (PDAs) and usually cannot sign or
	// be swept again — sending custody funds there risks losing them. We surface
	// `onCurve` so the withdraw endpoint can refuse a PDA destination.
	let onCurve = false;
	try {
		onCurve = PublicKey.isOnCurve(pubkey.toBytes());
	} catch {
		onCurve = false;
	}
	return { valid: true, base58: pubkey.toBase58(), pubkey, onCurve };
}

function numOrNull(v) {
	if (v === null || v === undefined || v === '') return null;
	const n = Number(v);
	if (!Number.isFinite(n) || n < 0) return null;
	return n;
}

/** Coerce arbitrary input into a clean, bounded spend-limit object. */
export function normalizeSpendLimits(raw) {
	const r = raw && typeof raw === 'object' ? raw : {};
	const allow = (Array.isArray(r.withdraw_allowlist) ? r.withdraw_allowlist : [])
		.map((a) => (typeof a === 'string' ? a.trim() : ''))
		.map((a) => validateSolanaAddress(a))
		.filter((v) => v.valid)
		.map((v) => v.base58);
	// De-dupe while preserving order, cap the list so meta can't be bloated.
	const seen = new Set();
	const deduped = [];
	for (const a of allow) {
		if (!seen.has(a)) {
			seen.add(a);
			deduped.push(a);
		}
		if (deduped.length >= MAX_ALLOWLIST) break;
	}
	return {
		daily_usd: numOrNull(r.daily_usd),
		per_tx_usd: numOrNull(r.per_tx_usd),
		withdraw_allowlist: deduped,
		updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
	};
}

/** Read the effective spend limits off an agent's meta blob. */
export function getSpendLimits(meta) {
	return normalizeSpendLimits(meta?.spend_limits);
}

/**
 * Persist a spend-limit patch onto the agent (owner-only). Only the keys present
 * in `patch` are changed; the rest are preserved. Writes a custody audit event
 * and a platform audit-log row. Returns the new normalized limits.
 */
export async function setSpendLimits(agentId, userId, patch, { req = null } = {}) {
	const [row] = await sql`
		SELECT id, user_id, meta FROM agent_identities
		WHERE id = ${agentId} AND deleted_at IS NULL
	`;
	if (!row) throw Object.assign(new Error('agent not found'), { status: 404, code: 'not_found' });
	if (row.user_id !== userId) throw Object.assign(new Error('not your agent'), { status: 403, code: 'forbidden' });

	const prev = getSpendLimits(row.meta);
	const next = normalizeSpendLimits({
		daily_usd: 'daily_usd' in patch ? patch.daily_usd : prev.daily_usd,
		per_tx_usd: 'per_tx_usd' in patch ? patch.per_tx_usd : prev.per_tx_usd,
		withdraw_allowlist:
			'withdraw_allowlist' in patch ? patch.withdraw_allowlist : prev.withdraw_allowlist,
	});
	next.updated_at = new Date().toISOString();

	const meta = { ...(row.meta || {}), spend_limits: next };
	await sql`UPDATE agent_identities SET meta = ${JSON.stringify(meta)}::jsonb WHERE id = ${agentId}`;

	await recordCustodyEvent({
		agentId,
		userId,
		eventType: 'limit_change',
		reason: 'spend_limits_updated',
		meta: { prev, next },
	}).catch((e) => console.warn('[custody] limit_change record failed', e?.message));
	logAudit({ userId, action: 'custody.limit_change', resourceId: agentId, meta: { prev, next }, req });

	return next;
}

/** USD value of a lamports amount at the live SOL/USD price. Throws on price outage. */
export async function lamportsToUsd(lamports) {
	const price = await solUsdPrice();
	return (Number(lamports) / 1e9) * price;
}

/**
 * Sum the USD-equivalent of an agent's outbound spends over the trailing window.
 * Only priced rows (usd not null) count — see module header on unpriced SPL.
 */
export async function getDailySpendUsd(agentId, network = 'mainnet', windowHours = 24) {
	const [row] = await sql`
		SELECT COALESCE(SUM(usd), 0)::float8 AS usd
		FROM agent_custody_events
		WHERE agent_id = ${agentId}
		  AND network = ${network}
		  AND event_type = 'spend'
		  AND status IN ('ok', 'pending', 'confirmed')
		  AND usd IS NOT NULL
		  AND created_at > now() - (${windowHours} || ' hours')::interval
	`;
	return Number(row?.usd || 0);
}

/**
 * Enforce the per-agent spend policy for one outbound movement.
 *
 * @param {object} o
 * @param {string} o.agentId
 * @param {object} [o.meta]            agent meta (limits read from here if `limits` absent)
 * @param {object} [o.limits]          pre-resolved limits (skips the meta read)
 * @param {'trade'|'snipe'|'x402'|'withdraw'} o.category
 * @param {number|null} o.usdValue     USD-equivalent of this tx (null = unpriceable)
 * @param {string} [o.destination]     base58 recipient (required for allowlist on withdraw)
 * @param {string} [o.network]
 * @returns {Promise<{ ok: true, limits: object, dailySpentUsd: number|null }>}
 * @throws {SpendLimitError} on any breach (always 4xx)
 */
export async function enforceSpendLimit({
	agentId,
	meta,
	limits,
	category,
	usdValue,
	destination,
	network = 'mainnet',
}) {
	const lim = limits || getSpendLimits(meta);

	// 1. Withdraw allowlist — destination gate.
	if (category === 'withdraw' && lim.withdraw_allowlist.length > 0) {
		const dest = typeof destination === 'string' ? destination.trim() : '';
		if (!dest || !lim.withdraw_allowlist.includes(dest)) {
			throw new SpendLimitError(
				'destination_not_allowed',
				'That destination is not on this agent’s withdraw allowlist. Add it under Limits & Safety, or send to an allowed address.',
				{ destination: dest || null, allowlist_size: lim.withdraw_allowlist.length },
			);
		}
	}

	const hasUsd = typeof usdValue === 'number' && Number.isFinite(usdValue) && usdValue >= 0;

	// 2. Per-transaction ceiling.
	if (lim.per_tx_usd != null && hasUsd && usdValue > lim.per_tx_usd + 1e-9) {
		throw new SpendLimitError(
			'per_tx_exceeded',
			`This ${category} is $${usdValue.toFixed(2)}, over the per-transaction limit of $${lim.per_tx_usd.toFixed(2)}.`,
			{ usd: usdValue, per_tx_usd: lim.per_tx_usd },
		);
	}

	// 3. Rolling daily ceiling.
	let dailySpentUsd = null;
	if (lim.daily_usd != null && hasUsd) {
		dailySpentUsd = await getDailySpendUsd(agentId, network);
		if (dailySpentUsd + usdValue > lim.daily_usd + 1e-9) {
			throw new SpendLimitError(
				'daily_exceeded',
				`This ${category} would bring today’s spend to $${(dailySpentUsd + usdValue).toFixed(2)}, over the daily limit of $${lim.daily_usd.toFixed(2)}.`,
				{ usd: usdValue, spent_usd: dailySpentUsd, daily_usd: lim.daily_usd },
			);
		}
	}

	return { ok: true, limits: lim, dailySpentUsd };
}

const CUSTODY_COLUMNS = [
	'agent_id', 'user_id', 'event_type', 'category', 'network', 'asset',
	'amount_lamports', 'amount_raw', 'usd', 'destination', 'signature',
	'reason', 'status', 'idempotency_key', 'meta',
];

/**
 * Write a row into the custody audit trail / spend ledger.
 * Returns the new row id. Callers in fire-and-forget contexts should `.catch()`.
 */
export async function recordCustodyEvent(e) {
	const [row] = await sql`
		INSERT INTO agent_custody_events
			(agent_id, user_id, event_type, category, network, asset,
			 amount_lamports, amount_raw, usd, destination, signature,
			 reason, status, idempotency_key, meta)
		VALUES (
			${e.agentId},
			${e.userId ?? null},
			${e.eventType},
			${e.category ?? null},
			${e.network ?? 'mainnet'},
			${e.asset ?? null},
			${e.amountLamports != null ? String(e.amountLamports) : null},
			${e.amountRaw != null ? String(e.amountRaw) : null},
			${e.usd ?? null},
			${e.destination ?? null},
			${e.signature ?? null},
			${e.reason ?? null},
			${e.status ?? 'ok'},
			${e.idempotencyKey ?? null},
			${JSON.stringify(e.meta ?? {})}::jsonb
		)
		RETURNING id
	`;
	return row?.id ?? null;
}

/** Update a custody row by id (e.g. flip a pending withdraw to confirmed/failed). */
export async function updateCustodyEvent(id, patch) {
	await sql`
		UPDATE agent_custody_events
		SET status = COALESCE(${patch.status ?? null}, status),
		    signature = COALESCE(${patch.signature ?? null}, signature),
		    usd = COALESCE(${patch.usd ?? null}, usd),
		    amount_lamports = COALESCE(${patch.amountLamports != null ? String(patch.amountLamports) : null}, amount_lamports),
		    meta = CASE WHEN ${patch.meta ? JSON.stringify(patch.meta) : null}::jsonb IS NULL
		                THEN meta ELSE meta || ${patch.meta ? JSON.stringify(patch.meta) : '{}'}::jsonb END,
		    updated_at = now()
		WHERE id = ${id}
	`;
}

/** Convenience wrapper for the common case: record one outbound 'spend'. */
export async function recordSpend(e) {
	return recordCustodyEvent({ ...e, eventType: 'spend' });
}

/**
 * Read the agent's recent custody events for the owner-facing audit feed.
 * Cursor is the `id` of the last row seen (descending, so strictly-less-than).
 */
export async function listCustodyEvents(agentId, { limit = 50, beforeId = null, network = null } = {}) {
	const lim = Math.min(200, Math.max(1, Number(limit) || 50));
	const rows = await sql`
		SELECT id, event_type, category, network, asset, amount_lamports, amount_raw,
		       usd, destination, signature, reason, status, created_at, meta
		FROM agent_custody_events
		WHERE agent_id = ${agentId}
		  AND (${network}::text IS NULL OR network = ${network})
		  AND (${beforeId}::bigint IS NULL OR id < ${beforeId})
		ORDER BY id DESC
		LIMIT ${lim}
	`;
	return rows;
}
