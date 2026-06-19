/**
 * ReputationRegistry helpers — submit and query agent feedback.
 *
 * Matches the deployed ERC-8004 reputation contract
 * (contracts/src/ReputationRegistry.sol) exactly:
 *   submitFeedback(uint256 agentId, int8 score, string uri)
 *   getReputation(uint256 agentId) → (int256 avgX100, uint256 count)
 *   getTotalStake(uint256 agentId) → uint256
 *   FeedbackSubmitted(agentId, from, int8 score, string uri)
 *
 * `getReputation` returns the average already multiplied by 100 (so callers can
 * divide client-side without precision loss). Never re-divide by `count` — that
 * is what the contract already did. `score` is a signed int8 in [-100, 100]; the
 * star UIs pass 1-5, which is a valid subset.
 */

import { Contract } from 'ethers';
import { REGISTRY_DEPLOYMENTS, REPUTATION_REGISTRY_ABI } from './abi.js';

function getContract(chainId, runner) {
	const deployment = REGISTRY_DEPLOYMENTS[chainId];
	if (!deployment || !deployment.reputationRegistry) {
		throw new Error(`No Reputation Registry deployed on chain ${chainId}.`);
	}
	return new Contract(deployment.reputationRegistry, REPUTATION_REGISTRY_ABI, runner);
}

/**
 * Submit reputation feedback about an agent.
 * @param {object} opts
 * @param {number|bigint} opts.agentId
 * @param {number} opts.score                     Signed int8 in [-100, 100] (star UIs pass 1-5)
 * @param {string} [opts.comment='']              Optional public on-chain comment / ipfs:// URI
 * @param {import('ethers').Signer} opts.signer
 * @param {number} [opts.chainId]
 * @returns {Promise<string>} tx hash
 */
export async function submitFeedback({ agentId, score, comment = '', signer, chainId }) {
	if (!Number.isInteger(score) || score < -100 || score > 100) {
		throw new Error('score must be an int8 in [-100, 100]');
	}
	const resolvedChainId = chainId ?? Number((await signer.provider.getNetwork()).chainId);
	const contract = getContract(resolvedChainId, signer);
	const tx = await contract.submitFeedback(agentId, score, comment);
	await tx.wait();
	return tx.hash;
}

// Back-compat alias — the prior client API called this submitReputation.
export const submitReputation = submitFeedback;

/**
 * Read aggregated reputation.
 * @returns {Promise<{average: number, count: number}>}
 *          `average` is the on-chain avgX100 divided by 100 (so 4.2 reads as 4.2),
 *          0 when no reviews have been submitted.
 */
export async function getReputation({ agentId, runner, chainId }) {
	const contract = getContract(chainId, runner);
	const [avgX100, count] = await contract.getReputation(agentId);
	const n = Number(count);
	return {
		count: n,
		average: n === 0 ? 0 : Number(avgX100) / 100,
	};
}

/**
 * Submit a reputation score backed by ETH stake.
 * @param {object} opts
 * @param {number|bigint} opts.agentId
 * @param {number} opts.score         1-5
 * @param {string} [opts.comment='']
 * @param {bigint} opts.stakeWei      Must be >= 0.001 ETH (1e15 wei)
 * @param {import('ethers').Signer} opts.signer
 * @param {number} [opts.chainId]
 * @returns {Promise<string>} tx hash
 */
export async function stakeReputation({ agentId, score, comment = '', stakeWei, signer, chainId }) {
	if (!Number.isInteger(score) || score < 1 || score > 5) {
		throw new Error('score must be 1-5');
	}
	const resolvedChainId = chainId ?? Number((await signer.provider.getNetwork()).chainId);
	const contract = getContract(resolvedChainId, signer);
	const tx = await contract.stakeReputation(agentId, score, comment, { value: stakeWei });
	await tx.wait();
	return tx.hash;
}

/**
 * Read total ETH staked on an agent.
 * @returns {Promise<bigint>} wei
 */
export async function getTotalStake({ agentId, runner, chainId }) {
	const contract = getContract(chainId, runner);
	return await contract.getTotalStake(agentId);
}

/**
 * Enumerate past reviews by querying the FeedbackSubmitted event log.
 * Optional — only useful if an indexer/provider supports filtered log queries.
 */
export async function getRecentReviews({ agentId, runner, chainId, fromBlock = 0 }) {
	const contract = getContract(chainId, runner);
	const filter = contract.filters.FeedbackSubmitted(agentId);
	const events = await contract.queryFilter(filter, fromBlock);
	return events.map((ev) => ({
		agentId: Number(ev.args.agentId),
		from: ev.args.from,
		score: Number(ev.args.score),
		comment: ev.args.uri,
		blockNumber: ev.blockNumber,
		txHash: ev.transactionHash,
	}));
}
