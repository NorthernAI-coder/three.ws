// GET /api/x402/agent-reputation?agent_id=<uuid>
//
// Paid endpoint cataloged by the CDP x402 Bazaar. For $0.01 USDC the server
// returns a reputation snapshot for a three.ws agent: total USDC paid in
// to its pump-agent tokens, distinct payer wallets, deployed mint count,
// distribution success rate, and Solana attestation counts.
//
// Why this is defensible: three.ws indexes every pump.fun agent-payments
// acceptPayment call (pump_agent_payments), every distributePayments cron
// run (pump_distribute_runs), and every signed Solana memo attestation
// (solana_attestations) for agents that registered through us. No other
// service has this combined index, so reputation queries here are the
// canonical source for any AI agent vetting a three.ws-registered agent.

import { paidEndpoint } from '../_lib/x402-paid-endpoint.js';
import { buildBazaarSchema } from '../_lib/x402-spec.js';
import { installAccessControl } from '../_lib/x402/access-control.js';
import { withService } from '../_lib/x402/bazaar-helpers.js';
import { priceFor } from '../_lib/x402-prices.js';
import { isUuid } from '../_lib/validate.js';
// Shared with /api/x402/agent-bouncer so the raw reputation snapshot and the
// admit/refuse verdict are computed from one source of truth.
import {
	loadAgentReputation,
	sweepAgentReputation,
	REPUTATION_FLAG_THRESHOLD,
} from '../_lib/trust/solana-bouncer.js';

const ROUTE = '/api/x402/agent-reputation';

const DESCRIPTION =
	'three.ws Agent Reputation — given a three.ws agent_id, return a reputation ' +
	'snapshot synthesized from on-chain pump.fun agent-payments activity, ' +
	'distribute/buyback success history, and signed Solana memo attestations. ' +
	'Use to vet a counterparty before paying, trading, or composing skills. ' +
	'Reputation is built from real on-chain data three.ws indexes — not a ' +
	'subjective score. Pay-per-call in USDC on Base or Solana mainnet.';

const INPUT_EXAMPLE = { agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55' };

const INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['agent_id'],
	properties: {
		agent_id: {
			type: 'string',
			format: 'uuid',
			description: 'three.ws agent_id (UUID). Returned by /api/agents and /api/agent-page.',
		},
	},
};

const OUTPUT_EXAMPLE = {
	agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
	name: 'Helios',
	wallet_address: 'wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU',
	deployed_mints: 2,
	mints: [
		{ mint: 'C3vQ...', network: 'mainnet', symbol: 'HELIO' },
		{ mint: 'F7kX...', network: 'mainnet', symbol: 'SUNUP' },
	],
	payments: {
		confirmed_count: 142,
		confirmed_amount_atomics: '142000000',
		distinct_payers: 87,
		failed_count: 3,
		failure_rate: 0.021,
	},
	distributions: {
		confirmed: 12,
		failed: 1,
		success_rate: 0.923,
	},
	buybacks: {
		confirmed: 5,
		failed: 0,
		total_burn_atomics: '500000000',
	},
	attestations: {
		feedback_count: 14,
		validation_count: 8,
		latest_attested_at: '2026-05-12T08:21:00Z',
	},
	indexed_at: '2026-05-14T17:00:00Z',
};

const OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['agent_id', 'deployed_mints', 'payments', 'distributions', 'buybacks', 'attestations'],
	properties: {
		agent_id: { type: 'string', format: 'uuid' },
		name: { type: ['string', 'null'] },
		wallet_address: { type: ['string', 'null'] },
		deployed_mints: { type: 'integer', minimum: 0 },
		mints: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					mint: { type: 'string' },
					network: { type: 'string' },
					symbol: { type: ['string', 'null'] },
				},
			},
		},
		payments: {
			type: 'object',
			properties: {
				confirmed_count: { type: 'integer' },
				confirmed_amount_atomics: { type: 'string' },
				distinct_payers: { type: 'integer' },
				failed_count: { type: 'integer' },
				failure_rate: { type: 'number' },
			},
		},
		distributions: {
			type: 'object',
			properties: {
				confirmed: { type: 'integer' },
				failed: { type: 'integer' },
				success_rate: { type: 'number' },
			},
		},
		buybacks: {
			type: 'object',
			properties: {
				confirmed: { type: 'integer' },
				failed: { type: 'integer' },
				total_burn_atomics: { type: 'string' },
			},
		},
		attestations: {
			type: 'object',
			properties: {
				feedback_count: { type: 'integer' },
				validation_count: { type: 'integer' },
				latest_attested_at: { type: ['string', 'null'] },
			},
		},
		indexed_at: { type: 'string', format: 'date-time' },
	},
};

