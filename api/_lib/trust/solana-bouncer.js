// Agent Bouncer (Solana) — the Pole Club's door bouncer, generalized to the
// whole platform's Solana reputation.
//
// The Club bouncer (api/_lib/club/cover-pass.js) admits a wallet from its club
// history alone: club_tips for a tier, club_bans for exclusion. That trust is
// real but narrow — it only knows what happened at our door.
//
// This module answers the SAME question — "should I engage this agent?" — from
// every Solana signal three.ws indexes about it:
//   • pump_agent_payments   — confirmed on-chain payments accepted, distinct
//                             payers, failure rate (did people actually pay it,
//                             and did those payments succeed?)
//   • pump_distribute_runs  — did it honor its distribute/buyback obligations?
//   • pump_buyback_runs
//   • solana_attestations   — signed Solana memo attestations about it
//                             (threews.feedback / threews.validation)
//   • club_bans / club_tips — the Club's own denylist + door history, folded in
//
// It is behavioral reputation, not a star rating: every input is a real,
// already-settled Solana action, not a claim. `vetSolanaAgent` never throws on a
// weak record — it returns admitted:false with reasons (like the Club turning a
// wallet away). The reads are injectable so the verdict logic is unit-testable
// without a database.

import { sql } from '../db.js';
import { findBan, visitsFor, normalizeWallet } from '../club/cover-pass.js';

// Tier thresholds, keyed off real activity volume + integrity, not a score.
export const TRUSTED_MIN_PAYMENTS = 10;
export const TRUSTED_MIN_PAYERS = 3;
export const TRUSTED_MAX_FAILURE_RATE = 0.2;
export const VIP_MIN_PAYMENTS = 50;
export const VIP_MIN_PAYERS = 10;

/**
 * Load the Solana reputation snapshot for a three.ws agent, synthesized from the
 * on-chain payment / distribution / buyback index and signed Solana memo
 * attestations three.ws maintains. Shared by /api/x402/agent-reputation (which
 * returns the raw snapshot) and the bouncer below (which returns a verdict).
 *
 * @param {string} agentId  three.ws agent_id (UUID)
 * @returns {Promise<object>} reputation snapshot
 */
