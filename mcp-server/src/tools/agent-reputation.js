// `agent_reputation` — paid MCP tool that reads ERC-8004 reputation for an
// agent (by agentId, EVM wallet, or "eip155:<chain>:<wallet>" CAIP-10 ID).
//
// Pricing: $0.01 USDC, settled `exact` in USDC on Solana mainnet.
//
// All reads are made directly against the canonical ERC-8004 reference
// deployments via ethers JsonRpcProvider — no third-party indexers, no
// cached snapshots, no fallback values. By default we query Base; the
// caller can override with `chain: "ethereum"|"base"|"arbitrum"|"optimism"|"polygon"|"bsc"`
// or pass a numeric chainId.
//
// The result includes:
//   - aggregate reputation (totalScore + count + average) via getReputation
//   - total ETH staked on the agent's vouches via getTotalStake
//   - recent ReputationSubmitted + ReputationStaked events (latest 25)
//   - the agent's URI + wallet (Identity Registry) when resolvable
//
// All numeric responses are returned both as decimal strings (for safe
// integer transport) and as parsed Number where the value fits in float64.

import { Contract, isAddress, ZeroAddress } from 'ethers';
import { z } from 'zod';

import { paid, toolError } from '../payments.js';
import { jsonSchemaFromZod } from './_shared.js';
import { makeEvmProvider, getEvmRpcUrls } from '../lib/evm-rpc.js';

const TOOL_NAME = 'agent_reputation';
const TOOL_DESCRIPTION =
	'ERC-8004 on-chain reputation for an agent: aggregate score + count + average from the canonical ReputationRegistry, total ETH staked on vouches, and the latest ReputationSubmitted/ReputationStaked events. Resolves agentId from a wallet via IdentityRegistry when needed. Reads default to Base; switch chains via "chain". Paid: $0.01 USDC.';

const IDENTITY_REGISTRY_ABI = [
	'function balanceOf(address owner) external view returns (uint256)',
	'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
	'function ownerOf(uint256 tokenId) external view returns (address)',
	'function tokenURI(uint256 tokenId) external view returns (string)',
	'function getAgentWallet(uint256 agentId) external view returns (address)',
	'function totalSupply() external view returns (uint256)',
];

const REPUTATION_REGISTRY_ABI = [
	'function getReputation(uint256 agentId) external view returns (uint256 totalScore, uint256 count)',
	'function getTotalStake(uint256 agentId) external view returns (uint256)',
	'event ReputationSubmitted(uint256 indexed agentId, address indexed submitter, uint8 score, string comment)',
	'event ReputationStaked(uint256 indexed agentId, address indexed staker, uint8 score, uint256 value)',
];

const IDENTITY_REGISTRY_MAINNET = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const REPUTATION_REGISTRY_MAINNET = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

// Canonical mainnet RPCs. Operators may pin custom endpoints via
// MCP_AGENT_REP_RPC_<chainId> to avoid rate-limiting the public defaults.
const CHAINS = {
	base: { id: 8453, rpc: 'https://mainnet.base.org', name: 'Base' },
	ethereum: { id: 1, rpc: 'https://eth.llamarpc.com', name: 'Ethereum' },
	arbitrum: { id: 42161, rpc: 'https://arb1.arbitrum.io/rpc', name: 'Arbitrum One' },
	optimism: { id: 10, rpc: 'https://mainnet.optimism.io', name: 'Optimism' },
	polygon: { id: 137, rpc: 'https://polygon-rpc.com', name: 'Polygon' },
	bsc: { id: 56, rpc: 'https://bsc-dataseed1.binance.org', name: 'BNB Chain' },
	avalanche: { id: 43114, rpc: 'https://api.avax.network/ext/bc/C/rpc', name: 'Avalanche' },
	celo: { id: 42220, rpc: 'https://forno.celo.org', name: 'Celo' },
	linea: { id: 59144, rpc: 'https://rpc.linea.build', name: 'Linea' },
	scroll: { id: 534352, rpc: 'https://rpc.scroll.io', name: 'Scroll' },
};
const CHAIN_BY_ID = Object.fromEntries(Object.values(CHAINS).map((c) => [c.id, c]));

