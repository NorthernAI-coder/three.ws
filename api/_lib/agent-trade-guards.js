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

// Fee + rent headroom kept above a buy so it never fails for lack of lamports to
// pay the network fee / open the token ATA. The single source of truth for the
// SOL-headroom floor — both the sniper executor and the discretionary
// agent-wallet trade endpoint import this rather than redefining it.
export const SOL_FEE_HEADROOM_LAMPORTS = 3_000_000n; // ~0.003 SOL

export const SPEND_LIMIT_DEFAULTS = Object.freeze({
	daily_usd: null,
	per_tx_usd: null,
	withdraw_allowlist: [],
});

// Per-agent discretionary-trade policy (lamports-denominated), stored at
// agent_identities.meta.trade_limits. Distinct from meta.spend_limits (the
// cross-path USD ceiling): these are the SOL-budget + circuit-breaker knobs that
// govern the agent's own buys, mirroring the sniper's per-strategy caps so the
// discretionary path is held to the same standard. All opt-in — a null cap means
// "no lamports ceiling" and the trade is still governed by the USD spend policy
// and the wallet balance.
//
//   per_trade_sol         max SOL spent on any single buy (null = uncapped)
//   daily_budget_sol      rolling-24h SOL buy budget across trade + snipe (null = uncapped)
//   max_price_impact_pct  circuit breaker — reject a buy/sell over this impact
//   max_slippage_bps      ceiling on the client-supplied slippage
//   max_concurrent        max open discretionary positions (null = unlimited)
//   kill_switch           when true, every discretionary trade is rejected
export const TRADE_LIMIT_DEFAULTS = Object.freeze({
	per_trade_sol: null,
	daily_budget_sol: null,
	max_price_impact_pct: 15,
	max_slippage_bps: 1000,
	max_concurrent: null,
	kill_switch: false,
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

// ── discretionary trade limits ────────────────────────────────────────────────

function clampNum(v, def, { min = 0, max = Infinity, round = false } = {}) {
	const n = Number(v);
	if (!Number.isFinite(n) || n < min) return def;
	const c = Math.min(max, n);
	return round ? Math.round(c) : c;
}

/** Coerce arbitrary input into a clean, bounded trade-limit object. */
export function normalizeTradeLimits(raw) {
	const r = raw && typeof raw === 'object' ? raw : {};
	return {
		per_trade_sol: numOrNull(r.per_trade_sol),
		daily_budget_sol: numOrNull(r.daily_budget_sol),
		max_price_impact_pct: clampNum(r.max_price_impact_pct, TRADE_LIMIT_DEFAULTS.max_price_impact_pct, { max: 100 }),
		max_slippage_bps: clampNum(r.max_slippage_bps, TRADE_LIMIT_DEFAULTS.max_slippage_bps, { max: 10000, round: true }),
		max_concurrent: r.max_concurrent == null ? null : clampNum(r.max_concurrent, null, { min: 1, max: 10000, round: true }),
		kill_switch: r.kill_switch === true,
		updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
	};
}

/** Read the effective discretionary trade limits off an agent's meta blob. */
export function getTradeLimits(meta) {
	return normalizeTradeLimits(meta?.trade_limits);
}

/**
 * Persist a trade-limit patch onto the agent (owner-only). Only the keys present
 * in `patch` change; the rest are preserved. Writes a custody audit event and a
 * platform audit-log row. Returns the new normalized limits.
 */
export async function setTradeLimits(agentId, userId, patch, { req = null } = {}) {
	const [row] = await sql`
		SELECT id, user_id, meta FROM agent_identities
		WHERE id = ${agentId} AND deleted_at IS NULL
	`;
	if (!row) throw Object.assign(new Error('agent not found'), { status: 404, code: 'not_found' });
	if (row.user_id !== userId) throw Object.assign(new Error('not your agent'), { status: 403, code: 'forbidden' });

	const prev = getTradeLimits(row.meta);
	const p = patch && typeof patch === 'object' ? patch : {};
	const next = normalizeTradeLimits({
		per_trade_sol: 'per_trade_sol' in p ? p.per_trade_sol : prev.per_trade_sol,
		daily_budget_sol: 'daily_budget_sol' in p ? p.daily_budget_sol : prev.daily_budget_sol,
		max_price_impact_pct: 'max_price_impact_pct' in p ? p.max_price_impact_pct : prev.max_price_impact_pct,
		max_slippage_bps: 'max_slippage_bps' in p ? p.max_slippage_bps : prev.max_slippage_bps,
		max_concurrent: 'max_concurrent' in p ? p.max_concurrent : prev.max_concurrent,
		kill_switch: 'kill_switch' in p ? p.kill_switch : prev.kill_switch,
	});
	next.updated_at = new Date().toISOString();

	const meta = { ...(row.meta || {}), trade_limits: next };
	await sql`UPDATE agent_identities SET meta = ${JSON.stringify(meta)}::jsonb WHERE id = ${agentId}`;

	await recordCustodyEvent({
		agentId,
		userId,
		eventType: 'limit_change',
		reason: 'trade_limits_updated',
		meta: { prev, next },
	}).catch((e) => console.warn('[custody] trade limit_change record failed', e?.message));
	logAudit({ userId, action: 'custody.trade_limit_change', resourceId: agentId, meta: { prev, next }, req });

	return next;
}

// ── trade guard predicates ────────────────────────────────────────────────────
// Each returns null when the trade is allowed, or a structured
// { reason, detail } when blocked. These are the single source of truth for the
// "is this trade allowed" comparisons — the sniper executor and the discretionary
// agent-wallet trade endpoint both call them instead of inlining the math, so a
// cap or breaker can never drift between the two paths. Pure + synchronous: the
// caller fetches the live numbers (open count, daily spend, wallet balance,
// quote) and hands them in.

/** Discretionary trading paused for this agent. */
export function checkKillSwitch(killed) {
	return killed ? { reason: 'kill_switch', detail: {} } : null;
}

/** Open-position concurrency ceiling. Blocked when openCount >= maxConcurrent. */
export function checkConcurrency(openCount, maxConcurrent) {
	if (maxConcurrent == null) return null;
	if (Number(openCount) >= Number(maxConcurrent)) {
		return { reason: 'max_positions', detail: { open: Number(openCount), max: Number(maxConcurrent) } };
	}
	return null;
}

/** Per-trade spend cap (lamports). Blocked when amount > cap. */
export function checkPerTradeCap(amountLamports, capLamports) {
	if (capLamports == null) return null;
	const amt = BigInt(amountLamports);
	const cap = BigInt(capLamports);
	if (amt > cap) {
		return { reason: 'per_trade_cap', detail: { amount_lamports: amt.toString(), cap_lamports: cap.toString() } };
	}
	return null;
}

/** Rolling daily budget (lamports). Blocked when spent + amount > budget. */
export function checkDailyBudgetLamports(spentLamports, amountLamports, budgetLamports) {
	if (budgetLamports == null) return null;
	const spent = BigInt(spentLamports);
	const amt = BigInt(amountLamports);
	const budget = BigInt(budgetLamports);
	if (spent + amt > budget) {
		return {
			reason: 'daily_budget',
			detail: { spent_lamports: spent.toString(), amount_lamports: amt.toString(), budget_lamports: budget.toString() },
		};
	}
	return null;
}

/** Wallet must cover the spend plus a fee/rent headroom. Blocked when short. */
export function checkSolHeadroom(walletLamports, spendLamports, headroomLamports = SOL_FEE_HEADROOM_LAMPORTS) {
	const wallet = BigInt(walletLamports);
	const spend = BigInt(spendLamports);
	const head = BigInt(headroomLamports);
	if (wallet < spend + head) {
		return {
			reason: 'insufficient_sol',
			detail: { wallet_lamports: wallet.toString(), required_lamports: (spend + head).toString() },
		};
	}
	return null;
}

/** Price-impact circuit breaker. Blocked when impact > max. */
export function checkPriceImpact(priceImpactPct, maxPct) {
	if (maxPct == null) return null;
	if (Number(priceImpactPct) > Number(maxPct)) {
		return { reason: 'price_impact', detail: { impact_pct: Number(priceImpactPct), max_pct: Number(maxPct) } };
	}
	return null;
}

/** Lamports spent (buys) by an agent over the trailing window — the trade +
 *  snipe SOL outflow that backs the discretionary daily budget. One wallet, one
 *  budget: a buy from the sniper and a buy from the trade endpoint both count. */
export async function getDailySpendLamports(agentId, network = 'mainnet', windowHours = 24) {
	const [row] = await sql`
		SELECT COALESCE(SUM(amount_lamports), 0)::text AS lamports
		FROM agent_custody_events
		WHERE agent_id = ${agentId}
		  AND network = ${network}
		  AND event_type = 'spend'
		  AND status IN ('ok', 'pending', 'confirmed')
		  AND amount_lamports IS NOT NULL
		  AND created_at > now() - (${windowHours} || ' hours')::interval
	`;
	return BigInt(row?.lamports ?? '0');
}

const LAMPORTS_PER_SOL = 1_000_000_000n;

function lamportsToSolStr(lamports, dp = 4) {
	const n = Number(BigInt(lamports)) / 1e9;
	return n.toFixed(dp).replace(/\.?0+$/, '') || '0';
}

// Map a guard-predicate reason → an HTTP status + a plain-language, actionable
// message for the boundary. A guard rejection is always a 4xx with the reason and
// the numbers behind it — never a 500, never an exception that escapes.
const GUARD_RESPONSE = {
	kill_switch: {
		status: 403,
		message: () => 'Trading is paused for this agent. Re-enable discretionary trading under Limits & Safety to continue.',
	},
	per_trade_cap: {
		status: 422,
		message: (d) => `This trade of ${lamportsToSolStr(d.amount_lamports)} SOL is over the per-trade cap of ${lamportsToSolStr(d.cap_lamports)} SOL. Lower the amount or raise the cap under Limits & Safety.`,
	},
	daily_budget: {
		status: 422,
		message: (d) => `This trade would bring today's spend to ${lamportsToSolStr(BigInt(d.spent_lamports) + BigInt(d.amount_lamports))} SOL, over the daily budget of ${lamportsToSolStr(d.budget_lamports)} SOL. Wait for the window to roll over or raise the budget.`,
	},
	max_positions: {
		status: 409,
		message: (d) => `This agent already holds ${d.open} open ${d.open === 1 ? 'trade' : 'trades'} (max ${d.max}). Close one before opening another.`,
	},
	insufficient_sol: {
		status: 400,
		message: (d) => `The agent wallet needs about ${lamportsToSolStr(d.required_lamports)} SOL (including network fees) but holds ${lamportsToSolStr(d.wallet_lamports)}. Fund the wallet and retry.`,
	},
	price_impact: {
		status: 422,
		message: (d) => `Price impact is ${Number(d.impact_pct).toFixed(2)}% — above the ${Number(d.max_pct).toFixed(2)}% safety breaker. Lower the trade size or raise the impact limit under Limits & Safety.`,
	},
};

/**
 * Turn a guard-predicate result into a boundary-ready 4xx response shape.
 * @param {{ reason: string, detail?: object }} blocked
 * @returns {{ status: number, code: string, message: string, detail: object }}
 */
export function tradeGuardResponse(blocked) {
	const entry = GUARD_RESPONSE[blocked.reason] || { status: 422, message: () => `Trade rejected: ${blocked.reason}` };
	return {
		status: entry.status,
		code: blocked.reason,
		message: entry.message(blocked.detail || {}),
		detail: blocked.detail || {},
	};
}

export { LAMPORTS_PER_SOL };

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
