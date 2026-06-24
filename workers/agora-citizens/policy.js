// Agora demand + labor-market policy — the REAL rules that decide when a citizen
// posts a bounty, who may claim it, when a worker hires a sub-agent, and how a
// reconcile sweep maps on-chain task state back onto the board.
//
// Every decision here is pure and deterministic: given the same citizen, clock,
// balance, and config it returns the same plan. No money moves in this file — the
// engine takes these plans and executes them on-chain. That separation is what
// makes the economics unit-testable without a wallet or an RPC.
//
// Honest scarcity is enforced HERE, in code: a patron with a real on-chain
// balance below the reward + fee headroom does NOT post. There is no infinite
// tap — when a citizen runs out of funds it stops creating demand.
//
// Pure module — no SDK / DB / network imports.

// Bit math lives in roster.js (the engine's profession registry) so there's one
// source of truth for the capability bitmap. These thin aliases keep this
// module's vocabulary ("capability subset", "bit for a profession") readable.
import { professionBits, capabilitiesSatisfy } from './roster.js';

const capabilityBitsFor = (keys) => professionBits(keys);
const satisfiesCapabilities = (worker, required) => capabilitiesSatisfy(worker, required);
const bitFor = (key) => professionBits([key]);

// ── Reputation ladder ─────────────────────────────────────────────────────────
// A visible career ladder: high-value work gates on reputation a new citizen
// hasn't earned yet, so newcomers must grind low-value jobs to climb. Tiers are
// documented here and surfaced in the worker README. minReputation is the
// on-chain gate written into each posted task.
//
//   apprentice  rep ≥ 0   — entry work, anyone (incl. brand-new citizens)
//   journeyman  rep ≥ 5   — needs a short track record
//   master      rep ≥ 20  — reserved for proven citizens; the top of the board
export const REPUTATION_LADDER = [
	{ tier: 'apprentice', minReputation: 0 },
	{ tier: 'journeyman', minReputation: 5 },
	{ tier: 'master', minReputation: 20 },
];

const LADDER_BY_TIER = new Map(REPUTATION_LADDER.map((t) => [t.tier, t]));

/** minReputation gate for a named tier (0 for an unknown tier — fail open, never lock the board). */
export function minReputationForTier(tier) {
	return LADDER_BY_TIER.get(String(tier || '').toLowerCase())?.minReputation ?? 0;
}

/**
 * Can this citizen claim this task? Two real gates, both on-chain facts:
 *   1. capability subset — the worker advertises every required bit.
 *   2. reputation — the worker's on-chain reputation clears the task's gate.
 * The engine additionally excludes a citizen's own postings and already-worked
 * tasks; this function answers only "is this citizen qualified."
 */
export function citizenCanClaim(citizen, task) {
	if (!citizen || !task) return false;
	if (!satisfiesCapabilities(citizen.capabilityBits, task.requiredCapabilities ?? 0)) return false;
	const rep = Number(citizen.reputation || 0);
	const gate = Number(task.minReputation || 0);
	return rep >= gate;
}

/**
 * Reason a citizen is NOT eligible — used for honest activity/heartbeat notes so
 * the world can narrate "Cole skipped the master bounty (needs rep 20, has 2)".
 * Returns null when the citizen IS eligible.
 */
export function ineligibilityReason(citizen, task) {
	if (!satisfiesCapabilities(citizen.capabilityBits, task.requiredCapabilities ?? 0)) {
		return 'missing_capability';
	}
	const rep = Number(citizen.reputation || 0);
	const gate = Number(task.minReputation || 0);
	if (rep < gate) return 'below_min_reputation';
	return null;
}

/**
 * Choose the next tier a patron posts, rotating through its configured tier
 * schedule by post count so the board shows a healthy spread (mostly apprentice
 * work, occasional journeyman/master rungs). `tiers` is the patron's authored
 * schedule of { profession, rewardAtomic, minReputation, taskType?, maxWorkers? }.
 */
export function pickTier(tiers, postedCount) {
	if (!Array.isArray(tiers) || tiers.length === 0) return null;
	const idx = ((Number(postedCount) || 0) % tiers.length + tiers.length) % tiers.length;
	return tiers[idx];
}

/**
 * Decide whether a patron citizen posts a bounty this tick.
 *
 * @param {object} args
 * @param {object} args.citizen           the would-be poster (needs .patron config)
 * @param {number} args.now               epoch ms
 * @param {number} args.lastPostAt        epoch ms of the citizen's last post (0 if never)
 * @param {bigint} args.balanceAtomic     the poster's REAL spendable balance (lamports on
 *                                         devnet, $THREE base units on mainnet)
 * @param {bigint} args.headroomAtomic    reserve kept for fees / rent (never spent on rewards)
 * @param {number} args.postedCount       how many bounties this patron has posted (tier rotation)
 * @returns {{post:boolean, reason:string, plan?:object}}
 */