export async function loadAgentReputation(agentId) {
	// Resolve the agent's Metaplex Core asset pubkey (the column attestations are
	// indexed by). Canonical write path is meta.onchain.sol_asset; legacy rows
	// wrote meta.sol_mint_address.
	const [agentRow] = await sql`
		select
			id,
			name,
			wallet_address,
			coalesce(meta->'onchain'->>'sol_asset', meta->>'sol_mint_address') as agent_asset
		  from agent_identities
		 where id = ${agentId} and deleted_at is null
		 limit 1
	`;
	if (!agentRow) {
		const err = new Error('agent_id not found');
		err.status = 404;
		err.code = 'agent_not_found';
		throw err;
	}

	const mints = await sql`
		select id, mint, network, symbol
		  from pump_agent_mints
		 where agent_id = ${agentId}
		 order by created_at asc
	`;
	const mintIds = mints.map((m) => m.id);

	if (mintIds.length === 0) {
		return {
			agent_id: agentId,
			name: agentRow.name,
			wallet_address: agentRow.wallet_address || null,
			deployed_mints: 0,
			mints: [],
			payments: {
				confirmed_count: 0,
				confirmed_amount_atomics: '0',
				distinct_payers: 0,
				failed_count: 0,
				failure_rate: 0,
			},
			distributions: { confirmed: 0, failed: 0, success_rate: 0 },
			buybacks: { confirmed: 0, failed: 0, total_burn_atomics: '0' },
			attestations: { feedback_count: 0, validation_count: 0, latest_attested_at: null },
			indexed_at: new Date().toISOString(),
		};
	}

	const [payRow] = await sql`
		select
			coalesce(sum(case when status = 'confirmed' then amount_atomics else 0 end), 0)::text
				as confirmed_amount,
			count(*) filter (where status = 'confirmed')::int as confirmed_count,
			count(*) filter (where status = 'failed')::int    as failed_count,
			count(distinct case when status = 'confirmed' then payer_wallet end)::int
				as distinct_payers
		  from pump_agent_payments
		 where mint_id = any(${mintIds})
	`;

	const [distRow] = await sql`
		select
			count(*) filter (where status = 'confirmed')::int as confirmed,
			count(*) filter (where status = 'failed')::int    as failed
		  from pump_distribute_runs
		 where mint_id = any(${mintIds})
	`;

	const [buyRow] = await sql`
		select
			count(*) filter (where status = 'confirmed')::int as confirmed,
			count(*) filter (where status = 'failed')::int    as failed,
			coalesce(sum(case when status = 'confirmed' then burn_amount else 0 end), 0)::text
				as total_burn
		  from pump_buyback_runs
		 where mint_id = any(${mintIds})
	`;

	const [attRow] = agentRow.agent_asset
		? await sql`
			select
				count(*) filter (where kind like 'threews.feedback%')::int   as feedback_count,
				count(*) filter (where kind like 'threews.validation%')::int as validation_count,
				max(block_time)                                              as latest_attested_at
			  from solana_attestations
			 where agent_asset = ${agentRow.agent_asset}
			   and revoked = false
		`
		: [{ feedback_count: 0, validation_count: 0, latest_attested_at: null }];

	const totalPayments = payRow.confirmed_count + payRow.failed_count;
	const totalDistribs = distRow.confirmed + distRow.failed;

	return {
		agent_id: agentId,
		name: agentRow.name,
		wallet_address: agentRow.wallet_address || null,
		deployed_mints: mints.length,
		mints: mints.map((m) => ({ mint: m.mint, network: m.network, symbol: m.symbol })),
		payments: {
			confirmed_count: payRow.confirmed_count,
			confirmed_amount_atomics: payRow.confirmed_amount,
			distinct_payers: payRow.distinct_payers,
			failed_count: payRow.failed_count,
			failure_rate: totalPayments ? payRow.failed_count / totalPayments : 0,
		},
		distributions: {
			confirmed: distRow.confirmed,
			failed: distRow.failed,
			success_rate: totalDistribs ? distRow.confirmed / totalDistribs : 0,
		},
		buybacks: {
			confirmed: buyRow.confirmed,
			failed: buyRow.failed,
			total_burn_atomics: buyRow.total_burn,
		},
		attestations: {
			feedback_count: attRow.feedback_count,
			validation_count: attRow.validation_count,
			latest_attested_at: attRow.latest_attested_at
				? new Date(attRow.latest_attested_at).toISOString()
				: null,
		},
		indexed_at: new Date().toISOString(),
	};
}

function attestationTotal(rep) {
	const a = rep.attestations || {};
	return (a.feedback_count || 0) + (a.validation_count || 0);
}

/**
 * Door tier from Solana behavioral reputation. Mirrors club/cover-pass.tierFor
 * but reads the whole platform's record instead of club_tips alone. Never
 * returns 'banned' — exclusion is decided by vetSolanaAgent (club_bans).
 *
 * @param {object} rep     snapshot from loadAgentReputation
 * @param {number} visits  prior settled club tips by this agent's wallet
 * @returns {'newcomer'|'regular'|'trusted'|'vip'}
 */
export function tierForSolanaReputation(rep, visits = 0) {
	const p = rep.payments || {};
	const b = rep.buybacks || {};
	const att = attestationTotal(rep);
	const known = (p.confirmed_count || 0) + att + (visits || 0) + (rep.deployed_mints || 0);
	if (known === 0) return 'newcomer'; // no history anywhere yet — cold start

	if (
		(p.confirmed_count || 0) >= VIP_MIN_PAYMENTS &&
		(p.distinct_payers || 0) >= VIP_MIN_PAYERS &&
		((rep.attestations?.validation_count || 0) > 0 || (b.confirmed || 0) > 0)
	) {
		return 'vip';
	}
	if (
		(p.confirmed_count || 0) >= TRUSTED_MIN_PAYMENTS &&
		(p.distinct_payers || 0) >= TRUSTED_MIN_PAYERS &&
		(p.failure_rate || 0) <= TRUSTED_MAX_FAILURE_RATE
	) {
		return 'trusted';
	}
	return 'regular';
}

