// The Agent Labor Market (Moonshot 01) — data layer + pure economics.
//
// This module is the single place that reads/writes the bounty → bid → job
// ledger (agent_bounties / agent_bids / agent_jobs / agent_labor_policies) and
// the ONLY home for the market's pure math: the transparent award score and the
// exact-integer settlement split. Money never moves here — the endpoints
// (api/labor/*) reserve spend, hold escrow on-chain, and release it. This module
// records the business-level lifecycle so every stat the UI shows is a real
// aggregate over real bounties, and so the autonomy engine and tests can reuse
// one source of truth for scoring and splitting.

import { sql } from './db.js';
import { TOKEN_MINT, ATOMICS_PER_TOKEN } from './token/config.js';

// ── Pure economics (unit-tested; no DB) ─────────────────────────────────────

// Transparent award-score weights. Published in the API so posters can see why a
// bid won. Lower price (deeper discount vs the escrowed reward), faster ETA, and
// higher worker reputation all raise the score.
export const SCORE_WEIGHTS = Object.freeze({ price: 0.45, eta: 0.2, reputation: 0.35 });
// ETA at which the speed term is worth half its max — one hour. A same-second
// promise scores ~1, a one-hour promise ~0.5, a one-day promise ~0.04.
export const ETA_HALF_LIFE_S = 3600;

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const round4 = (n) => Math.round(n * 1e4) / 1e4;

function toBig(v) {
	if (typeof v === 'bigint') return v;
	if (v == null) return 0n;
	// numeric(40,0) arrives as a string; never parse atomics through Number().
	return BigInt(String(v).split('.')[0]);
}

/**
 * Transparent award score in [0,1]. Deterministic and explainable — the same
 * formula the autonomy engine uses to auto-award and the UI renders next to each
 * bid. A bid priced at or above the full reward earns no price credit; a free,
 * instant bid from a perfect-reputation worker approaches 1.
 *
 * @param {{ priceAtomics: bigint|string|number, rewardAtomics: bigint|string|number,
 *   etaSeconds?: number|null, reputation?: number }} bid
 */
export function scoreBid({ priceAtomics, rewardAtomics, etaSeconds, reputation = 0.5 }) {
	const reward = toBig(rewardAtomics);
	const price = toBig(priceAtomics);
	if (reward <= 0n) return 0;
	// Price term: how deep the discount is vs the escrowed reward.
	const ratio = Number(price) / Number(reward);
	const priceScore = clamp01(1 - ratio);
	// ETA term: a smooth decay so faster always beats slower without a cliff.
	const eta = Number.isFinite(etaSeconds) && etaSeconds > 0 ? etaSeconds : ETA_HALF_LIFE_S;
	const etaScore = ETA_HALF_LIFE_S / (ETA_HALF_LIFE_S + eta);
	const repScore = clamp01(Number(reputation) || 0);
	const score =
		SCORE_WEIGHTS.price * priceScore +
		SCORE_WEIGHTS.eta * etaScore +
		SCORE_WEIGHTS.reputation * repScore;
	return round4(score);
}

/** Reputation in [0,1] from an agent's settled/failed job counts. New agents get
 *  a neutral 0.5 prior so they can still win on price + speed (no cold-start lockout). */
export function reputationFromStats({ settled = 0, failed = 0 } = {}) {
	const done = Number(settled) + Number(failed);
	const successRate = done > 0 ? Number(settled) / done : 0.5;
	const volume = Math.min(1, Number(settled) / 10); // saturates at 10 settled jobs
	return round4(0.7 * successRate + 0.3 * volume);
}

/** Default skill royalty (bps of the awarded amount) routed to the skill author. */
export function defaultRoyaltyBps() {
	const raw = Number(process.env.LABOR_SKILL_ROYALTY_BPS);
	if (Number.isFinite(raw) && raw >= 0 && raw <= 5000) return Math.round(raw);
	return 1000; // 10%
}

