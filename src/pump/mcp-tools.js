// Shared, runtime-agnostic MCP tool definitions for the pump.fun MCP server.
// Imported by both the Vercel handler (api/pump-fun-mcp.js) and the
// Cloudflare Workers mirror (workers/pump-fun-mcp/worker.js).
// No imports — pure data and pure helpers only.

// ── MCP ToolAnnotations (spec: readOnlyHint/destructiveHint/idempotentHint/
// openWorldHint). Every tool on this surface is read-only — nothing signs or
// sends a transaction. destructiveHint defaults to TRUE in the spec when
// omitted, so it is set explicitly everywhere.
//
//  LIVE_READ           live-market / on-chain read: same call can return new
//                      data, talks to external systems.
//  DETERMINISTIC_READ  external read whose answer is stable for the same args
//                      (name-service lookups).
//  LOCAL_DETERMINISTIC pure in-process computation, stable output (lexicon
//                      sentiment scoring).
//  LOCAL_GENERATIVE    pure in-process computation, fresh output each call
//                      (vanity keypair grind).
const LIVE_READ = Object.freeze({
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: false,
	openWorldHint: true,
});
const DETERMINISTIC_READ = Object.freeze({
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: true,
});
const LOCAL_DETERMINISTIC = Object.freeze({
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
});
const LOCAL_GENERATIVE = Object.freeze({
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: false,
	openWorldHint: false,
});

// Canonical (snake_case) tool name ← legacy (camelCase) alias. tools/list only
// ever advertises the canonical names; tools/call accepts BOTH forever. This
// map is the single source of truth for that aliasing — the Vercel handler,
// the Cloudflare Worker, and the npm bridge all resolve through it (the bridge
// ships a vendored copy in packages/pumpfun-mcp/src/tools.js).
export const TOOL_NAME_ALIASES = Object.freeze({
	searchTokens: 'search_tokens',
	getTokenDetails: 'get_token_details',
	getBondingCurve: 'get_bonding_curve',
	getTokenTrades: 'get_token_trades',
	getTrendingTokens: 'get_trending_tokens',
	getNewTokens: 'get_new_tokens',
	getGraduatedTokens: 'get_graduated_tokens',
	getKingOfTheHill: 'get_king_of_the_hill',
	getCreatorProfile: 'get_creator_profile',
	getTokenHolders: 'get_token_holders',
});

// Resolve a tools/call name to its canonical form. Unknown names pass through
// unchanged so the dispatcher's own unknown-tool error still fires. hasOwn
// guard: "__proto__"/"constructor" must not resolve an inherited member.
export function resolveToolName(name) {
	if (typeof name === 'string' && Object.hasOwn(TOOL_NAME_ALIASES, name)) {
		return TOOL_NAME_ALIASES[name];
	}
	return name;
}