const BAZAAR = {
	discoverable: true,
	info: {
		input: {
			type: 'http',
			method: 'GET',
			queryParams: INPUT_EXAMPLE,
		},
		output: { type: 'json', example: OUTPUT_EXAMPLE },
	},
	schema: buildBazaarSchema({
		method: 'GET',
		queryParamsSchema: INPUT_SCHEMA,
		outputSchema: OUTPUT_SCHEMA,
	}),
};

const singleEndpoint = paidEndpoint({
	route: ROUTE,
	method: 'GET',
	priceAtomics: priceFor('agent-reputation', '10000'),
	networks: ['base', 'solana'],
	description: DESCRIPTION,
	bazaar: BAZAAR,
	service: withService({
		serviceName: 'three.ws Agent Reputation',
		tags: ['reputation', 'agent', 'solana', 'attestation', 'trust'],
	}),
	requiredScope: 'x402:bypass',
	accessControl: installAccessControl({ requiredScope: 'x402:bypass' }),
	// USE-21: declare auth-hints. Buyers with an OAuth2 access token granted
	// scope `read:agent-reputation` skip payment, as do wallets that present
	// a fresh CAIP-122 SIGN-IN-WITH-X proof for this resource. Without either,
	// the regular USDC accepts entries apply.
	authHints: {
		oauth2: { requiredScope: 'read:agent-reputation', tokenType: 'Bearer' },
		siwx: true,
	},
	async handler({ req }) {
		const agentId = String(req.query?.agent_id || '').trim().toLowerCase();
		if (!agentId) {
			const err = new Error('query param "agent_id" is required');
			err.status = 400;
			err.code = 'missing_agent_id';
			throw err;
		}
		if (!isUuid(agentId)) {
			const err = new Error('agent_id must be a UUID');
			err.status = 400;
			err.code = 'invalid_agent_id';
			throw err;
		}
		return loadAgentReputation(agentId);
	},
});

// ── Sweep mode (POST) ────────────────────────────────────────────────────────
// A single $0.01 call returns scored reputation for the N most recently active
// three.ws agents instead of one. Built for fleet-level trust monitoring: a
// vetting agent (or our own autonomous loop) gets the live average trust score
// and the set of low-reputation agents (score < REPUTATION_FLAG_THRESHOLD)
// flagged for review, without paying per agent.

const SWEEP_DEFAULT_LIMIT = 20;
const SWEEP_MAX_LIMIT = 50;

const SWEEP_DESCRIPTION =
	'three.ws Agent Reputation (Active Sweep) — POST {"mode":"sweep","limit":N} ' +
	'to score the N most recently active three.ws agents in one call. Returns the ' +
	'fleet average trust score (0..100) and the agents flagged for review ' +
	`(score < ${REPUTATION_FLAG_THRESHOLD}). Each score is synthesized from real ` +
	'on-chain pump.fun agent-payments activity, distribute/buyback success history, ' +
	'and signed Solana memo attestations — not a subjective rating. Use to monitor ' +
	'counterparty trust across the platform before composing skills or routing payments.';

const SWEEP_INPUT_EXAMPLE = { mode: 'sweep', limit: 20 };

const SWEEP_INPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: {
		mode: { type: 'string', enum: ['sweep'], description: 'Must be "sweep".' },
		limit: {
			type: 'integer',
			minimum: 1,
			maximum: SWEEP_MAX_LIMIT,
			description: `Agents to sweep (default ${SWEEP_DEFAULT_LIMIT}, max ${SWEEP_MAX_LIMIT}).`,
		},
	},
};

const SWEEP_OUTPUT_EXAMPLE = {
	mode: 'sweep',
	count: 20,
	avg_score: 64,
	flagged_count: 3,
	flagged: [
		{
			agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
			name: 'Newcomer',
			score: 12,
			reasons: ['no confirmed payments on record', 'no signed attestations'],
		},
	],
	agents: [
		{
			agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
			name: 'Helios',
			wallet_address: 'wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU',
			deployed_mints: 2,
			score: 88,
			flagged: false,
			reasons: [],
			breakdown: { payments: 40, distributions: 14, buybacks: 15, attestations: 19 },
			last_active_at: '2026-06-26T17:00:00Z',
		},
	],
	swept_at: '2026-06-27T17:00:00Z',
};