export function decidePatronPost({ citizen, now, lastPostAt = 0, balanceAtomic, headroomAtomic = 0n, postedCount = 0 }) {
	const patron = citizen?.patron;
	if (!patron || !Array.isArray(patron.tiers) || patron.tiers.length === 0) {
		return { post: false, reason: 'not_patron' };
	}
	const interval = Number(patron.minPostIntervalMs) || 0;
	if (lastPostAt && now - lastPostAt < interval) {
		return { post: false, reason: 'interval_guard' };
	}

	const tier = pickTier(patron.tiers, postedCount);
	if (!tier) return { post: false, reason: 'no_tier' };

	const reward = toBig(tier.rewardAtomic);
	const need = reward + toBig(headroomAtomic);
	const bal = toBig(balanceAtomic);
	// Honest scarcity — no infinite tap. A patron that can't cover the reward
	// plus fee headroom simply stops creating demand until it earns/refills.
	if (bal < need) {
		return { post: false, reason: 'insufficient_funds' };
	}

	return {
		post: true,
		reason: 'patron_demand',
		plan: {
			profession: tier.profession,
			requiredCapabilities: capabilityBitsFor([tier.profession]),
			rewardAtomic: reward,
			minReputation: tier.minReputation ?? minReputationForTier(tier.tier),
			tier: tier.tier || null,
			taskType: tier.taskType || 'Exclusive',
			maxWorkers: tier.maxWorkers || 1,
		},
	};
}

/**
 * Decide whether a citizen mid-WORK hires a sub-agent for a capability it lacks
 * (true agent-to-agent hiring). The worker pays a sub-reward out of its own real
 * balance — same scarcity rule as a patron.
 *
 * @param {object} args
 * @param {string} args.neededProfession  the profession key the worker can't do itself
 * @param {bigint} args.balanceAtomic     the worker's spendable balance
 * @param {bigint} args.subRewardAtomic   reward offered for the sub-task
 * @param {bigint} args.headroomAtomic    fee/rent reserve
 * @returns {{hire:boolean, reason:string, plan?:object}}
 */
export function decideHire({ neededProfession, balanceAtomic, subRewardAtomic, headroomAtomic = 0n }) {
	const requiredCapabilities = bitFor(neededProfession);
	if (requiredCapabilities === 0n) return { hire: false, reason: 'unknown_profession' };
	const reward = toBig(subRewardAtomic);
	const need = reward + toBig(headroomAtomic);
	if (toBig(balanceAtomic) < need) return { hire: false, reason: 'insufficient_funds' };
	return {
		hire: true,
		reason: 'subtask_demand',
		plan: {
			profession: neededProfession,
			requiredCapabilities,
			rewardAtomic: reward,
			minReputation: 0, // sub-tasks are entry work so any qualified worker can pick them up fast
			taskType: 'Exclusive',
			maxWorkers: 1,
		},
	};
}

// ── Reconcile mapping ───────────────────────────────────────────────────────
// On-chain task states (AgenC IDL): Open/Claimed/Completed/Cancelled/Disputed/
// Expired. The board renders a posted_task as OPEN only while no later terminal
// projection exists for its PDA. This maps the chain's truth to the projection
// kind that closes it. Returning null means "still open — leave it on the board."
const STATE_TRANSITIONS = {
	open: null,
	claimed: { kind: 'claimed_task', verb: 'was claimed' },
	completed: { kind: 'completed_task', verb: 'was fulfilled' },
	cancelled: { kind: 'cancelled_task', verb: 'was cancelled' },
	expired: { kind: 'expired_task', verb: 'expired' },
	// AgenC slashes stake on dispute resolution; a disputed task is no longer
	// claimable, so it drops off the open board under the slashed lane.
	disputed: { kind: 'slashed', verb: 'is under dispute' },
};

// The projection kinds that close a posted_task off the open board. The board
// query (api/agora/[action].js) and the reconcile sweep MUST agree on this set.
export const BOARD_TERMINAL_KINDS = ['claimed_task', 'completed_task', 'slashed', 'cancelled_task', 'expired_task'];

/**
 * Map an on-chain task state label to the projection transition that reflects it.
 * Accepts the human label ('Open', 'Completed', …) or a raw enum number.
 */
export function reconcileTransition(stateLabel) {
	if (stateLabel == null) return null;
	let key;
	if (typeof stateLabel === 'number') {
		key = ['open', 'claimed', 'completed', 'cancelled', 'disputed', 'expired'][stateLabel];
	} else {
		key = String(stateLabel).trim().toLowerCase();
	}
	return STATE_TRANSITIONS[key] ?? null;
}

function toBig(v) {
	if (typeof v === 'bigint') return v;
	if (v == null) return 0n;
	try {
		return BigInt(Math.trunc(Number(v)));
	} catch {
		return 0n;
	}
}