// name → { title, ...ToolAnnotations }. Applied onto TOOLS below; exported so
// runtimes (and the npm bridge) can overlay the same map on older tool lists.
// Keys are the canonical snake_case names — overlay callers resolve legacy
// names through TOOL_NAME_ALIASES first.
export const TOOL_ANNOTATIONS = Object.freeze({
	search_tokens: { title: 'Search Tokens', ...LIVE_READ },
	get_token_details: { title: 'Token Details', ...LIVE_READ },
	get_bonding_curve: { title: 'Bonding Curve', ...LIVE_READ },
	get_token_trades: { title: 'Token Trades', ...LIVE_READ },
	get_trending_tokens: { title: 'Trending Tokens', ...LIVE_READ },
	get_new_tokens: { title: 'New Tokens', ...LIVE_READ },
	get_graduated_tokens: { title: 'Graduated Tokens', ...LIVE_READ },
	get_king_of_the_hill: { title: 'King of the Hill', ...LIVE_READ },
	kol_radar: { title: 'KOL Radar', ...LIVE_READ },
	get_creator_profile: { title: 'Creator Profile', ...LIVE_READ },
	get_token_holders: { title: 'Token Holders', ...LIVE_READ },
	pumpfun_vanity_mint: { title: 'Vanity Mint Keypair', ...LOCAL_GENERATIVE },
	pumpfun_watch_whales: { title: 'Watch Whale Trades', ...LIVE_READ },
	pumpfun_list_claims: { title: 'List Creator Fee Claims', ...LIVE_READ },
	pumpfun_watch_claims: { title: 'Watch Creator Fee Claims', ...LIVE_READ },
	pumpfun_first_claims: { title: 'First Creator Fee Claims', ...LIVE_READ },
	sns_resolve: { title: 'Resolve .sol Domain', ...DETERMINISTIC_READ },
	sns_reverseLookup: { title: 'Reverse .sol Lookup', ...DETERMINISTIC_READ },
	social_cashtag_sentiment: { title: 'Cashtag Sentiment', ...LOCAL_DETERMINISTIC },
	kol_leaderboard: { title: 'KOL Leaderboard', ...LIVE_READ },
	pumpfun_quote_swap: { title: 'Swap Quote (Read-Only)', ...LIVE_READ },
	social_x_post_impact: { title: 'X Post Price Impact', ...LIVE_READ },
	pumpfun_bot_status: { title: 'Indexer Status', ...LIVE_READ },
});