function resolveChain(input) {
	if (!input) return CHAINS.base;
	if (typeof input === 'string') {
		const lower = input.toLowerCase();
		if (CHAINS[lower]) return CHAINS[lower];
		const id = Number(input);
		if (!Number.isNaN(id) && CHAIN_BY_ID[id]) return CHAIN_BY_ID[id];
	}
	if (typeof input === 'number' && CHAIN_BY_ID[input]) return CHAIN_BY_ID[input];
	throw new Error(`unsupported chain "${input}" — known: ${Object.keys(CHAINS).join(', ')}`);
}

// Parse the agent identifier. Accepts: numeric ID, EVM wallet, or CAIP-10
// "eip155:<chainId>:<address>" (which can also override the chain selection).
function parseAgentInput(raw, defaultChain) {
	const value = String(raw || '').trim();
	if (!value) throw new Error('agent identifier is required');
	if (/^\d+$/.test(value)) {
		return { kind: 'agentId', agentId: BigInt(value), chain: defaultChain };
	}
	if (value.startsWith('eip155:')) {
		const parts = value.split(':');
		if (parts.length !== 3) throw new Error(`invalid CAIP-10 ID "${value}"`);
		const chain = resolveChain(parts[1]);
		const addr = parts[2];
		if (!isAddress(addr)) throw new Error(`invalid wallet in CAIP-10 ID "${value}"`);
		return { kind: 'wallet', wallet: addr, chain };
	}
	if (isAddress(value)) {
		return { kind: 'wallet', wallet: value, chain: defaultChain };
	}
	throw new Error(`could not parse agent identifier "${value}" — expected uint, EVM wallet, or eip155:<chain>:<addr>`);
}

async function resolveAgentId(provider, wallet) {
	const id = new Contract(IDENTITY_REGISTRY_MAINNET, IDENTITY_REGISTRY_ABI, provider);
	const bal = await id.balanceOf(wallet);
	if (bal === 0n) return null;
	const tokenId = await id.tokenOfOwnerByIndex(wallet, 0n);
	return BigInt(tokenId);
}

async function readIdentity(provider, agentId) {
	const id = new Contract(IDENTITY_REGISTRY_MAINNET, IDENTITY_REGISTRY_ABI, provider);
	const [owner, agentWallet, uri] = await Promise.allSettled([
		id.ownerOf(agentId),
		id.getAgentWallet(agentId),
		id.tokenURI(agentId),
	]);
	return {
		owner: owner.status === 'fulfilled' ? owner.value : null,
		agentWallet: agentWallet.status === 'fulfilled' ? agentWallet.value : null,
		uri: uri.status === 'fulfilled' ? uri.value : null,
		errors: [owner, agentWallet, uri]
			.filter((r) => r.status === 'rejected')
			.map((r) => r.reason?.message || String(r.reason)),
	};
}

async function readReputationAggregate(provider, agentId) {
	const rep = new Contract(REPUTATION_REGISTRY_MAINNET, REPUTATION_REGISTRY_ABI, provider);
	const [agg, totalStake] = await Promise.all([rep.getReputation(agentId), rep.getTotalStake(agentId)]);
	const [totalScore, count] = agg;
	const totalScoreNum = Number(totalScore);
	const countNum = Number(count);
	return {
		totalScore: totalScore.toString(),
		count: count.toString(),
		average: countNum > 0 ? totalScoreNum / countNum : null,
		totalStakeWei: totalStake.toString(),
	};
}

// Walk the last LOG_WINDOW_BLOCKS blocks (configurable) for recent vouches.
// On chains where the registry has been quiet, this can return an empty
// array — that's the truth, not a failure.
const LOG_WINDOW_BLOCKS = Number(process.env.MCP_AGENT_REP_LOG_WINDOW || 200_000);

