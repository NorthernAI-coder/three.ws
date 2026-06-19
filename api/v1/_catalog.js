// Single source of truth for the unified three.ws API (/api/v1).
//
// Every versioned endpoint is registered here once. The discovery document
// (GET /api/v1) renders from this list, so the catalog and the live surface can
// never drift: adding a route means adding its entry here AND its handler file.
//
// Each entry:
//   id      stable usage/billing identifier (matches the handler's `name`)
//   method  HTTP method(s)
//   path    public path under the API base
//   auth    'public' | 'optional' | 'required'
//   scope   OAuth scope enforced for key/OAuth callers (when auth ≠ public)
//   summary one line, holder/developer readable
//   params  documented inputs (query for GET, body for POST)

export const API_META = {
	name: 'three.ws API',
	version: 'v1',
	base_url: '/api/v1',
	description:
		'One API for the three.ws platform: 3D generation, market & narrative intelligence, ' +
		'sentiment, and on-chain agent capabilities — one key, one rate-limit budget, one usage ledger.',
	auth: {
		scheme: 'Bearer',
		description:
			'Send a three.ws API key as `Authorization: Bearer sk_live_…`, an OAuth access token, ' +
			'or call from a signed-in browser session. Create and manage keys at /dashboard/developers.',
		scopes: [
			'avatars:read',
			'avatars:write',
			'avatars:delete',
			'profile',
			'memory:read',
			'memory:write',
			'agents:read',
			'agents:write',
		],
	},
	rate_limit: {
		window: '1m',
		limit: 120,
		keyed_by: 'api_key › user › ip',
		headers: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
	},
	envelope: {
		success: '{ "data": … }',
		error: '{ "error": <code>, "error_description": <message> }',
	},
};

export const CATALOG = [
	{
		id: 'v1.sentiment',
		method: 'POST',
		path: '/api/v1/sentiment',
		auth: 'public',
		summary: 'Classify text sentiment (Positive / Negative / Neutral) with a deterministic score.',
		params: { text: 'string — the text to score (required)' },
	},
	{
		id: 'v1.market.intel',
		method: 'GET',
		path: '/api/v1/market/intel',
		auth: 'optional',
		scope: 'agents:read',
		summary: 'Recent narrative / market intelligence items, momentum-ranked.',
		params: {
			limit: 'number 1–50 (default 20)',
			category: 'string — filter by category (optional)',
			chain: 'string — filter by chain (optional)',
		},
	},
	{
		id: 'v1.market.projects',
		method: 'GET',
		path: '/api/v1/market/projects',
		auth: 'optional',
		scope: 'agents:read',
		summary: 'Momentum-ranked crypto projects with narrative scores.',
		params: {
			limit: 'number 1–50 (default 20)',
			page: 'number (default 1)',
			names: 'string — comma-separated project names to filter (optional)',
			chain: 'string — filter by chain (optional)',
		},
	},
	{
		id: 'v1.agents.resolve',
		method: 'GET',
		path: '/api/v1/agents/{caip}',
		auth: 'public',
		summary:
			'Resolve + verify an ERC-8004 / three.ws Card v1 agent by CAIP ref ' +
			'(eip155:<chainId>:<registry>/<tokenId>, URL-encoded).',
		params: { caip: 'path — URL-encoded CAIP agent ref (required)' },
	},
];
