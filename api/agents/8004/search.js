// GET /api/agents/8004/search
//   ?chain=8453|84532|11155111|1|137 (default 8453)
//   &q=<search-string>                (optional — filters by metadata text)
//   &limit=<1..50>                    (default 20)
//
// Lists ERC-8004 agents from the public Agent0 subgraph for the given chain.
// Used by /demos/erc8004 — no auth, read-only.

import { SDK, DEFAULT_REGISTRIES } from 'agent0-sdk';
import { cors, method, error, wrap, json } from '../../_lib/http.js';

export const maxDuration = 30;

const SUPPORTED_CHAINS = Object.keys(DEFAULT_REGISTRIES).map(Number);

export default wrap(async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (method(req, res, ['GET'])) return;

	const url = new URL(req.url, 'http://x');
	const chainId = Number(url.searchParams.get('chain') || 8453);
	if (!SUPPORTED_CHAINS.includes(chainId)) {
		return error(res, 400, 'unsupported_chain',
			`chain ${chainId} not supported`, { supported: SUPPORTED_CHAINS });
	}
	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
	const q = (url.searchParams.get('q') || '').trim().slice(0, 200);

	let sdk;
	try {
		sdk = new SDK({ chainId });
	} catch (e) {
		return error(res, 500, 'sdk_init_failed', e?.message || 'SDK init failed');
	}

	let agents;
	try {
		agents = await sdk.searchAgents(
			q ? { keyword: q } : undefined,
			{ limit, chainIds: [chainId] },
		);
	} catch (e) {
		return error(res, 502, 'subgraph_error', e?.message || 'subgraph query failed');
	}

	const result = (agents || []).map((a) => ({
		agentId: a.agentId,
		chainId: a.chainId ?? chainId,
		address: a.address || null,
		owner: a.owner || null,
		name: a.name || null,
		description: a.description || null,
		registrationUri: a.registrationUri || null,
		registeredAtSeconds: a.registeredAtSeconds || null,
		feedbackCount: a.feedbackCount ?? null,
		averageRating: a.averageRating ?? null,
		walletAddresses: a.walletAddresses || null,
		endpoints: a.endpoints || null,
	}));

	json(res, 200, {
		chainId,
		query: q || null,
		count: result.length,
		agents: result,
	}, { 'cache-control': 'public, max-age=30, stale-while-revalidate=120' });
});
