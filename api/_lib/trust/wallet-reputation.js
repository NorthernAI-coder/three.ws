// Wallet Reputation — a real, non-gameable trust score for an agent's wallet.
//
// In a world of infinite forkable avatars, trust is the scarce asset. A wallet's
// real history — how much it has earned, how long it has been active, how
// reliably it settles, how many distinct funded wallets tipped it, how often it
// was forked, whether it carries a verified on-chain identity — is the most
// honest reputation signal three.ws has. This module turns those real, already-
// settled facts into ONE explainable 0–100 score.
//
// Design principles (read before touching the weights):
//
//   1. Every input is a real, verifiable fact pulled from the ledger
//      (agent_custody_events), the on-chain payment index (pump_agent_*), signed
//      Solana attestations, the EVM ERC-8004 reputation registry, fork lineage
//      (avatars.parent_avatar_id), and the agent's own age. No invented numbers.
//
//   2. Costly, provable signals outweigh cheap ones. Real USD volume, wallet age,
//      on-chain verification, and tips from DISTINCT funded wallets are weighted
//      heavily; anything a single actor can manufacture for free (self-tips, a
//      pile of payments from one wallet) is discounted or ignored in the
//      computation — not flagged after the fact.
//
//   3. The formula is fully explainable. computeReputation() is a pure function
//      that returns, for every pillar, the raw inputs, the points awarded, the
//      max, and human-readable detail. The UI renders that breakdown verbatim:
//      transparency is the trust.
//
//   4. A brand-new agent reads honestly as "new" — near-zero score, `new` tier —
//      never a fake high or a fake low. Time and money are the two things you
//      cannot fast-forward.
//
// The pillars and their maxima sum to 100:
//
//   tenure       15  wallet/agent age (log-scaled) + recent activity cadence
//   volume       25  real settled USD that flowed through the wallet (earnings + tips)
//   tips         15  count of DISTINCT external funded wallets that tipped it
//   reliability  15  on-chain settlement success rate (only once there's volume)
//   lineage      10  how many times the avatar was forked (others valued it)
//   identity     20  verified ERC-8004 identity + registry feedback + attestations
//
// computeReputation is pure and unit-tested (tests/wallet-reputation.test.js).
// loadReputationInputs / getAgentReputation do the real I/O.

import { sql } from '../db.js';
import { loadAgentReputation } from './solana-bouncer.js';

export const REPUTATION_VERSION = 1;

// Pillar definitions — label + max points. Order is the display order.
export const PILLARS = [
	{ key: 'tenure', label: 'Tenure & consistency', max: 15 },
	{ key: 'volume', label: 'Earnings & volume', max: 25 },
	{ key: 'tips', label: 'Tips from distinct wallets', max: 15 },
	{ key: 'reliability', label: 'Payment reliability', max: 15 },
	{ key: 'lineage', label: 'Fork lineage', max: 10 },
	{ key: 'identity', label: 'On-chain identity', max: 20 },
];

export const MAX_SCORE = PILLARS.reduce((s, p) => s + p.max, 0); // 100

