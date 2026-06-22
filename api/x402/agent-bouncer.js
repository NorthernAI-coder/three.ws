// GET /api/x402/agent-bouncer?agent=<id|wallet|caip10>&chain=base&min_average=&min_count=
//
// The Pole Club's door bouncer, opened up to the whole agent internet.
//
// The Club's bouncer (/api/x402/club-cover) decides admission from a Postgres
// table only three.ws can see — so a VIP at our door is a stranger everywhere
// else. This endpoint answers the SAME question — "should I engage this agent?"
// — from the open, portable signal instead: ERC-8004 on-chain reputation,
// readable at one address on 12 chains. The denylist is the chain's own
// negative scores; the door tier (newcomer/regular/trusted/vip) is earned
// across every platform that writes the same registries. A verdict here is
// useful to an agent that has never heard of three.ws.
//
// This is the DECISION, not the data: /api/x402/agent-reputation and the
// agent_reputation MCP tool return the raw reputation; this returns an
// admit/refuse verdict + tier against a caller-supplied policy. "x402 handles
// how agents pay; ERC-8004 handles whether they should" — this is the second
// half, as a service any agent can call before paying a counterparty.

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { priceFor } from '../_lib/x402-prices.js';
import { isAddress } from 'ethers';
import { vetAgent, chainNameFor, DEFAULT_CHAIN_ID } from '../_lib/trust/agent-bouncer.js';

const ROUTE = '/api/x402/agent-bouncer';

const DESCRIPTION =
	'three.ws Agent Bouncer — the open-network door check. Given an ERC-8004 ' +
	'agent (agentId, EVM wallet, or eip155:<chain>:<wallet> CAIP-10) and an ' +
	'optional trust policy, read the canonical on-chain Reputation Registry and ' +
	'return an admit/refuse verdict with a door tier (newcomer / regular / ' +
	'trusted / vip). The denylist is the chain’s own negative scores — no ' +
	'private table. Use it to vet a counterparty before paying, hiring, or ' +
	'delegating to it. Pay-per-call in USDC on Base or Solana mainnet.';

// Friendly chain names → chainId. Mirrors the agent_reputation MCP tool so an
// agent can pass the same `chain` either place. CAIP-10 input overrides this.
const CHAIN_IDS = {
	base: 8453,
	ethereum: 1,
	arbitrum: 42161,
	optimism: 10,
	polygon: 137,
	bsc: 56,
	avalanche: 43114,
	celo: 42220,
	linea: 59144,
	scroll: 534352,
};

const INPUT_EXAMPLE = { agent: '1', chain: 'base', min_average: 4, min_count: 3 };

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['agent'],
	properties: {
		agent: {
			type: 'string',
			description:
				'ERC-8004 agentId (uint), EVM wallet (0x…), or CAIP-10 "eip155:<chainId>:<wallet>".',
		},
		chain: {
			type: 'string',
			description:
				'Chain to read (default base). Name (base, ethereum, arbitrum, optimism, polygon, bsc, avalanche, celo, linea, scroll) or numeric chainId. Overridden by a CAIP-10 agent value.',
		},
		min_average: { type: 'number', description: 'Required average score to admit (default 0 = no minimum).' },
		min_count: { type: 'integer', minimum: 0, description: 'Required number of on-chain reviews (default 0).' },
		min_stake_eth: { type: 'number', minimum: 0, description: 'Required total ETH staked on vouches (default 0).' },
		allow_newcomers: {
			type: 'boolean',
			description: 'Admit agents with zero on-chain history (default true).',
		},
	},
};

const OUTPUT_EXAMPLE = {
	ok: true,
	admitted: true,
	banned: false,
	tier: 'trusted',
	reason: null,
	registered: true,
	agentId: '1',
	wallet: null,
	chain: 'Base',
	chainId: 8453,
	registry: 'eip155:8453:0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
	reputation: { average: 4.6, count: 7, totalStakeWei: '2000000000000000', totalStakeEth: 0.002 },
	policy: { minAverage: 4, minCount: 3, minStakeWei: '0', allowNewcomers: true, banNegative: true },
	fetchedAt: '2026-06-22T17:00:00.000Z',
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['ok', 'admitted', 'banned', 'tier', 'reputation', 'chainId'],
	properties: {
		ok: { type: 'boolean', const: true },
		admitted: { type: 'boolean', description: 'true when the agent clears the policy and is not banned.' },
		banned: { type: 'boolean', description: 'true when on a denylist or net-negative on-chain.' },
		tier: {
			type: 'string',
			enum: ['newcomer', 'regular', 'trusted', 'vip', 'banned'],
			description: 'Door tier earned from open-network reputation.',
		},
		reason: { type: ['string', 'null'], description: 'Primary reason when refused; null when admitted.' },
		reasons: { type: 'array', items: { type: 'string' } },
		registered: { type: 'boolean', description: 'false when the wallet has no ERC-8004 identity (a newcomer).' },
		agentId: { type: ['string', 'null'] },
		wallet: { type: ['string', 'null'] },
		chain: { type: 'string' },
		chainId: { type: 'integer' },
		registry: { type: ['string', 'null'], description: 'CAIP-10 id of the Reputation Registry read.' },
		reputation: {
			type: 'object',
			properties: {
				average: { type: 'number' },
				count: { type: 'integer', minimum: 0 },
				totalStakeWei: { type: 'string' },
				totalStakeEth: { type: 'number' },
			},
		},
		policy: { type: 'object' },
		fetchedAt: { type: 'string', format: 'date-time' },
	},
};

