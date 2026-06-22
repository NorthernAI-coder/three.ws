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
import { loadAgentReputation } from '../_lib/trust/solana-bouncer.js';

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

export default paidEndpoint({
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