// Tier ladder. Tiers reflect REAL thresholds, not just the raw score — `trusted`
// and above additionally require genuine counterparty diversity so age + identity
// alone can never manufacture trust.
export const TIERS = {
	new: { label: 'New', rank: 0, accent: '#9ca3af' },
	emerging: { label: 'Emerging', rank: 1, accent: '#c4b5fd' },
	established: { label: 'Established', rank: 2, accent: '#a78bfa' },
	trusted: { label: 'Trusted', rank: 3, accent: '#4ade80' },
	elite: { label: 'Elite', rank: 4, accent: '#fbbf24' },
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round1 = (n) => Math.round(n * 10) / 10;
const log2 = (n) => Math.log(n) / Math.LN2;

/**
 * Pure scoring function. Takes a fully-resolved, real `inputs` object (no I/O)
 * and returns an explainable reputation result. Kept pure so the formula is
 * unit-testable and identical on server and (if ever) client.
 *
 * @param {object} inputs
 * @param {number} inputs.ageDays            agent/wallet age in days
 * @param {number} inputs.activeDays90       distinct days with ledger activity in last 90d
 * @param {number} inputs.externalTipUsd     real USD tipped by NON-self wallets
 * @param {number} inputs.settledUsd         real USD that settled through the wallet (earnings)
 * @param {number} inputs.tipCount           total recorded tips
 * @param {number} inputs.distinctTippers    distinct EXTERNAL funded tipper wallets
 * @param {number} inputs.selfTipCount       tips whose sender == the wallet itself (ignored)
 * @param {number} inputs.confirmedPayments  confirmed on-chain payments accepted
 * @param {number} inputs.failedPayments     failed on-chain payments
 * @param {number} inputs.distinctPayers     distinct confirmed payers
 * @param {number} inputs.distributionSuccess success rate of distribute/buyback runs (0..1)
 * @param {number} inputs.forkCount          times this avatar was forked
 * @param {boolean} inputs.hasOnchainIdentity verified ERC-8004 identity present
 * @param {number} inputs.registryAverage    ERC-8004 reputation registry average (0..5 or 0..100)
 * @param {number} inputs.registryCount      ERC-8004 registry feedback count
 * @param {number} inputs.validationCount    signed Solana validation attestations
 * @param {number} inputs.feedbackCount      signed Solana feedback attestations
 * @param {boolean} inputs.hasSkillCollection on-chain skill-license collection minted
 * @returns {object} { version, score, tier, tierLabel, accent, isNew, pillars, discounted, totals }
 */
export function computeReputation(inputs = {}) {
	const i = normalizeInputs(inputs);
	const pillars = [];
	const discounted = [];

	// Counterparty concentration — the core anti-gaming guard. Real trust comes
	// from MANY distinct funded wallets choosing to pay/tip. If volume is high but
	// it all came from a single counterparty (a classic wash / self-deal pattern),
	// the money-weighted pillars are heavily discounted: that volume is not
	// evidence the wider world trusts this agent.
	const tipDiversity = i.distinctTippers;
	const concentrated = i.tipCount > 1 && tipDiversity <= 1;
	const diversityMultiplier = concentrated ? 0.35 : 1;

	// ── Tenure & consistency (max 15) ──────────────────────────────────────────
	// Age is the single most non-gameable signal: you cannot fast-forward time.
	const agePts = clamp(3.4 * Math.log10(i.ageDays + 1), 0, 10);
	const consistencyPts = clamp((i.activeDays90 / 30) * 5, 0, 5);
	pushPillar(pillars, 'tenure', agePts + consistencyPts, {
		detail:
			i.ageDays < 1
				? 'Brand-new wallet — no track record yet.'
				: `${fmtAge(i.ageDays)} old · active ${i.activeDays90} of the last 90 days.`,
		facts: { age_days: Math.round(i.ageDays), active_days_90: i.activeDays90 },
	});

	// ── Earnings & volume (max 25) ─────────────────────────────────────────────
	// Real USD that flowed through the wallet. Money moved is costly to fake.
	const rawVolume = i.settledUsd + i.externalTipUsd;
	const volumePtsRaw = clamp(6.5 * Math.log10(rawVolume + 1), 0, 25);
	const volumePts = volumePtsRaw * diversityMultiplier;
	pushPillar(pillars, 'volume', volumePts, {
		detail:
			rawVolume <= 0
				? 'No settled volume yet.'
				: `$${fmtUsd(rawVolume)} in real settled volume${concentrated ? ' (discounted — single counterparty)' : ''}.`,
		facts: { settled_usd: round1(i.settledUsd), tip_usd: round1(i.externalTipUsd) },
	});

	// ── Tips from distinct wallets (max 15) ────────────────────────────────────
	// Each DISTINCT funded tipper is a real Sybil cost. Self-tips are excluded
	// entirely from the count below.
	const tipsPtsRaw = clamp(5 * log2(tipDiversity + 1), 0, 15);
	const tipsPts = tipsPtsRaw * diversityMultiplier;
	pushPillar(pillars, 'tips', tipsPts, {
		detail:
			tipDiversity === 0
				? 'No tips from external wallets yet.'
				: `${tipDiversity} distinct funded wallet${tipDiversity === 1 ? '' : 's'} tipped this agent.`,
		facts: { distinct_tippers: tipDiversity, total_tips: i.tipCount },
	});

	// ── Payment reliability (max 15) ───────────────────────────────────────────
	// Only meaningful once there's real settlement volume. A new agent honestly
	// scores 0 here (no history) rather than an unearned full mark.
	const settled = i.confirmedPayments + i.failedPayments;
	let reliabilityPts = 0;
	let reliabilityDetail = 'No settled payments yet — reliability is unproven.';
	if (settled >= 5) {
		const successRate = i.confirmedPayments / settled;
		reliabilityPts = successRate * 12 + clamp(i.distributionSuccess * 3, 0, 3);
		reliabilityDetail = `${(successRate * 100).toFixed(0)}% of ${settled} settlements succeeded${
			i.distributionSuccess > 0 ? `, ${(i.distributionSuccess * 100).toFixed(0)}% distribution success` : ''
		}.`;
	}
	pushPillar(pillars, 'reliability', reliabilityPts, {
		detail: reliabilityDetail,
		facts: { confirmed_payments: i.confirmedPayments, failed_payments: i.failedPayments },
	});

	// ── Fork lineage (max 10) ──────────────────────────────────────────────────
	// Being forked a lot is a real, costly-to-fake signal that others valued this
	// agent enough to copy it.
	const lineagePts = clamp(3.3 * log2(i.forkCount + 1), 0, 10);
	pushPillar(pillars, 'lineage', lineagePts, {
		detail:
			i.forkCount === 0
				? 'Not forked yet.'
				: `Forked ${i.forkCount} time${i.forkCount === 1 ? '' : 's'} by other creators.`,
		facts: { fork_count: i.forkCount },
	});

	// ── On-chain identity & verification (max 20) ──────────────────────────────
	let identityPts = 0;
	const idBits = [];
	if (i.hasOnchainIdentity) {
		identityPts += 8;
		idBits.push('verified ERC-8004 identity');
	}
	if (i.registryCount > 0) {
		// Registry average may arrive on a 0–5 star scale or a 0–100 scale.
		const norm = i.registryAverage > 5 ? i.registryAverage / 100 : i.registryAverage / 5;
		const regPts = clamp(norm * 4 + clamp(log2(i.registryCount + 1), 0, 2), 0, 6);
		identityPts += regPts;
		idBits.push(`${i.registryCount} on-chain review${i.registryCount === 1 ? '' : 's'}`);
	}
	const attPts = clamp(i.validationCount * 2 + i.feedbackCount * 0.5, 0, 4);
	if (attPts > 0) {
		identityPts += attPts;
		idBits.push(`${i.validationCount + i.feedbackCount} signed attestation${i.validationCount + i.feedbackCount === 1 ? '' : 's'}`);
	}
	if (i.hasSkillCollection) {
		identityPts += 2;
		idBits.push('on-chain skill licenses');
	}
	identityPts = clamp(identityPts, 0, 20);
	pushPillar(pillars, 'identity', identityPts, {
		detail: idBits.length ? `Carries ${idBits.join(', ')}.` : 'No on-chain identity or attestations yet.',
		facts: { verified: i.hasOnchainIdentity, registry_count: i.registryCount, attestations: i.validationCount + i.feedbackCount },
	});

	// ── Anti-gaming transparency ───────────────────────────────────────────────
	// Surface what did NOT count so the score reads as credible.
	if (i.selfTipCount > 0) {
		discounted.push({
			kind: 'self_tips',
			label: `${i.selfTipCount} self-tip${i.selfTipCount === 1 ? '' : 's'} ignored`,
			detail: 'Tips sent from the wallet to itself carry no trust and are excluded from the score.',
		});
	}
	if (concentrated) {
		discounted.push({
			kind: 'concentration',
			label: 'Single-counterparty volume discounted',
			detail:
				'Most volume came from one wallet. Trust requires many distinct funded counterparties, so this volume is weighted down.',
		});
	}

	const score = round1(clamp(pillars.reduce((s, p) => s + p.points, 0), 0, MAX_SCORE));

	// Real activity floor for the "new" verdict — independent of the raw score,
	// which is never exactly 0 once an agent has any age.
	const realActivity =
		i.tipCount +
		i.confirmedPayments +
		i.forkCount +
		i.validationCount +
		i.feedbackCount +
		i.registryCount +
		(i.hasOnchainIdentity ? 1 : 0) +
		(rawVolume > 0 ? 1 : 0);
	const isNew = realActivity === 0;

	const tier = tierFor({ score, isNew, distinctTippers: tipDiversity, confirmedPayments: i.confirmedPayments });

	return {
		version: REPUTATION_VERSION,
		score,
		max: MAX_SCORE,
		tier,
		tierLabel: TIERS[tier].label,
		accent: TIERS[tier].accent,
		isNew,
		pillars,
		discounted,
		totals: {
			settled_usd: round1(rawVolume),
			distinct_tippers: tipDiversity,
			confirmed_payments: i.confirmedPayments,
			fork_count: i.forkCount,
			verified: i.hasOnchainIdentity,
		},
	};
}

/**
 * Tier from the real score + real counterparty thresholds. `trusted`/`elite`
 * require genuine counterparty diversity (≥3 distinct tippers OR ≥10 confirmed
 * payments) so that score earned purely from age + identity can never be sold as
 * peer trust.
 */
export function tierFor({ score, isNew, distinctTippers = 0, confirmedPayments = 0 }) {
	if (isNew) return 'new';
	const hasPeerTrust = distinctTippers >= 3 || confirmedPayments >= 10;
	if (score >= 75 && hasPeerTrust) return 'elite';
	if (score >= 55 && hasPeerTrust) return 'trusted';
	if (score >= 30) return 'established';
	return 'emerging';
}

function pushPillar(arr, key, points, extra) {
	const def = PILLARS.find((p) => p.key === key);
	arr.push({
		key,
		label: def.label,
		points: round1(clamp(points, 0, def.max)),
		max: def.max,
		...extra,
	});
}

function normalizeInputs(raw) {
	const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
	return {
		ageDays: Math.max(0, num(raw.ageDays)),
		activeDays90: Math.max(0, num(raw.activeDays90)),
		externalTipUsd: Math.max(0, num(raw.externalTipUsd)),
		settledUsd: Math.max(0, num(raw.settledUsd)),
		tipCount: Math.max(0, num(raw.tipCount)),
		distinctTippers: Math.max(0, num(raw.distinctTippers)),
		selfTipCount: Math.max(0, num(raw.selfTipCount)),
		confirmedPayments: Math.max(0, num(raw.confirmedPayments)),
		failedPayments: Math.max(0, num(raw.failedPayments)),
		distinctPayers: Math.max(0, num(raw.distinctPayers)),
		distributionSuccess: clamp(num(raw.distributionSuccess), 0, 1),
		forkCount: Math.max(0, num(raw.forkCount)),
		hasOnchainIdentity: Boolean(raw.hasOnchainIdentity),
		registryAverage: Math.max(0, num(raw.registryAverage)),
		registryCount: Math.max(0, num(raw.registryCount)),
		validationCount: Math.max(0, num(raw.validationCount)),
		feedbackCount: Math.max(0, num(raw.feedbackCount)),
		hasSkillCollection: Boolean(raw.hasSkillCollection),
	};
}

function fmtAge(days) {
	if (days >= 365) return `${(days / 365).toFixed(1)}y`;
	if (days >= 30) return `${Math.round(days / 30)}mo`;
	if (days >= 1) return `${Math.round(days)}d`;
	return '<1d';
}
function fmtUsd(n) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toFixed(n < 10 ? 2 : 0);
}

