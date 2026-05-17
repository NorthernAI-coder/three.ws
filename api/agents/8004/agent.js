// GET /api/agents/8004/agent?chain=8453&id=<agentId>
//
// Returns the full AgentSummary for a single ERC-8004 agent. The agentId is the
// numeric token id from the registry on the given chain.

import { SDK, DEFAULT_REGISTRIES } from 'agent0-sdk';
import { cors, method, error, wrap, json } from '../../_lib/http.js';

export const maxDuration = 30;

const SUPPORTED_CHAINS = Object.keys(DEFAULT_REGISTRIES).map(Number);

export default wrap(async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (method(req, res, ['GET'])) return;

	const url = new URL(req.url, 'http://x');
	const chainId = Number(url.searchParams.get('chain') || 8453);
	const idRaw = (url.searchParams.get('id') || '').trim();

	if (!SUPPORTED_CHAINS.includes(chainId)) {
		return error(res, 400, 'unsupported_chain',
			`chain ${chainId} not supported`, { supported: SUPPORTED_CHAINS });
	}
	if (!idRaw || !/^\d+$/.test(idRaw)) {
		return error(res, 400, 'bad_id', 'id must be a positive integer (numeric agentId)');
	}

	let sdk;
	try {
		sdk = new SDK({ chainId });
	} catch (e) {
		return error(res, 500, 'sdk_init_failed', e?.message || 'SDK init failed');
	}

	let agent;
	try {
		agent = await sdk.getAgent({ chainId, agentId: BigInt(idRaw) });
	} catch (e) {
		return error(res, 502, 'lookup_failed', e?.message || 'agent lookup failed');
	}

	if (!agent) return error(res, 404, 'not_found', `agent #${idRaw} not found on chain ${chainId}`);

	const safe = JSON.parse(JSON.stringify(agent, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

	json(res, 200, { chainId, agentId: idRaw, agent: safe },
		{ 'cache-control': 'public, max-age=30, stale-while-revalidate=120' });
});