/**
 * Exact-integer settlement split. The worker is paid its awarded bid; the skill
 * author takes a royalty out of that; any difference between the escrowed reward
 * and the (lower) awarded bid refunds to the poster. The three legs always sum to
 * exactly the escrowed reward — no $THREE dust is created or lost.
 *
 * @returns {{ workerAtomics: bigint, royaltyAtomics: bigint, posterRefundAtomics: bigint }}
 */
export function settlementSplit({ rewardAtomics, awardedAtomics, royaltyBps = defaultRoyaltyBps(), hasAuthor = false }) {
	const reward = toBig(rewardAtomics);
	let awarded = toBig(awardedAtomics);
	if (awarded > reward) awarded = reward; // never pay out more than is escrowed
	if (awarded < 0n) awarded = 0n;
	const bps = BigInt(Math.max(0, Math.min(5000, Math.round(royaltyBps))));
	const royalty = hasAuthor ? (awarded * bps) / 10_000n : 0n;
	const worker = awarded - royalty;
	const posterRefund = reward - awarded;
	return { workerAtomics: worker, royaltyAtomics: royalty, posterRefundAtomics: posterRefund };
}

export function atomicsToThree(atomics) {
	return Number(toBig(atomics)) / Number(ATOMICS_PER_TOKEN);
}
export function threeToAtomics(three) {
	const n = Number(three);
	if (!Number.isFinite(n) || n < 0) return 0n;
	return BigInt(Math.round(n * Number(ATOMICS_PER_TOKEN)));
}

// ── Lazy schema (self-heals if the formal migration hasn't run) ─────────────

let _ensured = null;
export async function ensureLaborTables() {
	if (_ensured) return _ensured;
	_ensured = (async () => {
		await sql`
			create table if not exists agent_bounties (
				id uuid primary key default gen_random_uuid(),
				poster_agent_id uuid not null, poster_user_id uuid not null,
				title text not null, spec text not null, required_skill text,
				reward_atomics numeric(40,0) not null, reward_mint text not null,
				status text not null default 'open', deadline timestamptz,
				escrow_address text, escrow_fund_sig text, refund_sig text,
				awarded_bid_id uuid, awarded_agent_id uuid, awarded_at timestamptz, award_rationale text,
				auto boolean not null default false, meta jsonb not null default '{}',
				created_at timestamptz not null default now(), updated_at timestamptz not null default now()
			)`;
		await sql`create index if not exists agent_bounties_feed on agent_bounties (status, created_at desc)`;
		await sql`create index if not exists agent_bounties_skill_open on agent_bounties (required_skill) where status = 'open'`;
		await sql`create index if not exists agent_bounties_poster on agent_bounties (poster_agent_id, created_at desc)`;
		await sql`
			create table if not exists agent_bids (
				id uuid primary key default gen_random_uuid(),
				bounty_id uuid not null, worker_agent_id uuid not null, worker_user_id uuid not null,
				price_atomics numeric(40,0) not null, eta_seconds integer, pitch text,
				score double precision, rationale text, reputation double precision,
				auto boolean not null default false, status text not null default 'pending',
				created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
				constraint agent_bids_unique_worker unique (bounty_id, worker_agent_id)
			)`;
		await sql`create index if not exists agent_bids_bounty on agent_bids (bounty_id, created_at desc)`;
		await sql`create index if not exists agent_bids_worker on agent_bids (worker_agent_id, created_at desc)`;
		await sql`
			create table if not exists agent_jobs (
				id uuid primary key default gen_random_uuid(),
				bounty_id uuid not null, bid_id uuid not null,
				worker_agent_id uuid not null, worker_user_id uuid not null, poster_agent_id uuid not null,
				required_skill text, price_atomics numeric(40,0) not null,
				status text not null default 'working', deliverable jsonb, delivered_at timestamptz,
				verdict jsonb, verified_at timestamptz,
				invocation_sig text, settlement_sig text, royalty_sig text,
				royalty_atomics numeric(40,0), worker_payout_atomics numeric(40,0), royalty_author_id uuid,
				settle_key text, settled_at timestamptz, refund_sig text, failure_reason text,
				meta jsonb not null default '{}',
				created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
				constraint agent_jobs_bounty_unique unique (bounty_id)
			)`;
		await sql`create index if not exists agent_jobs_worker on agent_jobs (worker_agent_id, status)`;
		await sql`create index if not exists agent_jobs_poster on agent_jobs (poster_agent_id, created_at desc)`;
		await sql`create unique index if not exists agent_jobs_settle_key on agent_jobs (settle_key) where settle_key is not null`;
		await sql`create index if not exists agent_jobs_settled_at on agent_jobs (settled_at desc) where status = 'settled'`;
		await sql`
			create table if not exists agent_labor_policies (
				agent_id uuid primary key, user_id uuid not null,
				worker_enabled boolean not null default false, skills text[] not null default '{}',
				max_bid_atomics numeric(40,0), min_reward_atomics numeric(40,0),
				poster_enabled boolean not null default false, auto_award boolean not null default false,
				min_bids integer not null default 1,
				meta jsonb not null default '{}',
				created_at timestamptz not null default now(), updated_at timestamptz not null default now()
			)`;
		await sql`create index if not exists agent_labor_policies_worker on agent_labor_policies (worker_enabled) where worker_enabled = true`;
		return true;
	})().catch((err) => {
		console.error('[agent-labor] ensureLaborTables failed:', err?.message);
		_ensured = null;
		return false;
	});
	return _ensured;
}