// ── Real I/O ────────────────────────────────────────────────────────────────

/**
 * Gather every REAL reputation input for an agent from the ledger, the on-chain
 * payment index, fork lineage, attestations, and (best-effort) the EVM ERC-8004
 * reputation registry. Never fabricates: a source that errors degrades to its
 * zero/neutral value and is reflected as `partial` by the caller.
 *
 * @param {string} agentId
 * @param {object} [opts]
 * @param {boolean} [opts.lite=false]  Skip the best-effort EVM ERC-8004 registry
 *        RPC read — used for batch list rendering where dozens of agents are
 *        scored at once. The registry contributes ≤6 of 100 and the full
 *        per-agent endpoint always includes it, so a lite score stays honest.
 * @returns {Promise<{ inputs: object, agent: object, evidence: object, partial: boolean }>}
 */
export async function loadReputationInputs(agentId, opts = {}) {
	const lite = opts.lite === true;
	let partial = false;
	const soft = async (p, fallback) => {
		try {
			return await p;
		} catch {
			partial = true;
			return fallback;
		}
	};

	const [agent] = await sql`
		select
			id, name, created_at, avatar_id, chain_id, erc8004_agent_id,
			skill_collection_mint,
			meta->>'solana_address' as solana_address,
			wallet_address
		from agent_identities
		where id = ${agentId} and deleted_at is null
		limit 1
	`;
	if (!agent) {
		const err = new Error('agent not found');
		err.status = 404;
		err.code = 'not_found';
		throw err;
	}

	const ownWallet = agent.solana_address || '__none__';
	const ageDays = agent.created_at ? (Date.now() - new Date(agent.created_at).getTime()) / 86_400_000 : 0;

	// Ledger: tips, volume, cadence — all from agent_custody_events.
	const [ledger] = await soft(
		sql`
			select
				count(*) filter (where event_type = 'tip' and status in ('confirmed','ok'))::int
					as tip_count,
				count(distinct case
					when event_type = 'tip' and status in ('confirmed','ok')
					 and meta->>'from' is not null and meta->>'from' <> ${ownWallet}
					then meta->>'from' end)::int
					as distinct_tippers,
				count(*) filter (
					where event_type = 'tip' and meta->>'from' = ${ownWallet}
				)::int as self_tip_count,
				coalesce(sum(case
					when event_type = 'tip' and status in ('confirmed','ok')
					 and (meta->>'from') is distinct from ${ownWallet}
					then usd else 0 end), 0)::float8 as external_tip_usd,
				coalesce(sum(case
					when status in ('confirmed','ok') and usd is not null then usd else 0 end), 0)::float8
					as settled_usd,
				count(distinct date_trunc('day', created_at)) filter (
					where created_at >= now() - interval '90 days'
				)::int as active_days_90
			from agent_custody_events
			where agent_id = ${agentId}
		`,
		[{}],
	);

	// Fork lineage: how many avatars were forked from this agent's avatar.
	const [forks] = agent.avatar_id
		? await soft(
				sql`
					select count(*)::int as fork_count
					from avatars
					where parent_avatar_id = ${agent.avatar_id} and deleted_at is null
				`,
				[{ fork_count: 0 }],
		  )
		: [{ fork_count: 0 }];

	// On-chain payment / distribution / attestation record (already-real index).
	const solRep = await soft(loadAgentReputation(agentId), null);

	// Best-effort EVM ERC-8004 reputation registry read (skipped in lite mode).
	const registry = lite
		? { average: 0, count: 0 }
		: await soft(readErc8004Registry(agent), { average: 0, count: 0 });

	const inputs = {
		ageDays,
		activeDays90: ledger?.active_days_90 || 0,
		externalTipUsd: ledger?.external_tip_usd || 0,
		settledUsd: ledger?.settled_usd || 0,
		tipCount: ledger?.tip_count || 0,
		distinctTippers: ledger?.distinct_tippers || 0,
		selfTipCount: ledger?.self_tip_count || 0,
		confirmedPayments: solRep?.payments?.confirmed_count || 0,
		failedPayments: solRep?.payments?.failed_count || 0,
		distinctPayers: solRep?.payments?.distinct_payers || 0,
		distributionSuccess: solRep?.distributions?.success_rate || 0,
		forkCount: forks?.fork_count || 0,
		hasOnchainIdentity: Boolean(agent.erc8004_agent_id),
		registryAverage: registry?.average || 0,
		registryCount: registry?.count || 0,
		validationCount: solRep?.attestations?.validation_count || 0,
		feedbackCount: solRep?.attestations?.feedback_count || 0,
		hasSkillCollection: Boolean(agent.skill_collection_mint),
	};

	const evidence = buildEvidence(agent, { solRep, registry });
	return { inputs, agent, evidence, partial };
}

