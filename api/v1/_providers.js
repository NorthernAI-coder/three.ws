// Upstream provider registry for the three.ws aggregator (/api/v1/x/*).
//
// This is the single source of truth for every THIRD-PARTY API three.ws
// bundles and re-offers as one API. Adding a new upstream — or a new endpoint
// on an existing one — is a descriptor here; no new route file, no new
// plumbing. The catch-all route (api/v1/x/[...slug].js) resolves a request
// against this registry and the aggregator engine (api/_lib/aggregator.js)
// runs it through one auth / rate-limit / metering / billing path.
//
// Provider descriptor:
//   id          url-safe slug (first path segment under /api/v1/x)
//   name        human label
//   category    grouping for discovery
//   base        upstream base URL (no trailing slash)
//   requiresKey true when the upstream needs an API key to function at all
//   envVar      env var holding three.ws's platform key for this upstream
//   byokHeader  request header a caller uses to supply THEIR OWN upstream key
//   applyKey    (headers, url, key) => void — places a key where the upstream wants it
//   endpoints   array of endpoint descriptors:
//     id        url-safe slug (second path segment)
//     method    'GET' | 'POST'
//     path      string, or (query) => string for path params
//     query     (query) => object of upstream query params (GET)
//     body      (body) => object forwarded as the upstream JSON body (POST)
//     transform (data) => normalized response (default: passthrough)
//     priceAtomics  x402 price in USDC atomics (6 decimals; "1000" = $0.001)
//     scope     three.ws OAuth scope required for the plan-billing path
//     summary   one line for discovery
//     params    documented inputs for discovery

function required(value, name) {
	const v = value == null ? '' : String(value).trim();
	if (!v) {
		const err = new Error(`query param "${name}" is required`);
		err.status = 400;
		err.code = 'missing_param';
		throw err;
	}
	return v;
}

export const PROVIDERS = [
	{
		id: 'coingecko',
		name: 'CoinGecko',
		category: 'crypto-market-data',
		base: 'https://api.coingecko.com/api/v3',
		requiresKey: false,
		// CoinGecko's optional Pro key lifts rate limits; works key-free otherwise.
		envVar: 'COINGECKO_API_KEY',
		byokHeader: 'x-provider-key',
		applyKey: (headers, _url, key) => {
			if (key) headers['x-cg-pro-api-key'] = key;
		},
		endpoints: [
			{
				id: 'price',
				method: 'GET',
				path: '/simple/price',
				query: (q) => ({
					ids: required(q.ids, 'ids'),
					vs_currencies: q.vs_currencies || 'usd',
					include_24hr_change: q.include_24hr_change,
					include_market_cap: q.include_market_cap,
				}),
				priceAtomics: '1000',
				scope: 'agents:read',
				summary: 'Spot price for one or more coins in any fiat/crypto.',
				params: {
					ids: 'comma-separated CoinGecko coin ids, e.g. "solana,bitcoin" (required)',
					vs_currencies: 'comma-separated quote currencies (default "usd")',
					include_24hr_change: 'true to include 24h change',
					include_market_cap: 'true to include market cap',
				},
			},
			{
				id: 'markets',
				method: 'GET',
				path: '/coins/markets',
				query: (q) => ({
					vs_currency: q.vs_currency || 'usd',
					ids: q.ids,
					order: q.order || 'market_cap_desc',
					per_page: Math.min(Math.max(1, Number(q.per_page) || 20), 100),
					page: Number(q.page) || 1,
					price_change_percentage: q.price_change_percentage,
				}),
				priceAtomics: '2000',
				scope: 'agents:read',
				summary: 'Ranked market data (price, market cap, volume, change) per coin.',
				params: {
					vs_currency: 'quote currency (default "usd")',
					ids: 'comma-separated coin ids to filter (optional)',
					order: 'sort order (default "market_cap_desc")',
					per_page: 'number 1–100 (default 20)',
					page: 'page number (default 1)',
				},
			},
		],
	},
	{
		id: 'defillama',
		name: 'DefiLlama',
		category: 'defi-data',
		base: 'https://api.llama.fi',
		requiresKey: false,
		envVar: null,
		byokHeader: null,
		applyKey: () => {},
		endpoints: [
			{
				id: 'protocols',
				method: 'GET',
				path: '/protocols',
				query: () => ({}),
				// DefiLlama returns ~3k protocols; slim to the fields callers actually
				// use so one call doesn't ship a multi-MB payload.
				transform: (data) =>
					Array.isArray(data)
						? data
								.map((p) => ({
									name: p.name,
									symbol: p.symbol,
									category: p.category,
									chains: p.chains,
									tvl: p.tvl,
									change_1d: p.change_1d,
									change_7d: p.change_7d,
									mcap: p.mcap,
								}))
								.sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
						: data,
				priceAtomics: '1000',
				scope: 'agents:read',
				summary: 'All DeFi protocols with current TVL, ranked.',
				params: {},
			},
			{
				id: 'tvl',
				method: 'GET',
				path: (q) => `/tvl/${encodeURIComponent(required(q.protocol, 'protocol'))}`,
				query: () => ({}),
				transform: (data) => ({ tvl_usd: typeof data === 'number' ? data : Number(data) }),
				priceAtomics: '1000',
				scope: 'agents:read',
				summary: 'Current total value locked (USD) for a single protocol.',
				params: { protocol: 'DefiLlama protocol slug, e.g. "uniswap" (required)' },
			},
		],
	},
	{
		id: 'openai',
		name: 'OpenAI-compatible LLM',
		category: 'ai-inference',
		base: 'https://api.openai.com/v1',
		requiresKey: true,
		envVar: 'OPENAI_API_KEY',
		byokHeader: 'x-provider-key',
		applyKey: (headers, _url, key) => {
			if (key) headers['authorization'] = `Bearer ${key}`;
		},
		endpoints: [
			{
				id: 'chat',
				method: 'POST',
				path: '/chat/completions',
				body: (b) => {
					if (!b || typeof b !== 'object' || !Array.isArray(b.messages)) {
						const err = new Error('body must include a "messages" array');
						err.status = 400;
						err.code = 'validation_error';
						throw err;
					}
					return b;
				},
				priceAtomics: '5000',
				scope: 'agents:write',
				summary: 'Chat completions against any OpenAI-compatible model (BYOK supported).',
				params: {
					model: 'model id (required)',
					messages: 'array of {role, content} (required)',
					'…': 'any other OpenAI chat-completions parameter is forwarded',
				},
			},
		],
	},
];

// Flat lookup map: "provider/endpoint" → { provider, endpoint }.
export const ENDPOINT_INDEX = new Map();
for (const provider of PROVIDERS) {
	for (const endpoint of provider.endpoints) {
		ENDPOINT_INDEX.set(`${provider.id}/${endpoint.id}`, { provider, endpoint });
	}
}

/** Machine-readable catalog of every aggregated endpoint, for discovery. */
export function providerCatalog() {
	return PROVIDERS.map((p) => ({
		id: p.id,
		name: p.name,
		category: p.category,
		key: p.requiresKey ? 'required (platform key or BYOK)' : 'optional',
		byok: Boolean(p.byokHeader),
		endpoints: p.endpoints.map((e) => ({
			id: e.id,
			method: e.method,
			path: `/api/v1/x/${p.id}/${e.id}`,
			scope: e.scope,
			price_usdc_atomics: e.priceAtomics,
			summary: e.summary,
			params: e.params,
		})),
	}));
}