const BAZAAR = {
	discoverable: true,
	info: {
		input: { type: 'http', method: 'GET', queryParams: INPUT_EXAMPLE },
		output: { type: 'json', example: OUTPUT_EXAMPLE },
	},
	schema: buildBazaarSchema({
		method: 'GET',
		queryParamsSchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
	}),
};

export const BAZAAR_SCHEMA = BAZAAR;

function badRequest(message, code) {
	const err = new Error(message);
	err.status = 400;
	err.code = code;
	return err;
}

function resolveChainId(input) {
	if (input === undefined || input === null || input === '') return DEFAULT_CHAIN_ID;
	const key = String(input).trim().toLowerCase();
	if (CHAIN_IDS[key]) return CHAIN_IDS[key];
	const id = Number(key);
	if (Number.isInteger(id) && id > 0) return id;
	throw badRequest(`unsupported chain "${input}"`, 'invalid_chain');
}

// Parse the `agent` param into { agentId|wallet, chainId }. A CAIP-10 value
// carries its own chain and overrides the `chain` param.
function parseAgent(raw, defaultChainId) {
	const value = String(raw || '').trim();
	if (!value) throw badRequest('query param "agent" is required', 'missing_agent');
	if (/^\d+$/.test(value)) return { agentId: value, chainId: defaultChainId };
	if (value.toLowerCase().startsWith('eip155:')) {
		const parts = value.split(':');
		if (parts.length !== 3) throw badRequest(`invalid CAIP-10 id "${value}"`, 'invalid_caip10');
		const chainId = resolveChainId(parts[1]);
		if (!isAddress(parts[2])) throw badRequest(`invalid wallet in "${value}"`, 'invalid_wallet');
		return { wallet: parts[2], chainId };
	}
	if (isAddress(value)) return { wallet: value, chainId: defaultChainId };
	throw badRequest(
		`could not parse "${value}" — expected an agentId, 0x wallet, or eip155:<chain>:<wallet>`,
		'invalid_agent',
	);
}

function parseNonNegativeNumber(raw, field) {
	if (raw === undefined || raw === null || raw === '') return 0;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) throw badRequest(`${field} must be a non-negative number`, 'invalid_policy');
	return n;
}

export default paidEndpoint({
	route: ROUTE,
	method: 'GET',
	priceAtomics: priceFor('agent-bouncer', '10000'), // $0.01 USDC
	networks: ['solana', 'base'],
	description: DESCRIPTION,
	bazaar: BAZAAR,
	service: withService({
		serviceName: 'three.ws Agent Bouncer',
		tags: ['reputation', 'erc8004', 'trust', 'gate', 'agent'],
	}),
	requiredScope: 'x402:bypass',
	accessControl: installAccessControl({ requiredScope: 'x402:bypass' }),
	// Buyers with a granted OAuth scope or a fresh SIWX proof skip payment; the
	// USDC accepts apply otherwise — same posture as agent-reputation.
	authHints: {
		oauth2: { requiredScope: 'read:agent-reputation', tokenType: 'Bearer' },
		siwx: true,
	},
	async handler({ req }) {
		const q = req.query || {};
		const defaultChainId = resolveChainId(q.chain);
		const { agentId, wallet, chainId } = parseAgent(q.agent, defaultChainId);

		const minAverage = parseNonNegativeNumber(q.min_average, 'min_average');
		const minCount = Math.floor(parseNonNegativeNumber(q.min_count, 'min_count'));
		const minStakeEth = parseNonNegativeNumber(q.min_stake_eth, 'min_stake_eth');
		const minStakeWei = BigInt(Math.round(minStakeEth * 1e9)) * 1_000_000_000n; // eth → wei, 9-digit precision
		const allowNewcomers = q.allow_newcomers === undefined ? true : q.allow_newcomers !== 'false';

		const policy = {
			minAverage,
			minCount,
			minStakeWei,
			allowNewcomers,
			banNegative: true,
		};

		let verdict;
		try {
			verdict = await vetAgent({ agentId, wallet, chainId, policy });
		} catch (err) {
			// An on-chain read failure must not masquerade as "refused" — surface it
			// as an upstream error so the caller knows the verdict is unknown, not no.
			const e = new Error(`reputation read failed: ${err.message}`);
			e.status = 502;
			e.code = 'reputation_unavailable';
			throw e;
		}

		return {
			ok: true,
			admitted: verdict.admitted,
			banned: verdict.banned,
			tier: verdict.tier,
			reason: verdict.reason,
			reasons: verdict.reasons,
			registered: verdict.registered,
			agentId: verdict.agentId,
			wallet: verdict.wallet,
			chain: chainNameFor(chainId),
			chainId,
			registry: verdict.registry,
			reputation: verdict.reputation,
			policy: {
				minAverage,
				minCount,
				minStakeWei: minStakeWei.toString(),
				allowNewcomers,
				banNegative: true,
			},
			fetchedAt: new Date().toISOString(),
		};
	},
});
