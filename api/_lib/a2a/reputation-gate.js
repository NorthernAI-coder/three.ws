// Reputation gate — refuse to pay a peer agent whose on-chain ERC-8004
// reputation is below the caller's threshold.
//
// Trust is the missing half of autonomous payments: budget caps stop an agent
// overspending, but they don't stop it paying a scammer. ERC-8004's Reputation
// Registry (getReputation(agentId) → (totalScore, count)) is the standard
// trust signal; this module reads it server-side and enforces a minimum average
// score and/or minimum review count before a mandate-authorized payment is
// allowed to proceed.
//
// The on-chain read is injectable (`read` option) so tests run without RPC and
// callers can swap in an indexer. When reputation gating is requested but no
// RPC URL is configured AND no threshold is set, the gate is a no-op; if a
// threshold IS set without a usable reader, it fails closed.

import { Contract, JsonRpcProvider } from 'ethers';

import { env } from '../env.js';
import { REGISTRY_DEPLOYMENTS, REPUTATION_REGISTRY_ABI } from '../../../src/erc8004/abi.js';

export class ReputationError extends Error {
	constructor(code, message, status = 403) {
		super(message);
		this.name = 'ReputationError';
		this.code = code;
		this.status = status;
	}
}

/**
 * Read aggregated ERC-8004 reputation for an agent.
 * @param {object} opts
 * @param {number|bigint|string} opts.agentId
 * @param {number} opts.chainId
 * @param {string} [opts.rpcUrl]   Defaults to env.A2A_REPUTATION_RPC_URL.
 * @returns {Promise<{ average: number, count: number, total: number }>}
 */
export async function readReputationOnchain({ agentId, chainId, rpcUrl }) {
	const url = rpcUrl || env.A2A_REPUTATION_RPC_URL;
	if (!url) throw new ReputationError('reputation_rpc_unconfigured', 'no RPC URL for reputation reads', 500);
	const deployment = REGISTRY_DEPLOYMENTS[chainId];
	if (!deployment?.reputationRegistry) {
		throw new ReputationError(
			'reputation_registry_missing',
			`no Reputation Registry deployed on chain ${chainId}`,
			500,
		);
	}
	const provider = new JsonRpcProvider(url);
	const contract = new Contract(deployment.reputationRegistry, REPUTATION_REGISTRY_ABI, provider);
	const [totalScore, count] = await contract.getReputation(agentId);
	const n = Number(count);
	const t = Number(totalScore);
	return { total: t, count: n, average: n === 0 ? 0 : t / n };
}

/**
 * Assert a peer agent meets the reputation bar. Throws ReputationError when it
 * doesn't. A no-op when neither a minimum average nor minimum count is set.
 *
 * @param {object} opts
 * @param {number|bigint|string} [opts.agentId]   On-chain agentId of the peer.
 * @param {number} [opts.chainId]
 * @param {number} [opts.minAverage=0]            Required average score.
 * @param {number} [opts.minCount=0]              Required number of reviews.
 * @param {string} [opts.rpcUrl]
 * @param {(o:object)=>Promise<{average:number,count:number}>} [opts.read]  Injectable reader.
 * @returns {Promise<{ average: number, count: number } | null>}  The reputation read, or null when gating was skipped.
 */
export async function assertReputationOk({
	agentId,
	chainId,
	minAverage = 0,
	minCount = 0,
	rpcUrl,
	read = readReputationOnchain,
}) {
	const gated = minAverage > 0 || minCount > 0;
	if (!gated) return null; // No threshold requested — nothing to enforce.

	if (agentId === undefined || agentId === null || agentId === '') {
		throw new ReputationError(
			'reputation_required',
			'a reputation threshold was set but no peer agentId was provided to evaluate',
		);
	}

	let rep;
	try {
		rep = await read({ agentId, chainId, rpcUrl });
	} catch (err) {
		if (err instanceof ReputationError) throw err;
		// Reader blew up (RPC down, etc). Fail closed — we cannot prove the peer is
		// trustworthy, and the caller explicitly asked us to gate on trust.
		throw new ReputationError('reputation_unavailable', `reputation read failed: ${err.message}`, 502);
	}

	if (minCount > 0 && rep.count < minCount) {
		throw new ReputationError(
			'reputation_too_few_reviews',
			`peer has ${rep.count} review(s); ${minCount} required`,
		);
	}
	if (minAverage > 0 && rep.average < minAverage) {
		throw new ReputationError(
			'reputation_too_low',
			`peer average ${rep.average.toFixed(2)} is below required ${minAverage}`,
		);
	}
	return rep;
}