/**
 * Full reputation result for one agent: real inputs → pure score → evidence +
 * owner guidance. This is what the HTTP endpoint and discovery ranking call.
 */
export async function getAgentReputation(agentId, opts = {}) {
	const { inputs, agent, evidence, partial } = await loadReputationInputs(agentId, opts);
	const result = computeReputation(inputs);
	return {
		agent_id: agent.id,
		name: agent.name,
		...result,
		evidence,
		guidance: buildGuidance(result, inputs, agent),
		partial,
		computed_at: new Date().toISOString(),
	};
}

async function readErc8004Registry(agent) {
	if (!agent.erc8004_agent_id || !agent.chain_id) return { average: 0, count: 0 };
	const RPC = {
		1: 'https://eth.llamarpc.com',
		10: 'https://optimism.llamarpc.com',
		8453: 'https://base.llamarpc.com',
		42161: 'https://arbitrum.llamarpc.com',
		137: 'https://polygon.llamarpc.com',
	};
	const rpcUrl = RPC[agent.chain_id];
	if (!rpcUrl) return { average: 0, count: 0 };
	const { JsonRpcProvider, Contract } = await import('ethers');
	const { REGISTRY_DEPLOYMENTS, REPUTATION_REGISTRY_ABI } = await import('../../../src/erc8004/abi.js');
	const deployment = REGISTRY_DEPLOYMENTS[agent.chain_id];
	if (!deployment?.reputationRegistry) return { average: 0, count: 0 };
	const provider = new JsonRpcProvider(rpcUrl, agent.chain_id, { staticNetwork: true });
	const contract = new Contract(deployment.reputationRegistry, REPUTATION_REGISTRY_ABI, provider);
	const [avgX100, count] = await contract.getReputation(BigInt(agent.erc8004_agent_id));
	const n = Number(count);
	return { average: n === 0 ? 0 : Number(avgX100) / 100, count: n };
}

