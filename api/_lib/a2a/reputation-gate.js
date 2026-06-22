// Reputation gate — refuse to pay a peer agent whose on-chain ERC-8004
// reputation is below the caller's threshold.
//
// Trust is the missing half of autonomous payments: budget caps stop an agent
// overspending, but they don't stop it paying a scammer. ERC-8004's Reputation
// Registry is the standard trust signal; this module reads it server-side and
// enforces a minimum average score and/or minimum review count before a
// mandate-authorized payment is allowed to proceed. It is the throwing wrapper
// around the shared open-network bouncer (../trust/agent-bouncer.js) — same
// canonical, correctly-decoded read the public /api/x402/agent-bouncer endpoint
// uses, so the autonomous-payment door and the public door can never drift on
// who is trustworthy.
//
// The read goes through the curated multi-RPC failover in api/_lib/evm/rpc.js
// (honoring A2A_REPUTATION_RPC_URL as the pinned primary when set), so the gate
// works out of the box without per-deploy RPC config. The reader is injectable
// (`read` option) so tests run without RPC. The gate is a no-op when no
// threshold is set; when a threshold IS set and the read fails, it fails closed.

import { readAgentReputation } from '../trust/agent-bouncer.js';

export class ReputationError extends Error {
	constructor(code, message, status = 403) {
		super(message);
		this.name = 'ReputationError';
		this.code = code;
		this.status = status;
	}
}

/**
 * Read aggregated ERC-8004 reputation for an agent. Delegates to the shared
 * bouncer read, which decodes getReputation's (int256 avgX100, uint256 count)
 * correctly — average = avgX100 / 100, sign-preserving. (The earlier local read
 * here divided the already-averaged value by count again, understating every
 * score by a factor of count and mis-decoding negatives as huge positives.)
 *
 * @param {object} opts
 * @param {number|bigint|string} opts.agentId
 * @param {number} opts.chainId
 * @param {string} [opts.rpcUrl]   Pinned first; otherwise env + curated public failover.
 * @returns {Promise<{ average: number, count: number }>}
 */
export async function readReputationOnchain({ agentId, chainId, rpcUrl }) {
	const rep = await readAgentReputation({ agentId, chainId, rpcUrl });
	return { average: rep.average, count: rep.count };
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