// outputSchema policy: only tools whose response shape is code-controlled and
// genuinely stable advertise one (sns_resolve, sns_reverseLookup,
// social_cashtag_sentiment, pumpfun_vanity_mint, pumpfun_quote_swap,
// get_bonding_curve). Indexer/upstream-shaped passthroughs (search_tokens,
// get_token_details, get_token_trades, get_trending_tokens, get_new_tokens,
// get_graduated_tokens, get_king_of_the_hill, get_creator_profile,
// get_token_holders, kol_*, pumpfun_*_claims, pumpfun_watch_whales,
// social_x_post_impact) deliberately ship NO outputSchema — their payloads
// mirror upstream feeds / multi-source on-chain decoders that can evolve, and
// a wrong schema is worse than none.
export const TOOLS = [
	{
		name: 'search_tokens',
		description: 'Search pump.fun tokens by name, symbol, or mint address.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string' },
				limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
			},
			required: ['query'],
		},
	},
	{
		name: 'get_token_details',
		description: 'Full details for a specific pump.fun token by mint address.',
		inputSchema: {
			type: 'object',
			properties: { mint: { type: 'string' } },
			required: ['mint'],
		},
	},
	{
		name: 'get_bonding_curve',
		description:
			'Bonding curve analysis: real reserves, virtual reserves, and graduation progress (on-chain).',
		inputSchema: {
			type: 'object',
			properties: {
				mint: { type: 'string' },
				network: { type: 'string', enum: ['mainnet', 'devnet'], default: 'mainnet' },
			},
			required: ['mint'],
		},
		outputSchema: {
			type: 'object',
			properties: {
				mint: { type: 'string' },
				network: { type: 'string' },
				complete: { type: 'boolean', description: 'true once the curve has graduated' },
				graduationPercent: { type: 'number', description: '0–100 graduation progress' },
				solReserves: { type: 'string', description: 'Real SOL reserves in SOL (4-decimal string)' },
				tokenReserves: { type: 'string', description: 'Real token reserves (raw base units)' },
				virtualSolReserves: { type: 'string', description: 'Virtual SOL reserves (lamports)' },
				virtualTokenReserves: { type: 'string', description: 'Virtual token reserves (raw base units)' },
			},
			required: [
				'mint',
				'network',
				'complete',
				'graduationPercent',
				'solReserves',
				'tokenReserves',
				'virtualSolReserves',
				'virtualTokenReserves',
			],
			additionalProperties: true,
		},
	},
	{
		name: 'get_token_trades',
		description: 'Recent buy/sell history for a token.',
		inputSchema: {
			type: 'object',
			properties: {
				mint: { type: 'string' },
				limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
			},
			required: ['mint'],
		},
	},
	{
		name: 'get_trending_tokens',
		description: 'Top pump.fun tokens by market cap.',
		inputSchema: {
			type: 'object',
			properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
		},
	},
	{
		name: 'get_new_tokens',
		description: 'Most recently launched pump.fun tokens.',
		inputSchema: {
			type: 'object',
			properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
		},
	},
	{
		name: 'get_graduated_tokens',
		description: 'Tokens that graduated from the bonding curve to Raydium AMM.',
		inputSchema: {
			type: 'object',
			properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
		},
	},
	{
		name: 'get_king_of_the_hill',
		description: 'Highest-market-cap token still on the bonding curve.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'kol_radar',
		description:
			'gmgn radar signals: early-detection patterns filtered by category, sorted by score desc.',
		inputSchema: {
			type: 'object',
			properties: {
				category: {
					type: 'string',
					enum: ['pump-fun', 'new-mints', 'volume-spike'],
					default: 'pump-fun',
				},
				limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
			},
		},
	},
	{
		name: 'get_creator_profile',
		description: 'All tokens by a creator wallet, with rug-pull risk flags.',
		inputSchema: {
			type: 'object',
			properties: { creator: { type: 'string' } },
			required: ['creator'],
		},
	},
	{
		name: 'get_token_holders',
		description: 'Top holders of a token with concentration analysis (on-chain).',
		inputSchema: {
			type: 'object',
			properties: {
				mint: { type: 'string' },
				limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
				network: { type: 'string', enum: ['mainnet', 'devnet'], default: 'mainnet' },
			},
			required: ['mint'],
		},
	},
	{
		name: 'pumpfun_vanity_mint',
		description:
			'Generate a Solana keypair whose address ends/starts with a vanity pattern. Returns publicKey + secretKey (base58). Caller must save the secret key immediately — it is never stored. Hard timeout: 60 s.',
		inputSchema: {
			type: 'object',
			properties: {
				suffix: { type: 'string', description: 'Desired address suffix (case-insensitive by default)' },
				prefix: { type: 'string', description: 'Desired address prefix (case-insensitive by default)' },
				caseSensitive: { type: 'boolean', default: false },
				maxAttempts: { type: 'integer', default: 5000000 },
			},
		},
		outputSchema: {
			type: 'object',
			properties: {
				publicKey: { type: 'string', description: 'Matched Solana address (base58)' },
				secretKey: { type: 'string', description: 'Secret key (base58) — caller is sole custodian' },
				attempts: { type: 'integer', description: 'Keypairs ground before the match' },
				ms: { type: 'number', description: 'Wall-clock grind time in milliseconds' },
			},
			required: ['publicKey', 'secretKey', 'attempts', 'ms'],
			additionalProperties: true,
		},
	},
	{
		name: 'pumpfun_watch_whales',
		description:
			'Collect whale trades on a pump.fun token for a short window (max 10 s). Returns all trades whose USD value meets minUsd.',
		inputSchema: {
			type: 'object',
			properties: {
				mint: { type: 'string', description: 'SPL mint pubkey (base58)' },
				minUsd: { type: 'number', description: 'Minimum trade value in USD (default 5000)' },
				durationMs: {
					type: 'number',
					description: 'Collection window in ms (default 5000, max 10000)',
				},
			},
			required: ['mint'],
		},
	},
	{
		name: 'pumpfun_list_claims',
		description:
			'List recent pump.fun fee-claim events for a creator wallet (on-chain, no indexer needed). Returns signature, mint, lamports, and Unix timestamp for each claim.',
		inputSchema: {
			type: 'object',
			properties: {
				creator: { type: 'string', description: 'Creator wallet address (base58)' },
				limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
				network: { type: 'string', enum: ['mainnet', 'devnet'], default: 'mainnet' },
			},
			required: ['creator'],
		},
	},
	{
		name: 'pumpfun_watch_claims',
		description:
			'Return all pump.fun fee-claim events for a creator wallet within a look-back window (durationMs). Useful for batch collection after a delay.',
		inputSchema: {
			type: 'object',
			properties: {
				creator: { type: 'string', description: 'Creator wallet address (base58)' },
				durationMs: {
					type: 'number',
					description: 'Look-back window in ms (default 300000 = 5 min, max 1800000)',
				},
				network: { type: 'string', enum: ['mainnet', 'devnet'], default: 'mainnet' },
			},
			required: ['creator'],
		},
	},
	{
		name: 'pumpfun_first_claims',
		description:
			'First-ever pump.fun creator fee claims in a time window — a cash-out signal. Returns creators who have never claimed before, with creator wallet, mint, lamports, and timestamp.',
		inputSchema: {
			type: 'object',
			properties: {
				sinceMinutes: {
					type: 'integer',
					minimum: 1,
					maximum: 1440,
					default: 60,
					description: 'How far back to look for new claimers (minutes)',
				},
				limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
			},
		},
	},
	{
		name: 'sns_resolve',
		description: 'Resolve a .sol Solana Name Service domain to its owner wallet address.',
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: '.sol domain name, e.g. "bonfida.sol"' },
			},
			required: ['name'],
		},
		outputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'The .sol domain that was resolved' },
				address: { type: 'string', description: 'Owner wallet address (base58)' },
			},
			required: ['name', 'address'],
			additionalProperties: true,
		},
	},
	{
		name: 'sns_reverseLookup',
		description: 'Reverse-lookup a Solana wallet address to its primary .sol domain name.',
		inputSchema: {
			type: 'object',
			properties: {
				address: { type: 'string', description: 'Base58 Solana wallet address' },
			},
			required: ['address'],
		},
		outputSchema: {
			type: 'object',
			properties: {
				address: { type: 'string', description: 'The wallet address that was looked up' },
				name: { type: 'string', description: 'Primary .sol domain for the address' },
			},
			required: ['address', 'name'],
			additionalProperties: true,
		},
	},
	{
		name: 'social_cashtag_sentiment',
		description:
			'Score social-post sentiment for a cashtag using a deterministic lexicon. Returns score (-1..1), positive/negative/neutral percentages, and example posts.',
		inputSchema: {
			type: 'object',
			properties: {
				posts: {
					type: 'array',
					description: 'Array of post objects. Each must have a text field; id, ts, and author are optional.',
					items: {
						type: 'object',
						properties: {
							id: { type: 'string' },
							ts: { type: 'string' },
							text: { type: 'string' },
							author: { type: 'string' },
						},
						required: ['text'],
					},
				},
			},
			required: ['posts'],
		},
		outputSchema: {
			type: 'object',
			properties: {
				score: { type: 'number', description: 'Net sentiment, -1 (bearish) to 1 (bullish)' },
				posPct: { type: 'number', description: 'Percentage of positive posts (0–100)' },
				negPct: { type: 'number', description: 'Percentage of negative posts (0–100)' },
				neuPct: { type: 'number', description: 'Percentage of neutral posts (0–100)' },
				count: { type: 'integer', description: 'Number of posts scored' },
				examples: {
					type: 'object',
					properties: {
						pos: { type: 'array', items: { type: 'string' } },
						neg: { type: 'array', items: { type: 'string' } },
					},
					required: ['pos', 'neg'],
					additionalProperties: true,
				},
			},
			required: ['score', 'posPct', 'negPct', 'neuPct', 'count', 'examples'],
			additionalProperties: true,
		},
	},
	{
		name: 'kol_leaderboard',
		description:
			'Top KOL traders ranked by P&L for a given time window. Returns wallet, pnlUsd, winRate, trades, rank.',
		inputSchema: {
			type: 'object',
			properties: {
				window: { type: 'string', enum: ['24h', '7d', '30d'], default: '7d' },
				limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
			},
		},
	},
	{
		name: 'pumpfun_quote_swap',
		description:
			'Read-only price quote for a pump.fun AMM swap. No signing or tx sending. One of inputMint/outputMint must be wSOL (So11111111111111111111111111111111111111112). Returns amountOut, priceImpactBps, route, expiresAtMs.',
		inputSchema: {
			type: 'object',
			properties: {
				inputMint: { type: 'string', description: 'Input token mint (base58).' },
				outputMint: { type: 'string', description: 'Output token mint (base58).' },
				amountIn: { type: 'number', description: 'Input amount in raw base units (lamports for SOL).' },
				slippageBps: { type: 'number', description: 'Slippage tolerance in basis points (default 100 = 1%).' },
				network: { type: 'string', enum: ['mainnet', 'devnet'], default: 'mainnet' },
			},
			required: ['inputMint', 'outputMint', 'amountIn'],
		},
		outputSchema: {
			type: 'object',
			properties: {
				amountOut: { type: 'string', description: 'Expected output amount in raw base units' },
				priceImpactBps: { type: 'number', description: 'Price impact in basis points' },
				route: { type: 'string', description: 'AMM pool address the quote routes through (base58)' },
				expiresAtMs: { type: 'number', description: 'Epoch ms after which the quote is stale' },
			},
			required: ['amountOut', 'priceImpactBps', 'route', 'expiresAtMs'],
			additionalProperties: true,
		},
	},
	{
		name: 'social_x_post_impact',
		description:
			'Correlate an X (Twitter) post to a memecoin price impact. Fetches post metadata via oEmbed (no API key) and computes price delta from the pump.fun bonding curve in a ±windowMin window around the post.',
		inputSchema: {
			type: 'object',
			properties: {
				postUrl: { type: 'string', description: 'X post URL (e.g. https://x.com/user/status/123)' },
				mint: { type: 'string', description: 'Solana token mint address (base58)' },
				windowMin: {
					type: 'integer',
					default: 30,
					description: '±window in minutes around the post time',
				},
				network: { type: 'string', enum: ['mainnet', 'devnet'], default: 'mainnet' },
			},
			required: ['postUrl', 'mint'],
		},
	},
	{
		name: 'pumpfun_bot_status',
		description:
			'Returns the configuration and health status of the pump.fun indexer backend. Always available — does not require PUMPFUN_BOT_URL.',
		inputSchema: { type: 'object', properties: {}, required: [] },
		outputSchema: {
			type: 'object',
			properties: {
				configured: {
					type: 'boolean',
					description: 'true when PUMPFUN_BOT_URL is set on the server',
				},
				healthy: {
					type: 'boolean',
					description: 'true when the indexer answered the health ping',
				},
				latencyMs: {
					type: 'number',
					description: 'Round-trip ms of the health ping (configured backends only)',
				},
				error: {
					type: 'string',
					description: 'Failure reason when healthy is false',
				},
				message: {
					type: 'string',
					description: 'Human-readable note when the indexer is unconfigured',
				},
			},
			required: ['configured', 'healthy'],
			additionalProperties: true,
		},
	},
];

// Stamp title + annotations onto every tool from the map above. A tool added
// to TOOLS without a TOOL_ANNOTATIONS entry would ship un-annotated — the
// parity tests assert full coverage so that can't land silently.
for (const tool of TOOLS) {
	const annotations = TOOL_ANNOTATIONS[tool.name];
	if (annotations) {
		tool.title = annotations.title;
		tool.annotations = annotations;
	}
}

export function rpcError(code, message) {
	const err = new Error(message);
	err.rpcCode = code;
	return err;
}

export function rpcEnvelope(id, result, errObj) {
	if (errObj) {
		return { jsonrpc: '2.0', id: id ?? null, error: errObj };
	}
	return { jsonrpc: '2.0', id: id ?? null, result };
}