const SWEEP_OUTPUT_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	required: ['mode', 'count', 'avg_score', 'flagged_count', 'agents'],
	properties: {
		mode: { type: 'string', enum: ['sweep'] },
		count: { type: 'integer', minimum: 0 },
		avg_score: { type: 'integer', minimum: 0, maximum: 100 },
		flagged_count: { type: 'integer', minimum: 0 },
		flagged: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					agent_id: { type: 'string', format: 'uuid' },
					name: { type: ['string', 'null'] },
					score: { type: 'integer', minimum: 0, maximum: 100 },
					reasons: { type: 'array', items: { type: 'string' } },
				},
			},
		},
		agents: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					agent_id: { type: 'string', format: 'uuid' },
					name: { type: ['string', 'null'] },
					wallet_address: { type: ['string', 'null'] },
					deployed_mints: { type: 'integer', minimum: 0 },
					score: { type: 'integer', minimum: 0, maximum: 100 },
					flagged: { type: 'boolean' },
					reasons: { type: 'array', items: { type: 'string' } },
					breakdown: { type: 'object' },
					last_active_at: { type: ['string', 'null'] },
				},
			},
		},
		swept_at: { type: 'string', format: 'date-time' },
	},
};

const SWEEP_BAZAAR = {
	discoverable: true,
	info: {
		input: {
			type: 'http',
			method: 'POST',
			bodyType: 'json',
			body: SWEEP_INPUT_EXAMPLE,
		},
		output: { type: 'json', example: SWEEP_OUTPUT_EXAMPLE },
	},
	schema: buildBazaarSchema({
		method: 'POST',
		bodySchema: SWEEP_INPUT_SCHEMA,
		outputSchema: SWEEP_OUTPUT_SCHEMA,
	}),
};

// Read + parse the JSON body off the raw request stream (same idiom as the
// other POST x402 endpoints — req.body is not pre-parsed in this runtime).
async function readJsonBody(req) {
	const chunks = [];
	for await (const c of req) chunks.push(c);
	if (!chunks.length) return {};
	return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const sweepEndpoint = paidEndpoint({
	route: ROUTE,
	method: 'POST',
	priceAtomics: priceFor('agent-reputation', '10000'),
	networks: ['base', 'solana'],
	description: SWEEP_DESCRIPTION,
	bazaar: SWEEP_BAZAAR,
	service: withService({
		serviceName: 'three.ws Agent Reputation (Active Sweep)',
		tags: ['reputation', 'agent', 'solana', 'attestation', 'trust', 'monitoring'],
	}),
	requiredScope: 'x402:bypass',
	accessControl: installAccessControl({ requiredScope: 'x402:bypass' }),
	authHints: {
		oauth2: { requiredScope: 'read:agent-reputation', tokenType: 'Bearer' },
		siwx: true,
	},
	async handler({ req }) {
		let body;
		try {
			body = await readJsonBody(req);
		} catch {
			const err = new Error('request body must be valid JSON');
			err.status = 400;
			err.code = 'invalid_json';
			throw err;
		}
		if (body.mode !== 'sweep') {
			const err = new Error('mode must be "sweep"');
			err.status = 400;
			err.code = 'invalid_mode';
			throw err;
		}
		const limit = body.limit == null ? SWEEP_DEFAULT_LIMIT : Number(body.limit);
		if (!Number.isFinite(limit) || limit < 1) {
			const err = new Error('limit must be a positive integer');
			err.status = 400;
			err.code = 'invalid_limit';
			throw err;
		}
		return sweepAgentReputation({ limit: Math.min(SWEEP_MAX_LIMIT, Math.floor(limit)) });
	},
});

// Route by method so one path serves both the single-agent lookup (GET) and the
// active-agent sweep (POST). OPTIONS preflight is dispatched by the requested
// method so each mode advertises the correct Access-Control-Allow-Methods.
export default function agentReputationRouter(req, res) {
	const method = String(req.method || 'GET').toUpperCase();
	if (method === 'POST') return sweepEndpoint(req, res);
	if (method === 'OPTIONS') {
		const requested = String(req.headers['access-control-request-method'] || '').toUpperCase();
		return requested === 'POST' ? sweepEndpoint(req, res) : singleEndpoint(req, res);
	}
	return singleEndpoint(req, res);
}