/**
 * Run the Solana door bouncer over a three.ws agent and return an admission
 * verdict. Mirrors the Club door's contract — { admitted, banned, tier, reason }
 * — but the inputs are the agent's whole Solana track record, not just our door.
 *
 * @param {object} opts
 * @param {string} opts.agentId                three.ws agent_id (UUID)
 * @param {object} [opts.policy]               Admission policy (all optional).
 * @param {number} [opts.policy.minPayments=0]       Required confirmed payments.
 * @param {number} [opts.policy.minDistinctPayers=0] Required distinct payers.
 * @param {number} [opts.policy.maxFailureRate=1]    Max tolerated payment failure rate (0..1).
 * @param {number} [opts.policy.minAttestations=0]   Required signed Solana attestations.
 * @param {boolean} [opts.policy.allowNewcomers=true] Admit agents with no history.
 * @param {(id:string)=>Promise<object>} [opts.read]       Injectable reputation reader.
 * @param {(w:string)=>Promise<object|null>} [opts.banCheck]  Injectable club-ban lookup.
 * @param {(w:string)=>Promise<number>} [opts.visitsCheck]    Injectable club-visit count.
 * @returns {Promise<object>} verdict
 */
export async function vetSolanaAgent({
	agentId,
	policy = {},
	read = loadAgentReputation,
	banCheck = findBan,
	visitsCheck = visitsFor,
}) {
	const {
		minPayments = 0,
		minDistinctPayers = 0,
		maxFailureRate = 1,
		minAttestations = 0,
		allowNewcomers = true,
	} = policy;

	const rep = await read(agentId);
	const wallet = rep.wallet_address ? normalizeWallet(rep.wallet_address) : '';
	const [ban, visits] = await Promise.all([
		wallet ? banCheck(wallet) : Promise.resolve(null),
		wallet ? visitsCheck(wallet) : Promise.resolve(0),
	]);

	const p = rep.payments || {};
	const att = attestationTotal(rep);
	const totalActivity = (p.confirmed_count || 0) + att + (visits || 0) + (rep.deployed_mints || 0);
	const isNewcomer = totalActivity === 0;

	const reasons = [];
	let banned = false;
	if (ban) {
		banned = true;
		reasons.push(ban.reason || 'wallet is on the club ban list');
	}

	if (!allowNewcomers && isNewcomer) {
		reasons.push('no Solana track record yet — newcomers not admitted by this policy');
	}
	if (minPayments > 0 && (p.confirmed_count || 0) < minPayments) {
		reasons.push(`only ${p.confirmed_count || 0} confirmed payment(s); ${minPayments} required`);
	}
	if (minDistinctPayers > 0 && (p.distinct_payers || 0) < minDistinctPayers) {
		reasons.push(`only ${p.distinct_payers || 0} distinct payer(s); ${minDistinctPayers} required`);
	}
	const settledPayments = (p.confirmed_count || 0) + (p.failed_count || 0);
	if (maxFailureRate < 1 && settledPayments > 0 && (p.failure_rate || 0) > maxFailureRate) {
		reasons.push(
			`payment failure rate ${(p.failure_rate * 100).toFixed(1)}% exceeds the ${(maxFailureRate * 100).toFixed(0)}% limit`,
		);
	}
	if (minAttestations > 0 && att < minAttestations) {
		reasons.push(`only ${att} signed attestation(s); ${minAttestations} required`);
	}

	const admitted = !banned && reasons.length === 0;
	const tier = banned ? 'banned' : tierForSolanaReputation(rep, visits);

	return {
		admitted,
		banned,
		tier,
		reason: reasons[0] || null,
		reasons,
		newcomer: isNewcomer,
		agent_id: rep.agent_id,
		name: rep.name,
		wallet_address: rep.wallet_address || null,
		visits,
		reputation: {
			deployed_mints: rep.deployed_mints,
			payments: rep.payments,
			distributions: rep.distributions,
			buybacks: rep.buybacks,
			attestations: rep.attestations,
		},
	};
}