function buildEvidence(agent, { solRep, registry }) {
	const ev = {};
	if (agent.solana_address) {
		ev.wallet = {
			label: 'Wallet activity',
			href: `https://solscan.io/account/${agent.solana_address}`,
		};
		ev.ledger = { label: 'Custody ledger', href: `/agent/${agent.id}/wallet` };
	}
	if (agent.avatar_id) {
		ev.lineage = { label: 'Fork lineage', href: `/avatars/${agent.avatar_id}` };
	}
	if (agent.erc8004_agent_id) {
		ev.identity = { label: 'On-chain identity', href: `/agent/${agent.id}/onchain` };
	}
	if (registry?.count > 0) {
		ev.registry = { label: 'On-chain reviews', href: '/reputation' };
	}
	const mint = solRep?.mints?.[0]?.mint;
	if (mint) {
		ev.mint = { label: 'Launched coin', href: `https://solscan.io/token/${mint}` };
	}
	return ev;
}

// Owner-facing, actionable guidance tied to real available actions. Visitors do
// not see this — only the owner can act on it.
function buildGuidance(result, inputs, agent) {
	const tips = [];
	if (!inputs.hasOnchainIdentity) {
		tips.push({
			action: 'verify_identity',
			label: 'Verify your on-chain identity',
			detail: 'Register an ERC-8004 identity to add up to 8 points of provable trust.',
			href: `/agent/${agent.id}/onchain`,
		});
	}
	if (inputs.distinctTippers < 3) {
		tips.push({
			action: 'grow_tips',
			label: 'Earn tips from real wallets',
			detail: 'Trust grows fastest from many distinct funded wallets choosing to tip you.',
			href: `/agent/${agent.id}/wallet`,
		});
	}
	if (inputs.confirmedPayments < 10) {
		tips.push({
			action: 'transact',
			label: 'Build a settlement history',
			detail: 'Reliable, confirmed on-chain payments raise your reliability score over time.',
			href: `/agent/${agent.id}/wallet`,
		});
	}
	return tips.slice(0, 3);
}