// ── Bounty writes/reads ─────────────────────────────────────────────────────

export async function createBounty(input) {
	await ensureLaborTables();
	const {
		posterAgentId, posterUserId, title, spec, requiredSkill = null,
		rewardAtomics, deadline = null, auto = false, meta = {},
	} = input;
	const [row] = await sql`
		INSERT INTO agent_bounties
			(poster_agent_id, poster_user_id, title, spec, required_skill,
			 reward_atomics, reward_mint, status, deadline, auto, meta)
		VALUES (${posterAgentId}, ${posterUserId}, ${title}, ${spec}, ${requiredSkill},
			${String(toBig(rewardAtomics))}, ${TOKEN_MINT}, 'open',
			${deadline}, ${!!auto}, ${JSON.stringify(meta || {})}::jsonb)
		RETURNING *`;
	return row;
}

export async function getBounty(id) {
	const [row] = await sql`SELECT * FROM agent_bounties WHERE id = ${id} LIMIT 1`;
	return row || null;
}

export async function setBountyEscrow(id, { escrowAddress, escrowFundSig }) {
	const [row] = await sql`
		UPDATE agent_bounties
		SET escrow_address = ${escrowAddress}, escrow_fund_sig = ${escrowFundSig}, updated_at = now()
		WHERE id = ${id} RETURNING *`;
	return row || null;
}

export async function setBountyStatus(id, status, patch = {}) {
	const [row] = await sql`
		UPDATE agent_bounties
		SET status = ${status},
		    awarded_bid_id = COALESCE(${patch.awardedBidId ?? null}, awarded_bid_id),
		    awarded_agent_id = COALESCE(${patch.awardedAgentId ?? null}, awarded_agent_id),
		    awarded_at = COALESCE(${patch.awardedAt ?? null}::timestamptz, awarded_at),
		    award_rationale = COALESCE(${patch.awardRationale ?? null}, award_rationale),
		    refund_sig = COALESCE(${patch.refundSig ?? null}, refund_sig),
		    updated_at = now()
		WHERE id = ${id} RETURNING *`;
	return row || null;
}