async function readRecentEvents(provider, agentId) {
	const rep = new Contract(REPUTATION_REGISTRY_MAINNET, REPUTATION_REGISTRY_ABI, provider);
	const latest = await provider.getBlockNumber();
	const from = Math.max(0, latest - LOG_WINDOW_BLOCKS);
	const [submitted, staked] = await Promise.all([
		rep.queryFilter(rep.filters.ReputationSubmitted(agentId), from, latest),
		rep.queryFilter(rep.filters.ReputationStaked(agentId), from, latest),
	]);
	const submittedDecoded = submitted.map((e) => ({
		kind: 'submitted',
		blockNumber: e.blockNumber,
		txHash: e.transactionHash,
		submitter: e.args?.submitter,
		score: Number(e.args?.score),
		comment: e.args?.comment || '',
	}));
	const stakedDecoded = staked.map((e) => ({
		kind: 'staked',
		blockNumber: e.blockNumber,
		txHash: e.transactionHash,
		staker: e.args?.staker,
		score: Number(e.args?.score),
		valueWei: e.args?.value?.toString?.() || '0',
	}));
	return {
		windowBlocks: LOG_WINDOW_BLOCKS,
		fromBlock: from,
		toBlock: latest,
		events: [...submittedDecoded, ...stakedDecoded].sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 25),
	};
}

// Single source of truth: Zod shape with descriptions; JSON Schema derived.
const inputZodShape = {
	address: z
		.string()
		.min(1)
		.describe('ERC-8004 agentId (uint), EVM wallet address (0x...), or CAIP-10 "eip155:<chainId>:<wallet>".'),
	chain: z
		.string()
		.describe('Chain to query (default: base). Accepts name or numeric chainId. Overridden by CAIP-10 input.')
		.optional(),
};

const inputJsonSchema = jsonSchemaFromZod(inputZodShape);

export async function buildAgentReputationTool() {
	const handler = await paid(
		{
			toolName: TOOL_NAME,
			description: TOOL_DESCRIPTION,
			scheme: 'exact',
			priceUsd: '$0.01',
			inputSchema: inputJsonSchema,
			example: { address: '1', chain: 'base' },
			outputExample: {
				chain: 'base',
				agentId: '1',
				identity: { owner: '0x...', agentWallet: '0x...', uri: 'ipfs://...' },
				reputation: { totalScore: '42', count: '6', average: 7, totalStakeWei: '0' },
				events: [{ kind: 'submitted', score: 5, submitter: '0x...', comment: '' }],
			},
		},
		async ({ address, chain }) => {
			const defaultChain = resolveChain(chain);
			const parsed = parseAgentInput(address, defaultChain);
			// Endpoint failover: an operator override (MCP_AGENT_REP_RPC_<id>) is
			// tried first, then the chain's built-in redundant public endpoints,
			// each with a bounded request timeout. A single RPC outage no longer
			// fails the lookup or hangs the paid call.
			const overrides = [process.env[`MCP_AGENT_REP_RPC_${parsed.chain.id}`]].filter(Boolean);
			const provider = makeEvmProvider(parsed.chain.id, { overrides, timeoutMs: 12_000 });

			let agentId = parsed.kind === 'agentId' ? parsed.agentId : null;
			let walletResolved = parsed.kind === 'wallet' ? parsed.wallet : null;
			if (!agentId) {
				agentId = await resolveAgentId(provider, walletResolved);
				if (!agentId) {
					return toolError(
						'no_agent_registered_for_wallet',
						`no ERC-8004 agent is registered for ${walletResolved} on ${parsed.chain.name}`,
						{
							chain: parsed.chain.name,
							chainId: parsed.chain.id,
							input: address,
							resolvedWallet: walletResolved,
							identityRegistry: IDENTITY_REGISTRY_MAINNET,
							reputationRegistry: REPUTATION_REGISTRY_MAINNET,
						},
					);
				}
			}

			const [identity, reputation, events] = await Promise.all([
				readIdentity(provider, agentId),
				readReputationAggregate(provider, agentId),
				readRecentEvents(provider, agentId),
			]);

			const isZero = identity.owner === ZeroAddress;
			return {
				chain: parsed.chain.name,
				chainId: parsed.chain.id,
				agentId: agentId.toString(),
				agentRegistry: `eip155:${parsed.chain.id}:${IDENTITY_REGISTRY_MAINNET}`,
				reputationRegistry: REPUTATION_REGISTRY_MAINNET,
				identity: isZero ? null : identity,
				reputation,
				events,
				rpc: getEvmRpcUrls(parsed.chain.id, overrides),
				fetchedAt: new Date().toISOString(),
			};
		},
	);
	return {
		name: TOOL_NAME,
		title: 'Agent reputation ($0.01)',
		description: TOOL_DESCRIPTION,
		inputSchema: inputZodShape,
		handler,
	};
}
