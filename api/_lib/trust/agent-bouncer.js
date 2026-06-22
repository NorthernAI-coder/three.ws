// Agent Bouncer — the Pole Club's door bouncer, generalized to the open agent
// internet.
//
// The Club bouncer (api/_lib/club/cover-pass.js) answers "do I let this wallet
// in?" by reading a Postgres table only three.ws can see: club_bans for
// exclusion, club_tips for a door tier (newcomer / regular / vip). That trust
// is real but local — a VIP at our door is a stranger at every other venue on
// the internet.
//
// This module answers the SAME question from the open, portable, on-chain
// signal instead: ERC-8004's Reputation Registry. The "ban list" is the chain's
// own negative scores; the "tier" is earned across every platform that reads
// and writes the same registries at the same address on 12 chains. A verdict
// here travels with the agent everywhere.
//
//   Club (local)                    Agent Bouncer (open)
//   ─────────────────────────────   ─────────────────────────────────────────
//   identity   paying wallet        ERC-8004 agent NFT (Identity Registry)
//   history    club_tips count      append-only feedback count
//   tier       newcomer/regular/vip newcomer/regular/trusted/vip (avg+count+stake)
//   exclusion  club_bans            negative on-chain average (+ optional denylist)
//
// The on-chain read is injectable (`read` option) so callers can swap an
// indexer and tests run without RPC. `vetAgent` never throws on a low score —
// it returns `admitted:false` with reasons (like the Club turning a wallet away
// after the cover already settled). It throws only on bad input or infra error.

import { Contract } from 'ethers';

import { env } from '../env.js';
import { evmFallbackProvider } from '../evm/rpc.js';
import { CHAIN_BY_ID } from '../erc8004-chains.js';
import {
	REGISTRY_DEPLOYMENTS,
	REPUTATION_REGISTRY_ABI,
	IDENTITY_REGISTRY_ABI,
	agentRegistryId,
} from '../../../src/erc8004/abi.js';

export const DEFAULT_CHAIN_ID = 8453; // Base

// Tier thresholds. Deliberately scale-agnostic on the score itself (ERC-8004
// scores are int8 in [-100,100], but star UIs submit 1-5) — tiers key off the
// SIGN of the average, the review COUNT, and whether anyone has put ETH stake
// (skin in the game) behind a vouch. Admission thresholds that DO compare the
// average against a number are caller-supplied policy, never baked in here.
export const TRUSTED_MIN_COUNT = 5;
export const VIP_MIN_COUNT = 10;

/**
 * Door tier from open-network reputation. Mirrors club/cover-pass.tierFor but
 * reads the chain instead of club_tips. Never returns 'banned' — exclusion is
 * decided by vetAgent (denylist / negative average) which overrides the tier.
 *
 * @param {{ average: number, count: number, totalStakeWei?: string|bigint }} rep
 * @returns {'newcomer'|'regular'|'trusted'|'vip'}
 */
export function tierForReputation({ average, count, totalStakeWei = '0' }) {
	const n = Number(count) || 0;
	if (n <= 0) return 'newcomer'; // cold start — no history yet
	let stake = 0n;
	try {
		stake = BigInt(totalStakeWei || '0');
	} catch {
		stake = 0n;
	}
	if (average < 0) return 'regular'; // has history but net-negative; banNegative handles exclusion
	if (n >= VIP_MIN_COUNT && stake > 0n) return 'vip';
	if (n >= TRUSTED_MIN_COUNT) return 'trusted';
	return 'regular';
}

function normalizeKey(v) {
	return String(v || '').trim().toLowerCase();
}

/**
 * Read aggregated ERC-8004 reputation for an agent directly from the canonical
 * Reputation Registry. Resolves an agentId from a wallet via the Identity
 * Registry when only a wallet is given. A wallet with no registered agent is
 * NOT an error — it's a newcomer (registered:false, zeroed aggregate).
 *
 * getReputation returns (int256 avgX100, uint256 count): the average ALREADY
 * multiplied by 100. We divide by 100 — never by count (that is the bug this
 * module exists to avoid) — and Number() preserves the sign so a net-negative
 * agent reads as negative, not as a huge unsigned value.
 *
 * @param {object} opts
 * @param {number|bigint|string} [opts.agentId]
 * @param {string} [opts.wallet]
 * @param {number} [opts.chainId=8453]
 * @param {string} [opts.rpcUrl]   Pinned first; otherwise env + curated public failover.
 * @returns {Promise<{agentId:string|null, wallet:string|null, average:number, count:number, totalStakeWei:string, registered:boolean}>}
 */