export async function listOpenBounties({ limit = 50, requiredSkill = null, minRewardAtomics = null } = {}) {
	await ensureLaborTables();
	const lim = Math.min(200, Math.max(1, Number(limit) || 50));
	const skillFilter = requiredSkill ? sql`AND b.required_skill = ${requiredSkill}` : sql``;
	const rewardFilter = minRewardAtomics
		? sql`AND b.reward_atomics >= ${String(toBig(minRewardAtomics))}`
		: sql``;
	const rows = await sql`
		SELECT b.*, pa.name AS poster_name,
		       (SELECT COUNT(*) FROM agent_bids bd WHERE bd.bounty_id = b.id AND bd.status != 'withdrawn') AS bid_count
		FROM agent_bounties b
		LEFT JOIN agent_identities pa ON pa.id = b.poster_agent_id
		WHERE b.status = 'open' ${skillFilter} ${rewardFilter}
		ORDER BY b.created_at DESC
		LIMIT ${lim}`;
	return rows.map(shapeBounty);
}

export async function listBountiesForAgent(agentId, { limit = 40 } = {}) {
	await ensureLaborTables();
	const lim = Math.min(200, Math.max(1, Number(limit) || 40));
	const rows = await sql`
		SELECT b.*, pa.name AS poster_name,
		       (SELECT COUNT(*) FROM agent_bids bd WHERE bd.bounty_id = b.id AND bd.status != 'withdrawn') AS bid_count
		FROM agent_bounties b
		LEFT JOIN agent_identities pa ON pa.id = b.poster_agent_id
		WHERE b.poster_agent_id = ${agentId}
		ORDER BY b.created_at DESC LIMIT ${lim}`;
	return rows.map(shapeBounty);
}

// ── Bids ────────────────────────────────────────────────────────────────────

/** Upsert a worker's bid (one per bounty); returns the row. */
export async function upsertBid(input) {
	await ensureLaborTables();
	const {
		bountyId, workerAgentId, workerUserId, priceAtomics, etaSeconds = null,
		pitch = null, score = null, rationale = null, reputation = null, auto = false,
	} = input;
	const [row] = await sql`
		INSERT INTO agent_bids
			(bounty_id, worker_agent_id, worker_user_id, price_atomics, eta_seconds,
			 pitch, score, rationale, reputation, auto, status)
		VALUES (${bountyId}, ${workerAgentId}, ${workerUserId}, ${String(toBig(priceAtomics))},
			${etaSeconds}, ${pitch}, ${score}, ${rationale}, ${reputation}, ${!!auto}, 'pending')
		ON CONFLICT (bounty_id, worker_agent_id) DO UPDATE SET
			price_atomics = EXCLUDED.price_atomics, eta_seconds = EXCLUDED.eta_seconds,
			pitch = EXCLUDED.pitch, score = EXCLUDED.score, rationale = EXCLUDED.rationale,
			reputation = EXCLUDED.reputation, auto = EXCLUDED.auto, status = 'pending', updated_at = now()
		RETURNING *`;
	return row;
}

export async function getBid(id) {
	const [row] = await sql`SELECT * FROM agent_bids WHERE id = ${id} LIMIT 1`;
	return row || null;
}

export async function listBidsForBounty(bountyId) {
	const rows = await sql`
		SELECT bd.*, wa.name AS worker_name
		FROM agent_bids bd
		LEFT JOIN agent_identities wa ON wa.id = bd.worker_agent_id
		WHERE bd.bounty_id = ${bountyId} AND bd.status != 'withdrawn'
		ORDER BY bd.score DESC NULLS LAST, bd.created_at ASC`;
	return rows.map(shapeBid);
}

export async function rejectOtherBids(bountyId, winningBidId) {
	await sql`
		UPDATE agent_bids SET status = 'rejected', updated_at = now()
		WHERE bounty_id = ${bountyId} AND id != ${winningBidId} AND status = 'pending'`;
}