export async function readAgentReputation({ agentId, wallet, chainId = DEFAULT_CHAIN_ID, rpcUrl }) {
	const deployment = REGISTRY_DEPLOYMENTS[chainId];
	if (!deployment?.reputationRegistry) {
		throw new Error(`no ERC-8004 Reputation Registry deployed on chain ${chainId}`);
	}
	const provider = await evmFallbackProvider(chainId, {
		primaryUrl: rpcUrl || env.A2A_REPUTATION_RPC_URL || null,
	});

	let resolvedAgentId =
		agentId !== undefined && agentId !== null && String(agentId) !== '' ? BigInt(agentId) : null;
	const resolvedWallet = wallet ? String(wallet) : null;

	if (resolvedAgentId === null) {
		if (!resolvedWallet) throw new Error('agentId or wallet is required');
		const identity = new Contract(deployment.identityRegistry, IDENTITY_REGISTRY_ABI, provider);
		const bal = await identity.balanceOf(resolvedWallet);
		if (bal === 0n) {
			// No ERC-8004 identity for this wallet anywhere on this chain. Honest
			// answer: an unknown newcomer, not a failure.
			return {
				agentId: null,
				wallet: resolvedWallet,
				average: 0,
				count: 0,
				totalStakeWei: '0',
				registered: false,
			};
		}
		resolvedAgentId = BigInt(await identity.tokenOfOwnerByIndex(resolvedWallet, 0n));
	}

	const reputation = new Contract(deployment.reputationRegistry, REPUTATION_REGISTRY_ABI, provider);
	const [agg, totalStake] = await Promise.all([
		reputation.getReputation(resolvedAgentId),
		reputation.getTotalStake(resolvedAgentId),
	]);
	const [avgX100, count] = agg;
	const n = Number(count);

	return {
		agentId: resolvedAgentId.toString(),
		wallet: resolvedWallet,
		average: n === 0 ? 0 : Number(avgX100) / 100,
		count: n,
		totalStakeWei: totalStake.toString(),
		registered: true,
	};
}

/**
 * Run the open-network bouncer over an agent and return an admission verdict.
 * Mirrors the Club door's contract — { admitted, banned, tier, reason } — but
 * the inputs come from 12 chains, not our private table.
 *
 * @param {object} opts
 * @param {number|bigint|string} [opts.agentId]
 * @param {string} [opts.wallet]
 * @param {number} [opts.chainId=8453]
 * @param {object} [opts.policy]               Admission policy (all optional).
 * @param {number} [opts.policy.minAverage=0]  Required average score (caller's scale).
 * @param {number} [opts.policy.minCount=0]    Required number of on-chain reviews.
 * @param {bigint|string|number} [opts.policy.minStakeWei=0]  Required total ETH stake (wei).
 * @param {boolean} [opts.policy.allowNewcomers=true]  Admit agents with zero history.
 * @param {boolean} [opts.policy.banNegative=true]     Refuse net-negative agents.
 * @param {Array<string>} [opts.denylist=[]]   Extra wallets/agentIds to refuse outright.
 * @param {(o:object)=>Promise<object>} [opts.read]  Injectable reputation reader.
 * @returns {Promise<object>} verdict
 */
export async function vetAgent({
	agentId,
	wallet,
	chainId = DEFAULT_CHAIN_ID,
	policy = {},
	denylist = [],
	read = readAgentReputation,
}) {
	const {
		minAverage = 0,
		minCount = 0,
		minStakeWei = 0,
		allowNewcomers = true,
		banNegative = true,
	} = policy;

	const rep = await read({ agentId, wallet, chainId });
	const reasons = [];
	let banned = false;

	const denyKeys = new Set((denylist || []).map(normalizeKey).filter(Boolean));
	if (rep.wallet && denyKeys.has(normalizeKey(rep.wallet))) {
		banned = true;
		reasons.push('wallet is on the denylist');
	}
	if (rep.agentId && denyKeys.has(normalizeKey(rep.agentId))) {
		banned = true;
		reasons.push('agentId is on the denylist');
	}
	if (banNegative && rep.average < 0) {
		banned = true;
		reasons.push(`negative on-chain reputation (average ${rep.average.toFixed(2)})`);
	}

	if (!allowNewcomers && rep.count === 0) {
		reasons.push('no on-chain reviews yet — newcomers not admitted by this policy');
	}
	if (minCount > 0 && rep.count < minCount) {
		reasons.push(`only ${rep.count} review(s) on-chain; ${minCount} required`);
	}
	if (minAverage > 0 && rep.average < minAverage) {
		reasons.push(`average ${rep.average.toFixed(2)} is below the required ${minAverage}`);
	}
	let stake = 0n;
	try {
		stake = BigInt(rep.totalStakeWei || '0');
	} catch {
		stake = 0n;
	}
	const minStake = BigInt(String(minStakeWei || 0));
	if (minStake > 0n && stake < minStake) {
		reasons.push(`staked ${stake} wei; ${minStake} wei required`);
	}

	const admitted = !banned && reasons.length === 0;
	const tier = banned ? 'banned' : tierForReputation(rep);

	return {
		admitted,
		banned,
		tier,
		reason: reasons[0] || null,
		reasons,
		registered: rep.registered !== false,
		agentId: rep.agentId,
		wallet: rep.wallet,
		chainId,
		registry: deploymentRegistryId(chainId),
		reputation: {
			average: rep.average,
			count: rep.count,
			totalStakeWei: rep.totalStakeWei || '0',
			totalStakeEth: weiToEth(rep.totalStakeWei),
		},
	};
}

function deploymentRegistryId(chainId) {
	const reg = REGISTRY_DEPLOYMENTS[chainId]?.reputationRegistry;
	return reg ? agentRegistryId(chainId, reg) : null;
}

function weiToEth(wei) {
	let v = 0n;
	try {
		v = BigInt(wei || '0');
	} catch {
		return 0;
	}
	// Six significant decimals is plenty for a stake display; avoids BigInt→float
	// overflow for large balances while keeping sub-milli-ETH legible.
	return Number((v * 1_000_000n) / 1_000_000_000_000_000_000n) / 1_000_000;
}

/**
 * Human/agent name for a chain id, for verdict display + error messages.
 * @param {number} chainId
 * @returns {string}
 */
export function chainNameFor(chainId) {
	return CHAIN_BY_ID[chainId]?.name || `chain ${chainId}`;
}