export async function markBidAwarded(bidId) {
	await sql`UPDATE agent_bids SET status = 'awarded', updated_at = now() WHERE id = ${bidId}`;
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export async function createJob(input) {
	await ensureLaborTables();
	const { bountyId, bidId, workerAgentId, workerUserId, posterAgentId, requiredSkill = null, priceAtomics } = input;
	const [row] = await sql`
		INSERT INTO agent_jobs
			(bounty_id, bid_id, worker_agent_id, worker_user_id, poster_agent_id, required_skill, price_atomics, status)
		VALUES (${bountyId}, ${bidId}, ${workerAgentId}, ${workerUserId}, ${posterAgentId},
			${requiredSkill}, ${String(toBig(priceAtomics))}, 'working')
		ON CONFLICT (bounty_id) DO NOTHING
		RETURNING *`;
	return row || (await getJobByBounty(bountyId));
}

export async function getJob(id) {
	const [row] = await sql`SELECT * FROM agent_jobs WHERE id = ${id} LIMIT 1`;
	return row || null;
}
export async function getJobByBounty(bountyId) {
	const [row] = await sql`SELECT * FROM agent_jobs WHERE bounty_id = ${bountyId} LIMIT 1`;
	return row || null;
}

export async function markJobDelivered(id, deliverable) {
	const [row] = await sql`
		UPDATE agent_jobs SET status = 'delivered', deliverable = ${JSON.stringify(deliverable ?? {})}::jsonb,
		    delivered_at = now(), updated_at = now()
		WHERE id = ${id} AND status = 'working' RETURNING *`;
	return row || null;
}

export async function markJobVerifying(id) {
	const [row] = await sql`
		UPDATE agent_jobs SET status = 'verifying', updated_at = now()
		WHERE id = ${id} AND status = 'delivered' RETURNING *`;
	return row || null;
}

export async function recordVerdict(id, verdict) {
	const [row] = await sql`
		UPDATE agent_jobs SET verdict = ${JSON.stringify(verdict ?? {})}::jsonb, verified_at = now(), updated_at = now()
		WHERE id = ${id} RETURNING *`;
	return row || null;
}

/** Claim the settle for a job idempotently. Returns the row if THIS caller won the
 *  claim (settle_key was unset), or null if another settle already owns it. */
export async function claimSettle(id, settleKey) {
	const [row] = await sql`
		UPDATE agent_jobs SET settle_key = ${settleKey}, status = 'verifying', updated_at = now()
		WHERE id = ${id} AND settle_key IS NULL AND status IN ('delivered','verifying')
		RETURNING *`;
	return row || null;
}

export async function markJobSettled(id, patch) {
	const [row] = await sql`
		UPDATE agent_jobs SET status = 'settled',
		    settlement_sig = ${patch.settlementSig ?? null},
		    royalty_sig = ${patch.royaltySig ?? null},
		    invocation_sig = ${patch.invocationSig ?? null},
		    royalty_atomics = ${patch.royaltyAtomics != null ? String(patch.royaltyAtomics) : null},
		    worker_payout_atomics = ${patch.workerPayoutAtomics != null ? String(patch.workerPayoutAtomics) : null},
		    royalty_author_id = ${patch.royaltyAuthorId ?? null},
		    refund_sig = COALESCE(${patch.refundSig ?? null}, refund_sig),
		    settled_at = now(), updated_at = now()
		WHERE id = ${id} RETURNING *`;
	return row || null;
}

export async function markJobFailed(id, { reason, refundSig = null, status = 'failed' }) {
	const [row] = await sql`
		UPDATE agent_jobs SET status = ${status}, failure_reason = ${reason || null},
		    refund_sig = COALESCE(${refundSig}, refund_sig),
		    settle_key = NULL, updated_at = now()
		WHERE id = ${id} RETURNING *`;
	return row || null;
}

export async function listInflightJobs({ limit = 30 } = {}) {
	const lim = Math.min(100, Math.max(1, Number(limit) || 30));
	const rows = await sql`
		SELECT j.*, b.title, b.reward_atomics, wa.name AS worker_name, pa.name AS poster_name
		FROM agent_jobs j
		JOIN agent_bounties b ON b.id = j.bounty_id
		LEFT JOIN agent_identities wa ON wa.id = j.worker_agent_id
		LEFT JOIN agent_identities pa ON pa.id = j.poster_agent_id
		WHERE j.status IN ('working','delivered','verifying')
		ORDER BY j.created_at DESC LIMIT ${lim}`;
	return rows.map(shapeJob);
}

export async function recentSettlements({ limit = 20 } = {}) {
	await ensureLaborTables();
	const lim = Math.min(100, Math.max(1, Number(limit) || 20));
	const rows = await sql`
		SELECT j.id, j.bounty_id, j.worker_agent_id, j.poster_agent_id, j.required_skill,
		       j.worker_payout_atomics, j.royalty_atomics, j.price_atomics, j.settlement_sig,
		       j.royalty_sig, j.invocation_sig, j.settled_at, b.title,
		       wa.name AS worker_name, pa.name AS poster_name
		FROM agent_jobs j
		JOIN agent_bounties b ON b.id = j.bounty_id
		LEFT JOIN agent_identities wa ON wa.id = j.worker_agent_id
		LEFT JOIN agent_identities pa ON pa.id = j.poster_agent_id
		WHERE j.status = 'settled'
		ORDER BY j.settled_at DESC LIMIT ${lim}`;
	return rows.map(shapeSettlement);
}

// ── Reputation + per-agent stats ────────────────────────────────────────────

export async function workerReputation(agentId) {
	await ensureLaborTables();
	const [row] = await sql`
		SELECT
			COUNT(*) FILTER (WHERE status = 'settled')               AS settled,
			COUNT(*) FILTER (WHERE status IN ('failed'))             AS failed,
			COALESCE(SUM(worker_payout_atomics) FILTER (WHERE status = 'settled'), 0) AS earned
		FROM agent_jobs WHERE worker_agent_id = ${agentId}`;
	const settled = Number(row?.settled || 0);
	const failed = Number(row?.failed || 0);
	return {
		reputation: reputationFromStats({ settled, failed }),
		settled, failed,
		earned_atomics: String(toBig(row?.earned || 0)),
	};
}

export async function agentLaborStats(agentId) {
	await ensureLaborTables();
	const [posted] = await sql`
		SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE status = 'settled') AS settled
		FROM agent_bounties WHERE poster_agent_id = ${agentId}`;
	const [work] = await sql`
		SELECT
			COUNT(*) FILTER (WHERE status = 'settled')  AS jobs_done,
			COUNT(*) FILTER (WHERE status = 'failed')   AS jobs_failed,
			COUNT(*) FILTER (WHERE status IN ('working','delivered','verifying')) AS jobs_active,
			COALESCE(SUM(worker_payout_atomics) FILTER (WHERE status = 'settled'), 0) AS earned,
			COALESCE(SUM(royalty_atomics) FILTER (WHERE status = 'settled' AND royalty_author_id = ${agentId}), 0) AS royalties
		FROM agent_jobs WHERE worker_agent_id = ${agentId}`;
	const [spent] = await sql`
		SELECT COALESCE(SUM(price_atomics) FILTER (WHERE status = 'settled'), 0) AS spent
		FROM agent_jobs WHERE poster_agent_id = ${agentId}`;
	const settled = Number(work?.jobs_done || 0);
	const failed = Number(work?.jobs_failed || 0);
	return {
		bounties_posted: Number(posted?.n || 0),
		bounties_settled: Number(posted?.settled || 0),
		jobs_done: settled,
		jobs_failed: failed,
		jobs_active: Number(work?.jobs_active || 0),
		earned_atomics: String(toBig(work?.earned || 0)),
		earned_three: atomicsToThree(work?.earned || 0),
		royalties_atomics: String(toBig(work?.royalties || 0)),
		spent_atomics: String(toBig(spent?.spent || 0)),
		spent_three: atomicsToThree(spent?.spent || 0),
		reputation: reputationFromStats({ settled, failed }),
	};
}

/** Total $THREE moved through the market, settled, for the live ticker header. */
export async function marketTotals() {
	await ensureLaborTables();
	const [row] = await sql`
		SELECT
			COUNT(*) FILTER (WHERE status = 'settled') AS settled_jobs,
			COALESCE(SUM(price_atomics) FILTER (WHERE status = 'settled'), 0) AS volume,
			(SELECT COUNT(*) FROM agent_bounties WHERE status = 'open') AS open_bounties
		FROM agent_jobs`;
	return {
		settled_jobs: Number(row?.settled_jobs || 0),
		volume_atomics: String(toBig(row?.volume || 0)),
		volume_three: atomicsToThree(row?.volume || 0),
		open_bounties: Number(row?.open_bounties || 0),
	};
}

// ── Labor policies (autonomy opt-in) ────────────────────────────────────────

export async function getLaborPolicy(agentId) {
	await ensureLaborTables();
	const [row] = await sql`SELECT * FROM agent_labor_policies WHERE agent_id = ${agentId} LIMIT 1`;
	return row ? shapePolicy(row) : null;
}

export async function upsertLaborPolicy(agentId, userId, patch) {
	await ensureLaborTables();
	const skills = Array.isArray(patch.skills) ? patch.skills.filter((s) => typeof s === 'string').slice(0, 40) : [];
	const [row] = await sql`
		INSERT INTO agent_labor_policies
			(agent_id, user_id, worker_enabled, skills, max_bid_atomics, min_reward_atomics,
			 poster_enabled, auto_award, min_bids, meta)
		VALUES (${agentId}, ${userId}, ${!!patch.workerEnabled}, ${skills},
			${patch.maxBidAtomics != null ? String(toBig(patch.maxBidAtomics)) : null},
			${patch.minRewardAtomics != null ? String(toBig(patch.minRewardAtomics)) : null},
			${!!patch.posterEnabled}, ${!!patch.autoAward}, ${Math.max(1, Number(patch.minBids) || 1)},
			${JSON.stringify(patch.meta || {})}::jsonb)
		ON CONFLICT (agent_id) DO UPDATE SET
			worker_enabled = EXCLUDED.worker_enabled, skills = EXCLUDED.skills,
			max_bid_atomics = EXCLUDED.max_bid_atomics, min_reward_atomics = EXCLUDED.min_reward_atomics,
			poster_enabled = EXCLUDED.poster_enabled, auto_award = EXCLUDED.auto_award,
			min_bids = EXCLUDED.min_bids, meta = EXCLUDED.meta, updated_at = now()
		RETURNING *`;
	return shapePolicy(row);
}

/** Worker agents whose autonomous policy matches a bounty's skill + reward floor. */
export async function findAutoBidders({ requiredSkill, rewardAtomics, excludeAgentId }) {
	await ensureLaborTables();
	const reward = String(toBig(rewardAtomics));
	const rows = await sql`
		SELECT p.*, ai.name AS agent_name, ai.user_id AS owner_user_id,
		       ai.meta->>'solana_address' AS solana_address
		FROM agent_labor_policies p
		JOIN agent_identities ai ON ai.id = p.agent_id AND ai.deleted_at IS NULL
		WHERE p.worker_enabled = true
		  AND p.agent_id != ${excludeAgentId}
		  AND (p.min_reward_atomics IS NULL OR p.min_reward_atomics <= ${reward})
		  AND (${requiredSkill}::text IS NULL OR ${requiredSkill} = ANY(p.skills))
		LIMIT 25`;
	return rows;
}

// ── Shaping ─────────────────────────────────────────────────────────────────

function shapeBounty(r) {
	return {
		id: r.id,
		poster_agent_id: r.poster_agent_id,
		poster_name: r.poster_name || 'Agent',
		title: r.title,
		spec: r.spec,
		required_skill: r.required_skill || null,
		reward_atomics: String(toBig(r.reward_atomics)),
		reward_three: atomicsToThree(r.reward_atomics),
		reward_mint: r.reward_mint,
		status: r.status,
		deadline: r.deadline || null,
		escrow_address: r.escrow_address || null,
		escrow_fund_sig: r.escrow_fund_sig || null,
		escrow_explorer: r.escrow_fund_sig ? `https://solscan.io/tx/${r.escrow_fund_sig}` : null,
		awarded_agent_id: r.awarded_agent_id || null,
		award_rationale: r.award_rationale || null,
		auto: !!r.auto,
		bid_count: Number(r.bid_count || 0),
		created_at: r.created_at,
	};
}

function shapeBid(r) {
	return {
		id: r.id,
		bounty_id: r.bounty_id,
		worker_agent_id: r.worker_agent_id,
		worker_user_id: r.worker_user_id,
		worker_name: r.worker_name || 'Agent',
		price_atomics: String(toBig(r.price_atomics)),
		price_three: atomicsToThree(r.price_atomics),
		eta_seconds: r.eta_seconds != null ? Number(r.eta_seconds) : null,
		pitch: r.pitch || null,
		score: r.score != null ? Number(r.score) : null,
		rationale: r.rationale || null,
		reputation: r.reputation != null ? Number(r.reputation) : null,
		auto: !!r.auto,
		status: r.status,
		created_at: r.created_at,
	};
}

function shapeJob(r) {
	return {
		id: r.id,
		bounty_id: r.bounty_id,
		title: r.title || null,
		worker_agent_id: r.worker_agent_id,
		worker_name: r.worker_name || 'Agent',
		poster_agent_id: r.poster_agent_id,
		poster_name: r.poster_name || 'Agent',
		required_skill: r.required_skill || null,
		price_atomics: String(toBig(r.price_atomics)),
		price_three: atomicsToThree(r.price_atomics),
		reward_three: r.reward_atomics != null ? atomicsToThree(r.reward_atomics) : null,
		status: r.status,
		deliverable: r.deliverable || null,
		verdict: r.verdict || null,
		delivered_at: r.delivered_at || null,
		created_at: r.created_at,
	};
}

function shapeSettlement(r) {
	return {
		id: r.id,
		bounty_id: r.bounty_id,
		title: r.title || null,
		worker_agent_id: r.worker_agent_id,
		worker_name: r.worker_name || 'Agent',
		poster_agent_id: r.poster_agent_id,
		poster_name: r.poster_name || 'Agent',
		required_skill: r.required_skill || null,
		worker_payout_atomics: String(toBig(r.worker_payout_atomics || r.price_atomics)),
		worker_payout_three: atomicsToThree(r.worker_payout_atomics || r.price_atomics),
		royalty_atomics: String(toBig(r.royalty_atomics || 0)),
		royalty_three: atomicsToThree(r.royalty_atomics || 0),
		settlement_sig: r.settlement_sig || null,
		settlement_explorer: r.settlement_sig ? `https://solscan.io/tx/${r.settlement_sig}` : null,
		royalty_sig: r.royalty_sig || null,
		invocation_sig: r.invocation_sig || null,
		invocation_explorer: r.invocation_sig ? `https://solscan.io/tx/${r.invocation_sig}` : null,
		settled_at: r.settled_at,
	};
}

function shapePolicy(r) {
	return {
		agent_id: r.agent_id,
		worker_enabled: !!r.worker_enabled,
		skills: Array.isArray(r.skills) ? r.skills : [],
		max_bid_atomics: r.max_bid_atomics != null ? String(toBig(r.max_bid_atomics)) : null,
		max_bid_three: r.max_bid_atomics != null ? atomicsToThree(r.max_bid_atomics) : null,
		min_reward_atomics: r.min_reward_atomics != null ? String(toBig(r.min_reward_atomics)) : null,
		min_reward_three: r.min_reward_atomics != null ? atomicsToThree(r.min_reward_atomics) : null,
		poster_enabled: !!r.poster_enabled,
		auto_award: !!r.auto_award,
		min_bids: Number(r.min_bids || 1),
		updated_at: r.updated_at,
	};
}

export { toBig as _toBig, shapeBounty as _shapeBounty };
