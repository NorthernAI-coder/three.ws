// Consolidated /.well-known/* handler.
// Dispatches on ?name= query param set by vercel.json rewrites.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cors, json, method, wrap, error } from './_lib/http.js';
import { env } from './_lib/env.js';
import {
	paymentRequirements,
	bazaarExtension,
	build402Body,
	declareEip2612GasSponsoringExtension,
	declareErc20ApprovalGasSponsoringExtension,
	permit2VariantOf,
	baseSettleable,
	NETWORK_BASE_MAINNET,
	NETWORK_SOLANA_MAINNET,
} from './_lib/x402-spec.js';
import {
	declareHttpDiscovery,
	declareMcpDiscovery,
	withService,
} from './_lib/x402/bazaar-helpers.js';
import { TOOL_CATALOG } from './_mcp/catalog.js';
import { STUDIO_CHALLENGE } from './_mcp3d/discovery.js';
import { TOOL_CATALOG as STUDIO_TOOL_CATALOG } from './_mcp3d/catalog.js';
import { priceFor as studioPriceFor } from './_mcp3d/pricing.js';
import { priceFor } from './_lib/pump-pricing.js';
import { priceAtomicsForTier } from './_lib/forge-tiers.js';
import { listBazaarServices, serviceResourceUrl } from './_lib/agent-paid-services.js';

// ── agent-attestation-schemas ─────────────────────────────────────────────────

const COMMON = {
	v: { type: 'integer', const: 1 },
	kind: { type: 'string' },
	agent: { type: 'string', description: 'Metaplex Core asset pubkey (base58)' },
	ts: { type: 'integer', description: 'Unix seconds when attestation was created' },
};

const SCHEMAS = {
	'threews.feedback.v1': {
		description: 'Client → agent feedback.',
		required: ['v', 'kind', 'agent', 'score'],
		properties: {
			...COMMON,
			score: { type: 'integer', minimum: 1, maximum: 5 },
			task_id: { type: 'string' },
			uri: { type: 'string', format: 'uri' },
		},
	},
	'threews.validation.v1': {
		description:
			'Validator attestation. Two forms: a task validation (task_hash) or a ' +
			'glTF/GLB schema validation of the agent model (subkind "glb-schema", ' +
			'carrying proof_hash + proof_uri) — the Solana analog of the EVM ' +
			'ValidationRegistry recordValidation.',
		required: ['v', 'kind', 'agent', 'passed'],
		properties: {
			...COMMON,
			passed: { type: 'boolean' },
			subkind: { type: 'string', enum: ['glb-schema'], description: 'Present for model (glTF/GLB schema) validations.' },
			task_hash: { type: 'string', description: 'Task validation form: sha256 of the validated task.' },
			proof_hash: { type: 'string', description: 'Model form: sha256 of the canonical validation report JSON.' },
			proof_uri: { type: 'string', description: 'Model form: URL to the full pinned validation report.' },
			model_sha256: { type: 'string', description: 'Model form: sha256 of the GLB bytes.' },
			source: { type: 'string' },
			uri: { type: 'string', format: 'uri' },
		},
	},
	'threews.task.v1': {
		description: 'Client posts a task offer to an agent.',
		required: ['v', 'kind', 'agent', 'task_id', 'scope_hash'],
		properties: {
			...COMMON,
			task_id: { type: 'string' },
			scope_hash: { type: 'string' },
			uri: { type: 'string', format: 'uri' },
		},
	},
	'threews.accept.v1': {
		description: 'Agent accepts a task.',
		required: ['v', 'kind', 'agent', 'task_id'],
		properties: { ...COMMON, task_id: { type: 'string' } },
	},
	'threews.revoke.v1': {
		description: 'Revoke a previous attestation.',
		required: ['v', 'kind', 'agent', 'target_signature'],
		properties: { ...COMMON, target_signature: { type: 'string' }, reason: { type: 'string' } },
	},
	'threews.dispute.v1': {
		description: 'Agent owner disputes a feedback or validation.',
		required: ['v', 'kind', 'agent', 'target_signature'],
		properties: {
			...COMMON,
			target_signature: { type: 'string' },
			reason: { type: 'string' },
			uri: { type: 'string', format: 'uri' },
		},
	},
};

function handleAttestationSchemas(req, res) {
	return json(
		res,
		200,
		{
			version: 1,
			transport: {
				type: 'spl-memo',
				program: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
				note: 'Each attestation is a signed memo tx with the agent asset pubkey as a non-signer key.',
			},
			schemas: SCHEMAS,
			discovery: {
				list_endpoint: '/api/agents/solana-attestations?asset=<pubkey>&kind=...',
				reputation_endpoint: '/api/agents/solana-reputation?asset=<pubkey>',
				validation_endpoint: '/api/agents/solana-validation?asset=<pubkey>',
			},
		},
		{ 'cache-control': 'public, max-age=300' },
	);
}

// ── oauth-authorization-server ────────────────────────────────────────────────

function handleOauthAuthServer(req, res) {
	const base = env.APP_ORIGIN;
	return json(
		res,
		200,
		{
			issuer: base,
			authorization_endpoint: `${base}/oauth/authorize`,
			token_endpoint: `${base}/api/oauth/token`,
			registration_endpoint: `${base}/api/oauth/register`,
			revocation_endpoint: `${base}/api/oauth/revoke`,
			introspection_endpoint: `${base}/api/oauth/introspect`,
			response_types_supported: ['code'],
			grant_types_supported: ['authorization_code', 'refresh_token'],
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: [
				'none',
				'client_secret_basic',
				'client_secret_post',
			],
			scopes_supported: [
				'avatars:read',
				'avatars:write',
				'avatars:delete',
				'profile',
				'offline_access',
				// Agent memory MCP tools (remember / recall / forget).
				'memory:read',
				'memory:write',
				// On-chain agent identity MCP tools (register_agent / identity_check).
				'agents:read',
				'agents:write',
				// USE-21 auth-hints: paid endpoints advertise these scopes for
				// Bearer-token bypass via the auth-hints extension.
				'read:agent-reputation',
				'x402:bypass',
				// Agent wallet MCP (api/mcp-agent): read status, provision a wallet,
				// and publish a paid endpoint to earn USDC.
				'wallet:read',
				'wallet:write',
				'services:write',
			],
			service_documentation: `${base}/docs/mcp`,
			ui_locales_supported: ['en'],
		},
		{ 'cache-control': 'public, max-age=300' },
	);
}

// ── oauth-protected-resource ──────────────────────────────────────────────────

function handleOauthProtectedResource(req, res) {
	return json(
		res,
		200,
		{
			resource: env.MCP_RESOURCE,
			authorization_servers: [env.APP_ORIGIN],
			bearer_methods_supported: ['header'],
			resource_documentation: `${env.APP_ORIGIN}/docs/mcp`,
			scopes_supported: [
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
		{ 'cache-control': 'public, max-age=300' },
	);
}

// ── x402 ─────────────────────────────────────────────────────────────────────

function handleX402(req, res) {
	const mcpResource = `${env.APP_ORIGIN}/api/mcp`;
	const mcpService = withService({
		serviceName: 'three.ws MCP',
		tags: ['mcp', '3d', 'gltf', 'solana', 'agent'],
	});
	const body = build402Body({
		resourceUrl: mcpResource,
		accepts: paymentRequirements(mcpResource),
		serviceName: mcpService.serviceName,
		tags: mcpService.tags,
		iconUrl: mcpService.iconUrl,
	});
	return json(
		res,
		200,
		{
			...body,
			schemes: ['pump-agent-payments', 'x402', 'x402-v2'],
			pump_agent_payments: {
				prep: '/api/pump/accept-payment-prep',
				confirm: '/api/pump/accept-payment-confirm',
				balances: '/api/pump/balances',
			},
		},
		{ 'cache-control': 'public, max-age=300' },
	);
}

// ── x402 Bazaar discovery (/.well-known/x402.json) ───────────────────────────
// Crawled by agentic.market / Bazaar to index our paid endpoints.
// Schema: https://x402.org/schemas/discovery.json

const RAW_AMOUNT_TO_USDC = (raw) => {
	const n = Number(raw || 0) / 1_000_000;
	const decimals = n < 0.01 ? 4 : 2;
	const s = n.toFixed(decimals);
	const trimmed = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
	return `$${trimmed}`;
};

// Build the per-endpoint `accepts` block for a given USDC atomics price.
// Each new /api/x402/* endpoint has its own price set in its handler via
// paidEndpoint(priceAtomics); the discovery doc has to mirror that or
// agentic.market shows the wrong price to potential buyers.
// Push an EVM accept entry followed by its Permit2 sibling so the Bazaar
// discovery doc mirrors the live 402 response exactly (EIP-3009 first,
// Permit2 second). Non-EVM entries get no sibling.
function pushAcceptWithPermit2Sibling(out, accept) {
	out.push(accept);
	const sibling = permit2VariantOf(accept);
	if (sibling) out.push(sibling);
}

// Per-resource extensions for the discovery catalog. The bazaar entry is
// always present; the two gasless-Permit2-onboarding extensions are added
// whenever any accept in the list opts into the Permit2 transfer method.
// EIP-2612 covers tokens that implement `permit()` (USDC, DAI, ...); the
// ERC-20 approval variant covers tokens that don't. Both let the facilitator
// sponsor the approve() so the payer never broadcasts the approval tx.
// Normalize the second arg into a spec-shaped v2 bazaar extension
// ({discoverable, info, schema}). Catalog entries historically passed a raw
// {method, discoverable, input, inputSchema} descriptor straight through,
// which facilitator validators reject as a malformed discovery extension —
// every REST row was silently uncatalogable while the MCP rows (already
// spec-shaped) validated fine. Already-proper extensions (bazaarExtension(),
// declareMcpDiscovery(), STUDIO_CHALLENGE.bazaar) pass through untouched.
function extensionsForAccepts(accepts, bazaar) {
	const normalized =
		bazaar && bazaar.info && bazaar.schema
			? bazaar
			: declareHttpDiscovery({
					method: bazaar?.method || 'GET',
					input: bazaar?.input,
					inputSchema: bazaar?.inputSchema,
				});
	const exts = { bazaar: normalized };
	if (accepts.some((a) => a?.extra?.assetTransferMethod === 'permit2')) {
		Object.assign(
			exts,
			declareEip2612GasSponsoringExtension(),
			declareErc20ApprovalGasSponsoringExtension(),
		);
	}
	return exts;
}

// Build the accepts[] block for a discovery-catalog entry. `resourceUrl` is
// echoed on every accept so reviewers + wallet/facilitator spend logs can
// reconcile each accept entry against the resource it gates, without having
// to walk back to the parent resource[] entry.
function acceptsForPrice(amountAtomics, resourceUrl) {
	const out = [];
	const price = RAW_AMOUNT_TO_USDC(amountAtomics);
	// Solana-first platform default — the Solana accept leads so first-accept
	// clients and marketplaces treat it as the primary rail; Base follows.
	if (env.X402_PAY_TO_SOLANA) {
		out.push({
			scheme: 'exact',
			network: NETWORK_SOLANA_MAINNET,
			network_label: 'solana-mainnet',
			amount: String(amountAtomics),
			price,
			payTo: env.X402_PAY_TO_SOLANA,
			asset: env.X402_ASSET_MINT_SOLANA,
			asset_symbol: 'USDC',
			maxTimeoutSeconds: 60,
			resource: resourceUrl,
			extra: { name: 'USDC', decimals: 6, feePayer: env.X402_FEE_PAYER_SOLANA },
		});
	}
	// Base only when a WORKING facilitator will settle it (CDP creds or the
	// X402_ADVERTISE_BASE opt-in). A bare facilitator URL is not enough — the prod
	// host was decommissioned and 404s /verify, so an unsettleable Base accept would
	// drift from the live 402 (which now drops Base) and hand buyers a catalog rail
	// that 502s at verify. See baseSettleable().
	if (env.X402_PAY_TO_BASE && baseSettleable()) {
		pushAcceptWithPermit2Sibling(out, {
			scheme: 'exact',
			network: NETWORK_BASE_MAINNET,
			network_label: 'base-mainnet',
			amount: String(amountAtomics),
			price,
			payTo: env.X402_PAY_TO_BASE,
			asset: env.X402_ASSET_ADDRESS_BASE,
			asset_symbol: 'USDC',
			maxTimeoutSeconds: 60,
			resource: resourceUrl,
			extra: { name: 'USD Coin', version: '2', decimals: 6 },
		});
	}
	return out;
}

// USE-13: one Bazaar catalog row per priced MCP tool. Facilitators key MCP
// rows on (resource, toolName) so each priced tool needs its own row; the
// shared `/api/mcp` resource alone would collapse them into one entry. We
// only emit rows for priced tools (otherwise the row would advertise a paid
// catalog entry for a free tool and confuse buyers about what's actually
// gated). Falls back to the canonical `mcp://tool/<name>` identifier when
// the spec wants a logical resource that distinguishes tools at the URL
// level, while the actual call still goes to the server's own path.
// Generic over the server: pass the endpoint path/url, its accepts, its
// service metadata, its tool catalog, and its per-tool pricing lookup —
// /api/mcp and /api/mcp-3d both feed through here.
function buildMcpToolItems({ path, mcpUrl, mcpAccepts, mcpService, catalog, priceForTool }) {
	const items = [];
	for (const tool of catalog) {
		const pricing = priceForTool(tool.name);
		if (!pricing) continue;
		const exampleArgs = exampleArgsForTool(tool);
		const discovery = declareMcpDiscovery({
			toolName: tool.name,
			description: tool.description,
			// MCP 2025-06-18 transport: Streamable HTTP is the default for
			// these servers; SSE clients still work through the same path.
			transport: 'streamable-http',
			inputSchema: tool.inputSchema,
			example: exampleArgs,
		});
		items.push({
			type: 'mcp',
			path,
			url: mcpUrl,
			toolName: tool.name,
			method: 'POST',
			description: tool.description,
			mimeType: 'application/json',
			serviceName: mcpService.serviceName,
			tags: mcpService.tags,
			iconUrl: mcpService.iconUrl,
			pricing: {
				amount_usdc: pricing.amount_usdc,
				currency: 'USDC',
				description: pricing.description,
			},
			accepts: mcpAccepts,
			extensions: extensionsForAccepts(mcpAccepts, discovery),
		});
	}
	return items;
}

// Synthesize a minimal example arguments object that satisfies the tool's
// inputSchema.required fields. We use type-appropriate placeholders rather
// than the full schema so the example stays short — facilitators index it
// for search relevance, not exact matching.
function exampleArgsForTool(tool) {
	const props = tool.inputSchema?.properties || {};
	const required = tool.inputSchema?.required || [];
	const out = {};
	for (const key of required) {
		const def = props[key] || {};
		if (def.type === 'integer' || def.type === 'number') out[key] = def.default ?? 1;
		else if (def.type === 'boolean') out[key] = def.default ?? true;
		else if (def.type === 'array') out[key] = [];
		else out[key] = def.default ?? `example-${key}`;
	}
	return out;
}

// Agent-published paid services (the `monetize_endpoint` tool). Each active,
// bazaar-listed row in agent_paid_services becomes a discovery catalog entry so
// facilitators — and therefore find_services / the bazaar — index the agent's
// endpoint the moment it's published. The advertised payTo is the agent's OWN
// payout wallet, mirroring the live 402 that api/x402/service.js serves.
//
// Never throws: a DB hiccup (or no DB, as in unit tests) yields an empty list so
// the static catalog still renders. Capped by listBazaarServices().
async function buildAgentServiceItems(origin) {
	let rows;
	try {
		rows = await listBazaarServices({ limit: 200 });
	} catch (err) {
		console.error('[wk/x402-discovery] agent services unavailable', err?.message || err);
		return [];
	}

	const items = [];
	for (const row of rows) {
		const url = serviceResourceUrl(row.slug);
		const price = RAW_AMOUNT_TO_USDC(row.price_atomics);
		const accepts = [];
		if (row.network === 'base' && row.payout_address && env.X402_ASSET_ADDRESS_BASE && baseSettleable()) {
			pushAcceptWithPermit2Sibling(accepts, {
				scheme: 'exact',
				network: NETWORK_BASE_MAINNET,
				network_label: 'base-mainnet',
				amount: String(row.price_atomics),
				price,
				payTo: row.payout_address,
				asset: env.X402_ASSET_ADDRESS_BASE,
				asset_symbol: 'USDC',
				maxTimeoutSeconds: 60,
				resource: url,
				extra: { name: 'USD Coin', version: '2', decimals: 6 },
			});
		} else if (
			row.network === 'solana' &&
			row.payout_address &&
			env.X402_ASSET_MINT_SOLANA &&
			env.X402_FEE_PAYER_SOLANA
		) {
			accepts.push({
				scheme: 'exact',
				network: NETWORK_SOLANA_MAINNET,
				network_label: 'solana-mainnet',
				amount: String(row.price_atomics),
				price,
				payTo: row.payout_address,
				asset: env.X402_ASSET_MINT_SOLANA,
				asset_symbol: 'USDC',
				maxTimeoutSeconds: 60,
				resource: url,
				extra: { name: 'USDC', decimals: 6, feePayer: env.X402_FEE_PAYER_SOLANA },
			});
		}
		// No advertisable accept (missing payout / env for this network) → skip,
		// matching the live 402 which would also refuse to advertise it.
		if (!accepts.length) continue;

		const inputSchema = row.input_schema || { type: 'object', additionalProperties: true };
		items.push({
			path: `/api/x402/service/${row.slug}`,
			url,
			method: row.target_method,
			description: row.description,
			mimeType: 'application/json',
			serviceName: row.name,
			tags: ['agent', 'monetized', row.network],
			accepts,
			extensions: extensionsForAccepts(accepts, {
				method: row.target_method,
				discoverable: true,
				input: {},
				inputSchema,
			}),
		});
	}
	return items;
}

// ── output.example backfill ──────────────────────────────────────────────────
// Indexers (agentic.market / x402scan) render and rank a resource by its
// response example. A resource with no `bazaar.info.output.example` still
// catalogs, but ranks poorly and shows an empty result card — the verifier
// (`scripts/verify-x402-discovery.mjs`) flags every one as a warning. These maps
// are the single source of a realistic, schema-shaped success example for each
// paid endpoint so the catalog renders fully everywhere it's indexed.
//
// Every value here is SYNTHETIC: $THREE (the only coin) or an obviously-fake
// placeholder address — never a real third-party mint/creator/holder. Examples
// mirror the actual 200-response keys each handler emits (post-settlement).
const REST_OUTPUT_EXAMPLES = Object.freeze({
	'/api/x402/model-check': {
		url: 'https://three.ws/avatar/character-studio/sample.glb',
		fetchedBytes: 1572864,
		model: {
			container: 'glb',
			generator: 'three.ws CharacterStudio v1.5',
			version: '2.0',
			extensionsUsed: ['KHR_materials_unlit'],
			extensionsRequired: [],
			counts: {
				scenes: 1,
				nodes: 18,
				meshes: 6,
				materials: 4,
				textures: 3,
				animations: 1,
				skins: 1,
				totalVertices: 12480,
				totalTriangles: 24812,
			},
		},
		suggestions: [
			{
				id: 'texture_size',
				severity: 'info',
				message: 'All textures are within 1024x1024 — good for mobile.',
			},
		],
	},
	'/api/x402/mint-to-mesh': {
		mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump',
		theme: { name: 'three', symbol: 'THREE', color: [0.92, 0.45, 0.18], hasImage: false },
		glb: { mimeType: 'model/gltf-binary', bytes: 50768, base64: 'Z2xURgIAAADQxAAA...' },
	},
	'/api/insights/revenue-vision': {
		power_mode: 'revenue-vision',
		insight:
			'Builder teams of 10–50 convert 2.4× better than enterprise prospects on the current funnel.',
		recommended_move:
			'Shift 30% of paid acquisition to builder-focused onboarding this sprint.',
		confidence: 'high',
	},
	'/api/x402/token-intel': {
		mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump',
		symbol: 'THREE',
		name: 'three.ws',
		chain: 'solana',
		price_usd: 0.003685,
		change_24h: 12.4,
		market_cap_usd: 3685000,
		liquidity_usd: 412000,
		volume_24h_usd: 1268079,
		momentum: { m5: 0.3, h1: 1.8, h6: 6.1, h24: 12.4 },
		signal: 'bullish',
		headline: 'THREE climbs +12.40% — moderate upside',
		rationale:
			'THREE is up +12.40% over 24 h, trading at $0.003685. Volume is healthy against liquidity; participation is real. Buyers dominate the tape. The last hour confirms the trend.',
		confidence: 0.86,
		risk: {
			score: 8,
			level: 'low',
			summary: 'THREE clears the basic depth, age, and flow checks.',
			factors: [
				{ label: 'Liquidity', status: 'low', detail: '$412,000 pooled — healthy depth.' },
				{ label: 'Age', status: 'low', detail: 'Pair is 240d old — established.' },
				{ label: 'Float', status: 'low', detail: 'Cap is 8.9× liquidity — well backed.' },
				{ label: 'Flow', status: 'low', detail: '63% of 24 h trades are buys — net accumulation.' },
			],
		},
		ts: '2026-06-12T10:00:00Z',
	},
	'/api/x402/analytics': {
		ok: true,
		report: 'clubs',
		period: '24h',
		generated_at: '2026-06-27T18:42:09.000Z',
		metrics: {
			active_clubs: 3,
			total_clubs: 4,
			members: 27,
			tips: { count: 41, volume_atomics: '410000', volume_usdc: 0.41 },
			cover_charges: { count: 12, atomics: '120000', usdc: 0.12 },
		},
		top_clubs: [
			{ dancer: '1', display_name: 'Nyx', volume_atomics: '190000', volume_usdc: 0.19, tips: 19 },
		],
	},
	'/api/x402/api-key-health': {
		valid: true,
		scopes: ['internal', 'autonomous_loop', 'bypass_x402'],
		expires_at: null,
		key_type: 'internal',
		source: 'env',
		key_prefix: null,
		rate_limit_per_minute: null,
		checked_at: '2026-06-28T12:00:00Z',
	},
	'/api/x402/auth-health': {
		all_pass: true,
		failed_step: null,
		latency_ms: 38,
		steps: {
			create: { pass: true, latency_ms: 8 },
			validate: { pass: true, latency_ms: 3 },
			refresh: { pass: true, latency_ms: 11 },
			expire: { pass: true, latency_ms: 2 },
		},
		ts: '2026-06-28T00:00:00Z',
	},
	'/api/x402/avatar-optimize-batch': {
		analyzed: 50,
		critical_count: 12,
		warn_count: 38,
		info_count: 91,
		total_size_bytes: 82000000,
		avatars: [
			{
				id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
				name: 'My Avatar',
				size_bytes: 2100000,
				critical_count: 1,
				warn_count: 3,
				info_count: 5,
				top_suggestion: 'Apply Draco compression to reduce geometry size by ~60%',
			},
		],
	},
	'/api/x402/bazaar-feed': {
		filter: 'new',
		limit: 10,
		count: 3,
		listings: [
			{
				id: 'http:https://svc.example/x402',
				name: 'Example Feed',
				price: '0.001 USDC',
				first_seen: '2026-06-28T00:00:00Z',
			},
		],
		activity: {
			new_24h: 3,
			new_7d: 9,
			daily_avg_7d: 1.29,
			signal: 'active',
			headline: '3 new bazaar listings in 24 h',
			confidence: 0.65,
		},
		generated_at: '2026-06-28T10:00:00Z',
	},
	'/api/x402/billboard': {
		ok: true,
		coin: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump',
		image: 'https://three.ws/og-image.png',
		caption: 'gm from the gallery',
		slotHours: 6,
		startsAt: '2026-06-28T18:42:09.000Z',
		endsAt: '2026-06-29T00:42:09.000Z',
		payer: 'wwwPqsM4N7T9J69tB82nLyzxqsH159j4orftLTQfUGV',
		network: 'solana',
		amountAtomics: '50000',
		asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
	},
	'/api/x402/cross-chain': {
		mode: 'bridge_status',
		bridges: [
			{ chain: 'wormhole', status: 'operational', latency_ms: 210, provider: 'wormholescan' },
			{ chain: 'lifi', status: 'operational', latency_ms: 334, provider: 'li.fi' },
			{ chain: 'debridge', status: 'degraded', latency_ms: 1870, provider: 'dln.trade' },
		],
		down_count: 0,
		signal: 'neutral',
		headline: 'All Solana bridges operational',
		confidence: 0.82,
		ts: '2026-06-28T12:00:00Z',
	},
	'/api/x402/did': {
		verified: true,
		latency_ms: 142,
		did: 'did:three:canary',
		mode: 'verify',
		resolved_did: 'did:web:three.ws',
		http_status: 200,
		within_latency: true,
		malformed: false,
		configured: true,
		checks: {
			is_object: true,
			has_did_context: true,
			has_did_id: true,
			has_verification_method: true,
			assertion_resolves: true,
			has_x402_service: true,
			valid: true,
		},
		ts: '2026-06-27T10:00:00Z',
	},
	'/api/x402/feed-health': {
		feed: 'changelog_rss',
		valid: true,
		item_count: 1241,
		latest_title: 'x402 Volume Analytics — the platform measures its own payment economy',
		title_match: true,
		fetch_ms: 312,
		checked_at: '2026-06-28T12:00:00.000Z',
	},
	'/api/x402/llm-proxy': {
		content: '1, 2, 3.',
		model: 'llama-3.3-70b-versatile',
		provider: 'groq',
		latency_ms: 312,
		tokens_used: 11,
		input_tokens: 5,
		output_tokens: 6,
	},
	'/api/x402/mcp-tool-catalog': {
		ok: true,
		mode: 'discover',
		total_tools: 24,
		priced_tools: 11,
		free_tools: 13,
		new_tools: [
			{ name: 'segment_model', description: 'Split a mesh into named parts', priced: true, price_usdc: 0.04, input_fields: 2 },
		],
		changed_tools: [
			{ name: 'render_avatar', change: 'price', price_usdc: 0.005, prev_price_usdc: 0.003 },
		],
		removed_tools: [],
		ts: '2026-06-27T10:00:00.000Z',
	},
	'/api/x402/model-validation-sweep': {
		ok: true,
		avatar_id: 'a3f3d6c2-1f1b-4f10-9b6c-1b1f5e0c9c34',
		avatar_name: 'Realistic Male',
		score: 82,
		has_errors: false,
		missing_bones: false,
		counts: {
			scenes: 1,
			nodes: 22,
			meshes: 4,
			materials: 3,
			textures: 5,
			animations: 12,
			skins: 1,
			totalVertices: 8432,
			totalTriangles: 14200,
			indexedPrimitives: 4,
			nonIndexedPrimitives: 0,
		},
		extensions_used: ['KHR_draco_mesh_compression'],
		file_size_bytes: 1572864,
		inspected_at: '2026-06-27T10:00:00.000Z',
	},
	'/api/x402/notify': {
		delivered: true,
		channel: 'canary',
		latency_ms: 18,
		notification_id: 'a3f3d6c2-1f1b-4f10-9b6c-1b1f5e0c9c34',
		message: 'x402 loop heartbeat',
		priority: 'low',
		payer: null,
		ts: '2026-06-28T10:00:00Z',
	},
	'/api/x402/pay-by-name': {
		data: {
			name: 'nich.threews.sol',
			address: 'wwwPqsM4N7T9J69tB82nLyzxqsH159j4orftLTQfUGV',
			verified: true,
			source: 'sns',
		},
	},
	'/api/x402/rate-limit-probe': {
		endpoint: '/api/x402/crypto-intel',
		remaining_calls: 42,
		reset_at: '2026-06-29T00:00:00.000Z',
		limit: 500,
		daily_cap_atomic: 5000000,
		daily_spent_atomic: 4580000,
		remaining_capacity_atomic: 420000,
		price_atomic: 10000,
		cooldown_active: false,
		cooldown_ttl_seconds: null,
	},
	'/api/x402/schema-check': {
		ok: true,
		api: 'changelog_json',
		valid: true,
		version: '2026-06-28',
		entry_count: 42,
		schema_errors: [],
		fetched_at: '2026-06-28T12:00:00.000Z',
	},
	'/api/x402/solana-register-health': {
		tool: 'solana_register',
		healthy: true,
		network: 'mainnet',
		canary_agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
		asset: 'THREEsynthetic1111111111111111111111111111',
		identity_pda: 'AgentRegyPDA11111111111111111111111111111111',
		registration_uri: 'https://three.ws/api/agents/7b9a4f30/registration.json',
		checks: {
			indexed: true,
			registry_enrolled: true,
			asset_onchain: true,
			identity_pda_onchain: true,
		},
		rpc_latency_ms: 184,
		checked_at: '2026-06-27T18:00:00Z',
	},
	'/api/x402/spend-session': {
		ok: true,
		mode: 'canary',
		created: true,
		consumed: true,
		latency_ms: 12,
		session_id: 'a3f3d6c2-1f1b-4f10-9b6c-1b1f5e0c9c34',
		budget: 0.01,
		payer: 'wwwPqsM4N7T9J69tB82nLyzxqsH159j4orftLTQfUGV',
		network: 'solana',
		amountAtomics: '10000',
		asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
	},
	'/api/x402/telegram-health': {
		bot: 'changelog',
		reachable: true,
		bot_id: 7234567890,
		bot_username: 'three_ws_bot',
		latency_ms: 142,
		reason: null,
		checked_at: '2026-06-28T12:00:00.000Z',
	},
	'/api/x402/wallet-connect': {
		mode: 'health',
		session_created: true,
		latency_ms: 83,
		slow: false,
		nonce_valid: true,
		domain: 'three.ws',
		reason: null,
		checked_at: '2026-06-28T00:00:00Z',
	},
	'/api/x402/agent-reputation': {
		agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
		name: 'Helios',
		wallet_address: 'AgEntWa11etExamp1eDoNotUse111111111111111111',
		deployed_mints: 2,
		payments: {
			confirmed_count: 142,
			confirmed_amount_atomics: '142000000',
			distinct_payers: 87,
			failed_count: 3,
			failure_rate: 0.021,
		},
		distributions: { confirmed: 12, failed: 1, success_rate: 0.923 },
		buybacks: { confirmed: 5, failed: 0, total_burn_atomics: '500000000' },
		attestations: { feedback_count: 14, validation_count: 8 },
		indexed_at: '2026-05-14T17:00:00Z',
	},
	'/api/x402/agent-bouncer': {
		ok: true,
		admitted: true,
		banned: false,
		tier: 'trusted',
		reason: null,
		reasons: [],
		newcomer: false,
		agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
		name: 'Helios',
		visits: 4,
		reputation: {
			deployed_mints: 2,
			payments: { confirmed_count: 142, distinct_payers: 87, failure_rate: 0.021 },
			distributions: { confirmed: 12, failed: 1, success_rate: 0.923 },
		},
		policy: {
			minPayments: 10,
			minDistinctPayers: 3,
			maxFailureRate: 0.2,
			allowNewcomers: true,
		},
		fetchedAt: '2026-06-22T17:00:00.000Z',
	},
	'/api/x402/onchain-identity-verify': {
		agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
		chain: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
		contract_or_mint: 'C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi',
		verified: true,
		evidence: {
			family: 'solana',
			tx_hash: '4kHTPp9ExampleSignatureDoNotUse...',
			wallet: 'AgEntWa11etExamp1eDoNotUse111111111111111111',
			confirmed_at: '2026-04-30T14:08:22Z',
		},
		indexed_at: '2026-05-14T17:00:00Z',
	},
	'/api/x402/pump-agent-audit': {
		mint: 'C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi',
		network: 'mainnet',
		name: 'Helios',
		symbol: 'HELIO',
		payments: {
			total_in_atomics: '142000000',
			confirmed_count: 142,
			failed_count: 3,
			distinct_payers: 87,
			latest_payment_at: '2026-05-14T16:45:00Z',
		},
		distributions: { confirmed: 12, failed: 1, latest_status: 'confirmed', latest_error: null },
		buybacks: { confirmed: 5, failed: 0, total_burn_atomics: '500000000' },
		risk_flags: [],
		indexed_at: '2026-05-14T17:00:00Z',
	},
	'/api/x402/pump-launch': {
		mint: 'HEL1oXyzABCDEFGHJKLMNopqrstuvwxyZ12345abcdef',
		signature: '5xYExampleTxSignatureDoNotUse...',
		creator: 'wwwPqsM4N7T9J69tB82nLyzxqsH159j4orftLTQfUGV',
		name: 'Helios',
		symbol: 'HELIO',
		metadataUri: 'https://ipfs.io/ipfs/QmExampleMetadataCid',
		network: 'mainnet',
		pumpfun_url: 'https://pump.fun/coin/HEL1oXyzABCDEFGHJKLMNopqrstuvwxyZ12345abcdef',
		vanity_prefix: 'HEL',
		vanity_iterations: 4821,
	},
	'/api/x402/forge': {
		job_id: 'f1.eyJwIjoiZXhhbXBsZSJ9.sig',
		status: 'queued',
		poll_url: '/api/forge?job=f1.eyJwIjoiZXhhbXBsZSJ9.sig',
		mode: 'text_to_3d',
		tier: 'standard',
		eta_seconds: 22,
		price_usdc: '0.15',
	},
	'/api/x402/skill-marketplace': {
		skill_filter: 'inspect_model',
		count: 1,
		cheapest: {
			agent_name: 'Helios',
			skill: 'inspect_model',
			amount_atomics: '10000',
			chain: 'solana',
		},
		listings: [
			{
				agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
				agent_name: 'Helios',
				skill: 'inspect_model',
				amount_atomics: '10000',
				mint_decimals: 6,
				chain: 'solana',
				trial_uses: 1,
				time_pass_hours: 24,
			},
		],
		indexed_at: '2026-05-14T17:00:00Z',
	},
	'/api/x402/symbol-availability': {
		ticker: 'HELIO',
		network: 'mainnet',
		exact_collision: false,
		exact_matches: [],
		similar: [
			{
				ticker: 'HELIOS',
				mint: 'C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi',
				name: 'Helios',
				similarity: 0.71,
			},
		],
		recommendation: 'available — one near-match exists at similarity 0.71',
		indexed_at: '2026-05-14T17:00:00Z',
	},
	'/api/x402/vanity': {
		address: 'SoEXAMPLEdoNotUse1111111111111111111111111111',
		prefix: 'So',
		suffix: null,
		ignoreCase: false,
		format: 'keypair',
		secretKeyBase58: 'Hy5pQqgExampleSecretDoNotUse...',
		attempts: 160,
		durationMs: 6,
		expectedAttempts: 58,
		network: 'solana',
		explorerUrl: 'https://solscan.io/account/SoEXAMPLEdoNotUse1111111111111111111111111111',
	},
	'/api/x402/vanity-verifiable': {
		protocol: 'three-vanity/v1',
		receiptType: 'grind-receipt',
		address: 'SoEXAMPLEdoNotUse1111111111111111111111111111',
		pattern: { prefix: 'So', suffix: null, ignoreCase: false },
		commitment: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
		winningIndex: 3041,
		attempts: 3042,
		sealed: false,
		servicePublicKey: '3WzwpVSmSExamplePublicKeyDoNotUse',
		signature: 'ed25519:abcdef1234567890...',
		network: 'solana',
		verifyUrl: 'https://three.ws/vanity/verify',
		serviceKeyUrl: 'https://three.ws/.well-known/three-vanity.json',
	},
	'/api/x402/mint-to-mesh-batch': {
		count: 2,
		results: [
			{
				ok: true,
				mint: 'C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi',
				theme: { name: 'Helios', symbol: 'HELIO', hasImage: true },
				glb: { mimeType: 'model/gltf-binary', bytes: 18000, base64: 'Z2xUR...' },
			},
			{ ok: false, mint: 'F7kXZExampleMintDoNotUse...', error: 'meta_fetch_failed' },
		],
		indexed_at: '2026-05-14T17:00:00Z',
	},
	'/api/x402/dance-tip': {
		ok: true,
		ticketId: 'a3f3d6c2-1f1b-4f10-9b6c-1b1f5e0c9c34',
		dancer: '1',
		dance: 'rumba',
		clip: 'rumba',
		durationSec: 10,
		startsAt: '2026-05-21T18:42:09.000Z',
		endsAt: '2026-05-21T18:42:19.000Z',
		network: 'solana',
		amountAtomics: '1000',
	},
	'/api/x402/asset-download': {
		ok: true,
		slug: 'pole-dancer-rumba',
		title: 'Pole Dancer (Rumba)',
		mimeType: 'model/gltf-binary',
		sizeBytes: 6492840,
		expiresAt: '2026-05-21T18:48:09.000Z',
		downloadUrl: 'https://three-ws-public.r2.dev/assets/pole-dancer-rumba.glb?X-Amz-Algorithm=...',
	},
	'/api/x402/skill-call': {
		ok: true,
		skill: { slug: 'wallet-balance', name: 'Wallet Balance', category: 'crypto' },
		tools: [{ type: 'function', function: { name: 'get_balance', description: 'Fetch balances.' } }],
		content: '# Wallet Balance\n\nUse get_balance to fetch token balances...',
		calledAt: '2026-05-31T18:48:09.000Z',
	},
	'/api/x402/fact-check': {
		verdict: 'supported',
		confidence: 0.91,
		claim: 'The Eiffel Tower is in Paris.',
		strictness: 'medium',
		sources: [
			{
				url: 'https://en.wikipedia.org/wiki/Eiffel_Tower',
				title: 'Eiffel Tower - Wikipedia',
				stance: 'supports',
				weight: 0.7,
			},
		],
		costBreakdown: { searchCalls: 3, llmTokens: 1420, totalUsdc: '0.100355' },
		attestation: 'sha256:abcdef1234567890...',
	},
	'/api/x402/tutor': {
		sessionId: '8f1c0c2e-2a4d-4b6e-9b1a-3c5d7e9f0a1b',
		answer:
			'The sky is blue because air scatters short-wavelength blue light from the sun more than other colors (Rayleigh scattering).',
		keyPoints: ['Sunlight contains all colors.', 'Air scatters blue more than red.'],
		example: 'At sunset light travels farther, so more blue scatters away and the sky reddens.',
		followUp: 'Why are sunsets red rather than blue?',
		level: 'intermediate',
		costThisChargeUsd: '0.010000',
		sessionTotalUsd: '0.030000',
		questionCount: 3,
		attestation: 'sha256:abcd1234...',
	},
	'/api/x402/crypto-intel': {
		topic: 'sol',
		headline: 'SOL up +7.2% in 24 h — momentum building',
		signal: 'bullish',
		price_usd: 148.32,
		change_24h: 7.18,
		rationale: 'SOL gained 7.18% in 24 h. Strong momentum suggests continued upside.',
		confidence: 0.86,
		ts: '2026-06-03T10:00:00Z',
	},
	'/api/x402/three-intel': {
		mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump',
		symbol: 'THREE',
		price_usd: 0.003685,
		change_24h: 12.4,
		market_cap_usd: 3685000,
		liquidity_usd: 412000,
		volume_24h_usd: 1268079,
		signal: 'bullish',
		headline: 'THREE climbs +12.40% — moderate upside',
		rationale: 'THREE gained +12.40% over 24 h at $0.003685; volume is healthy against liquidity.',
		confidence: 0.86,
		ts: '2026-06-12T10:00:00Z',
	},
	'/api/x402/cosmetic-purchase': {
		ok: true,
		id: 'skin-midnight',
		name: 'Midnight',
		slot: 'skin',
		rarity: 'legendary',
		account: 'g_5f3c9a21b8',
		owned: true,
		newlyOwned: true,
		network: 'solana',
		amountAtomics: '3000000',
	},
	'/api/x402/animation-download': {
		ok: true,
		id: '00000000-0000-0000-0000-000000000000',
		slug: 'spin-kick-combo',
		name: 'Spin Kick Combo',
		mimeType: 'model/gltf-binary',
		sizeBytes: 248400,
		expiresAt: '2026-06-15T18:48:09.000Z',
		downloadUrl: 'https://three.ws/cdn/u/spin-kick-combo.glb?X-Amz-Algorithm=...',
	},
	'/api/x402/analytics': {
		ok: true,
		report: 'marketplace',
		period: '7d',
		generated_at: '2026-06-28T00:00:00.000Z',
		catalog: { listing_count: 128, priced_listings: 41, free_listings: 87, new_in_period: 9 },
		pricing: {
			avg_price_usd: 4.21,
			avg_price_sol: 0.028,
			min_price_usd: 0.5,
			max_price_usd: 25,
			priceable_count: 41,
			sol_usd_price: 150.0,
			by_currency: [
				{ currency: 'USDC', currency_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', chain: 'solana', count: 38, avg_price: 4.1, priceable: true },
			],
		},
		engagement: {
			total_views: 9521,
			total_forks: 642,
			most_viewed_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
			most_viewed_name: 'Helios',
			most_viewed_count: 1840,
			most_forked_id: 'a1b2c3d4-1111-2222-3333-444455556666',
			most_forked_name: 'Forge',
			most_forked_count: 96,
		},
	},
	'/api/x402/club-cover': {
		ok: true,
		admitted: true,
		banned: false,
		tier: 'regular',
		visits: 4,
		passId: 'a3f3d6c2-1f1b-4f10-9b6c-1b1f5e0c9c34',
		issuedAt: '2026-06-15T18:42:09.000Z',
		expiresAt: '2026-06-16T00:42:09.000Z',
		network: 'solana',
		amountAtomics: '10000',
	},
	// Only advertised when CDP creds are present (its sole accept is a Permit2
	// sibling), so it never appears in the public non-CDP catalog — but include
	// its example so the catalog stays green in CDP-credentialed environments.
	'/api/x402/permit2-paid-demo': {
		ok: true,
		demo: 'permit2-eip2612-gas-sponsoring',
		method: 'permit2',
		supportsEip2612: true,
		payer: '0x1111111111111111111111111111111111111111',
		network: 'eip155:8453',
		asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		amountAtomics: '1000',
		transaction: '0x9c0a7e5ad5c9c0bb6f04f6ad9c52f4f44bb6c5d9c0a7e5ad5c9c0bb6f04f6ad9',
		explorer:
			'https://basescan.org/tx/0x9c0a7e5ad5c9c0bb6f04f6ad9c52f4f44bb6c5d9c0a7e5ad5c9c0bb6f04f6ad9',
		settledAt: '2026-06-15T18:42:09.000Z',
	},
});

// MCP tool result examples, keyed by toolName. Wrapped in the same JSON-RPC 2.0
// CallToolResult envelope the live /api/mcp + /api/mcp-3d transports return, so
// the example mirrors exactly what a buyer's MCP client receives.
const MCP_TOOL_OUTPUT_SUMMARIES = Object.freeze({
	render_avatar: { ok: true, scene: 'avatar', format: 'glb', url: 'https://three.ws/cdn/avatar-preview.glb' },
	validate_model: { ok: true, warnings: [], errors: [], meta: { vertices: 12480, triangles: 24812 } },
	inspect_model: { container: 'glb', meshes: 6, materials: 4, animations: 1, vertices: 12480 },
	optimize_model: { ok: true, before: { bytes: 1572864 }, after: { bytes: 640000 }, savedPct: 59 },
	apply_animation: { ok: true, clip: 'walk', format: 'glb', url: 'https://three.ws/cdn/animated.glb' },
	text_to_3d: { job_id: 'f1.eyJwIjoiZXhhbXBsZSJ9.sig', status: 'queued', poll_url: '/api/forge?job=f1.eyJwIjoiZXhhbXBsZSJ9.sig' },
	image_to_3d: { job_id: 'f1.eyJpIjoiZXhhbXBsZSJ9.sig', status: 'queued', poll_url: '/api/forge?job=f1.eyJpIjoiZXhhbXBsZSJ9.sig' },
	remove_background: { ok: true, image_url: 'https://three.ws/cdn/cutout.png' },
	remesh_model: { ok: true, glb_url: 'https://three.ws/cdn/remeshed.glb', triangles: 20000 },
	stylize_model: { ok: true, glb_url: 'https://three.ws/cdn/stylized.glb', style: 'voxel' },
	segment_model: { ok: true, parts: ['head', 'torso', 'legs'], glb_url: 'https://three.ws/cdn/segmented.glb' },
	retexture_model: { ok: true, glb_url: 'https://three.ws/cdn/retextured.glb' },
	retexture_region: { ok: true, glb_url: 'https://three.ws/cdn/retextured-region.glb', region: 'face' },
	auto_rig_model: { ok: true, glb_url: 'https://three.ws/cdn/rigged.glb', bones: 52 },
	pose_model: { ok: true, glb_url: 'https://three.ws/cdn/posed.glb', pose: 't-pose' },
	direct_prompt: { job_id: 'f1.eyJkIjoiZXhhbXBsZSJ9.sig', status: 'queued', poll_url: '/api/forge?job=f1.eyJkIjoiZXhhbXBsZSJ9.sig' },
	generate_material: { ok: true, material_url: 'https://three.ws/cdn/material.glb' },
	search_public_avatars: {
		count: 2,
		avatars: [
			{ id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55', slug: 'midnight-robot', name: 'Midnight Robot', tags: ['robot', 'sci-fi'], thumbnail_url: 'https://three.ws/cdn/avatars/midnight-robot.png' },
			{ id: 'c1e8a902-5b44-4f0a-8e21-7d3f0c2b1a90', slug: 'anime-dancer', name: 'Anime Dancer', tags: ['anime', 'dancer'], thumbnail_url: 'https://three.ws/cdn/avatars/anime-dancer.png' },
		],
	},
	solana_agent_reputation: {
		asset: 'AgEntWa11etExamp1eDoNotUse111111111111111111',
		network: 'mainnet',
		feedback: { total: 142, verified: 118 },
		score: { average: 4.6, verified_average: 4.8 },
		validation: { passed: 8, failed: 1 },
		tasks: { accepted: 96, disputed: 2 },
		indexed_at: '2026-05-14T17:00:00Z',
	},
	capture_scene: {
		job_id: 'v2s.eyJ2IjoiZXhhbXBsZSJ9.sig',
		status: 'queued',
		source_video_url: 'https://three.ws/cdn/sample-room-walkthrough.mp4',
		mode: 'streaming',
		eta_seconds: 180,
	},
});

// Wrap a tool result summary in the JSON-RPC CallToolResult envelope.
function mcpResultExample(summary) {
	return {
		jsonrpc: '2.0',
		id: 1,
		result: { content: [{ type: 'text', text: JSON.stringify(summary) }] },
	};
}

// Backfill bazaar.info.output.example on one resource that lacks it, from the
// maps above. Mutates the already-built bazaar extension in place (the root info
// schema permits the extra `output` field — verified against both the REST and
// MCP meta-schemas) and returns the resource so it composes as an array .map().
// Resources that already carry an output example (the /api/mcp + /api/mcp-3d
// transport rows) are left untouched. Agent-published dynamic listings get a
// generic settled-result example so they catalog fully too.
function addOutputExample(r) {
	const info = r?.extensions?.bazaar?.info;
	if (!info || info.output?.example !== undefined) return r;
	let example;
	if (r.toolName && MCP_TOOL_OUTPUT_SUMMARIES[r.toolName]) {
		example = mcpResultExample(MCP_TOOL_OUTPUT_SUMMARIES[r.toolName]);
	} else if (REST_OUTPUT_EXAMPLES[r.path]) {
		example = REST_OUTPUT_EXAMPLES[r.path];
	} else if (typeof r.path === 'string' && r.path.startsWith('/api/x402/service/')) {
		// Agent-published listing: the response shape is the agent's own, so
		// advertise a generic settled envelope rather than a fabricated body.
		example = { ok: true, paid: true, result: {} };
	}
	if (example !== undefined) info.output = { type: 'json', example };
	return r;
}

async function handleX402Discovery(req, res) {
	const origin = env.APP_ORIGIN;
	const mcpUrl = `${origin}/api/mcp`;
	const mcp3dUrl = `${origin}/api/mcp-3d`;
	const modelCheckUrl = `${origin}/api/x402/model-check`;
	const mintToMeshUrl = `${origin}/api/x402/mint-to-mesh`;
	const revenueVisionUrl = `${origin}/api/insights/revenue-vision`;
	const price = RAW_AMOUNT_TO_USDC(env.X402_MAX_AMOUNT_REQUIRED);

	// Build the MCP accept list (Base + Solana). `resource` is echoed on every
	// accept so reviewers + spend logs can reconcile the entry against the
	// resource it gates without walking back to the parent resource[] entry.
	function buildMcpAccepts(resourceUrl) {
		const out = [];
		// Solana-first platform default — Solana leads, Base follows.
		if (env.X402_PAY_TO_SOLANA) {
			out.push({
				scheme: 'exact',
				network: NETWORK_SOLANA_MAINNET,
				network_label: 'solana-mainnet',
				amount: env.X402_MAX_AMOUNT_REQUIRED,
				price,
				payTo: env.X402_PAY_TO_SOLANA,
				asset: env.X402_ASSET_MINT_SOLANA,
				asset_symbol: 'USDC',
				maxTimeoutSeconds: 60,
				resource: resourceUrl,
				extra: { name: 'USDC', decimals: 6, feePayer: env.X402_FEE_PAYER_SOLANA },
			});
		}
		// Base only when settleable (CDP creds or the X402_ADVERTISE_BASE opt-in) —
		// else the catalog would advertise a rail the live 402 now drops. See baseSettleable().
		if (env.X402_PAY_TO_BASE && baseSettleable()) {
			pushAcceptWithPermit2Sibling(out, {
				scheme: 'exact',
				network: NETWORK_BASE_MAINNET,
				network_label: 'base-mainnet',
				amount: env.X402_MAX_AMOUNT_REQUIRED,
				price,
				payTo: env.X402_PAY_TO_BASE,
				asset: env.X402_ASSET_ADDRESS_BASE,
				asset_symbol: 'USDC',
				maxTimeoutSeconds: 60,
				resource: resourceUrl,
				extra: { name: 'USDC', version: '2', decimals: 6 },
			});
		}
		return out;
	}

	// model-check / mint-to-mesh / revenue-vision are CDP-Bazaar-cataloged.
	// CDP supports Base mainnet + Arbitrum One; advertise both here so
	// agentic.market shows the same network options buyers will see in the
	// live 402 challenge. Each EVM entry gets a Permit2 sibling so
	// EIP-2612-aware clients can pick the gasless Permit2-via-EIP-2612 path.
	const ARB_USDC = env.X402_ASSET_ADDRESS_ARBITRUM;
	function buildBazaarAccepts(resourceUrl) {
		const out = [];
		// Solana-first platform default — Solana leads the catalog entry. The
		// Base + Arbitrum accepts still follow so CDP keeps processing an EVM
		// verify+settle for agentic.market cataloging.
		if (env.X402_PAY_TO_SOLANA) {
			out.push({
				scheme: 'exact',
				network: NETWORK_SOLANA_MAINNET,
				network_label: 'solana-mainnet',
				amount: env.X402_MAX_AMOUNT_REQUIRED,
				price,
				payTo: env.X402_PAY_TO_SOLANA,
				asset: env.X402_ASSET_MINT_SOLANA,
				asset_symbol: 'USDC',
				maxTimeoutSeconds: 60,
				resource: resourceUrl,
				extra: { name: 'USDC', decimals: 6, feePayer: env.X402_FEE_PAYER_SOLANA },
			});
		}
		// Base + Arbitrum are CDP-settled EVM rails; advertise them only when a
		// working facilitator is configured (CDP creds or the X402_ADVERTISE_BASE
		// opt-in). Without one the live 402 drops Base, so an ungated catalog entry
		// would drift and 502.
		if (env.X402_PAY_TO_BASE && baseSettleable()) {
			pushAcceptWithPermit2Sibling(out, {
				scheme: 'exact',
				network: NETWORK_BASE_MAINNET,
				network_label: 'base-mainnet',
				amount: env.X402_MAX_AMOUNT_REQUIRED,
				price,
				payTo: env.X402_PAY_TO_BASE,
				asset: env.X402_ASSET_ADDRESS_BASE,
				asset_symbol: 'USDC',
				maxTimeoutSeconds: 60,
				resource: resourceUrl,
				extra: { name: 'USDC', version: '2', decimals: 6 },
			});
		}
		if (env.X402_PAY_TO_BASE && ARB_USDC && baseSettleable()) {
			pushAcceptWithPermit2Sibling(out, {
				scheme: 'exact',
				network: 'eip155:42161',
				network_label: 'arbitrum-one',
				amount: env.X402_MAX_AMOUNT_REQUIRED,
				price,
				payTo: env.X402_PAY_TO_BASE,
				asset: ARB_USDC,
				asset_symbol: 'USDC',
				maxTimeoutSeconds: 60,
				resource: resourceUrl,
				extra: { name: 'USDC', version: '2', decimals: 6 },
			});
		}
		return out;
	}

	const mcpAccepts = buildMcpAccepts(mcpUrl);
	const mcp3dAccepts = buildMcpAccepts(mcp3dUrl);
	const modelCheckAccepts = buildBazaarAccepts(modelCheckUrl);
	const mintToMeshAccepts = buildBazaarAccepts(mintToMeshUrl);
	const revenueVisionAccepts = buildBazaarAccepts(revenueVisionUrl);

	// USE-13: per-route Bazaar service metadata. Echoed on each resource[]
	// entry so facilitators crawling /.well-known/x402-discovery surface a
	// human-readable serviceName + topical tags + icon in their search UI.
	// Tags are deliberately short (≤32 chars each) and ≤5 entries per the
	// spec; iconUrl falls back to THREEWS_SERVICE.iconUrl when unset.
	const routeMeta = {
		modelCheck: withService({
			serviceName: 'three.ws Model Check',
			tags: ['3d', 'gltf', 'glb', 'inspection', 'validation'],
		}),
		mintToMesh: withService({
			serviceName: 'three.ws Mint to Mesh',
			tags: ['3d', 'gltf', 'solana', 'token', 'render'],
		}),
		mintToMeshBatch: withService({
			serviceName: 'three.ws Mint Mesh Batch',
			tags: ['3d', 'gltf', 'solana', 'batch', 'render'],
		}),
		revenueVision: withService({
			serviceName: 'three.ws Revenue Vision',
			tags: ['ai', 'analysis', 'growth', 'insight', 'claude'],
		}),
		mcp: withService({
			serviceName: 'three.ws MCP',
			tags: ['mcp', '3d', 'gltf', 'solana', 'agent'],
		}),
		agentReputation: withService({
			serviceName: 'three.ws Agent Reputation',
			tags: ['reputation', 'agent', 'solana', 'attestation', 'trust'],
		}),
		agentBouncer: withService({
			serviceName: 'three.ws Agent Bouncer',
			tags: ['reputation', 'trust', 'gate', 'agent', 'solana'],
		}),
		onchainIdentity: withService({
			serviceName: 'three.ws Identity Verify',
			tags: ['identity', 'verification', 'agent', 'trust', 'onchain'],
		}),
		pumpAudit: withService({
			serviceName: 'three.ws Pump Audit',
			tags: ['pump.fun', 'audit', 'agent', 'risk', 'solana'],
		}),
		pumpLaunch: withService({
			serviceName: 'three.ws Pump Launcher',
			tags: ['pump.fun', 'launch', 'deploy', 'token', 'solana', 'mint'],
		}),
		skillMarket: withService({
			serviceName: 'three.ws Skill Market',
			tags: ['marketplace', 'agent', 'skills', 'pricing', 'discovery'],
		}),
		skillCall: withService({
			serviceName: 'three.ws Skill Call',
			tags: ['skill', 'agent', 'tool', 'pay-per-call'],
		}),
		symbolCheck: withService({
			serviceName: 'three.ws Symbol Check',
			tags: ['ticker', 'pump.fun', 'collision', 'launch', 'solana'],
		}),
		vanity: withService({
			serviceName: 'three.ws Vanity Grinder',
			tags: ['solana', 'vanity', 'keypair', 'wallet', 'address'],
		}),
		vanityVerifiable: withService({
			serviceName: 'three.ws Provable Vanity Grinder',
			tags: ['solana', 'vanity', 'keypair', 'wallet', 'verifiable', 'commit-reveal'],
		}),
		permit2Demo: withService({
			serviceName: 'three.ws Permit2 Demo',
			tags: ['x402', 'permit2', 'eip2612', 'gasless', 'demo'],
		}),
		danceTip: withService({
			serviceName: 'three.ws Pole Club',
			tags: ['3d', 'avatar', 'club', 'tip', 'dance'],
		}),
		assetDownload: withService({
			serviceName: 'three.ws Asset Bazaar',
			tags: ['3d', 'asset', 'glb', 'avatar', 'download'],
		}),
		factCheck: withService({
			serviceName: 'three.ws Fact Checker',
			tags: ['fact-check', 'search', 'verification', 'llm', 'attestation'],
		}),
		tutor: withService({
			serviceName: 'three.ws Pay-As-You-Learn Tutor',
			tags: ['tutor', 'education', 'llm', 'explain', 'pay-per-call'],
		}),
		cryptoIntel: withService({
			serviceName: 'three.ws Crypto Intel',
			tags: ['crypto', 'market', 'signal', 'agent-exchange', 'solana'],
		}),
		threeIntel: withService({
			serviceName: '$THREE Town Oracle',
			tags: ['three', 'market', 'signal', 'play', 'solana'],
		}),
		tokenIntel: withService({
			serviceName: 'three.ws Token Oracle',
			tags: ['crypto', 'market', 'signal', 'oracle', 'solana'],
		}),
		avatarShop: withService({
			serviceName: 'three.ws Avatar Shop',
			tags: ['3d', 'avatar', 'cosmetic', 'shop', 'wearable'],
		}),
		animationDownload: withService({
			serviceName: 'three.ws Animation Bazaar',
			tags: ['3d', 'animation', 'glb', 'motion', 'avatar'],
		}),
		clubCover: withService({
			serviceName: 'three.ws Pole Club Cover',
			tags: ['3d', 'avatar', 'club', 'access', 'cover'],
		}),
		forge: withService({
			serviceName: 'three.ws Forge: text/image to 3D',
			tags: ['3d', 'generation', 'text-to-3d', 'image-to-3d', 'glb', 'mesh'],
		}),
		analytics: withService({
			serviceName: 'three.ws Social Analytics',
			tags: ['analytics', 'club', 'social', 'metrics', 'solana'],
		}),
		apiKeyHealth: withService({
			serviceName: 'three.ws API Key Health Check',
			tags: ['health', 'api-key', 'autonomous', 'access-control'],
		}),
		authHealth: withService({
			serviceName: 'three.ws Auth Session Health',
			tags: ['auth', 'session', 'jwt', 'health', 'security'],
		}),
		avatarOptimizeBatch: withService({
			serviceName: 'three.ws Avatar Optimizer',
			tags: ['3d', 'avatar', 'optimization', 'glb', 'batch'],
		}),
		bazaarFeed: withService({
			serviceName: 'three.ws Bazaar Feed',
			tags: ['bazaar', 'listings', 'discovery', 'market', 'x402'],
		}),
		billboard: withService({
			serviceName: 'three.ws Coin-World Billboard',
			tags: ['3d', 'world', 'billboard', 'content', 'placement'],
		}),
		crossChain: withService({
			serviceName: 'three.ws Bridge Status',
			tags: ['bridge', 'cross-chain', 'health', 'solana', 'wormhole'],
		}),
		did: withService({
			serviceName: 'three.ws DID Health',
			tags: ['did', 'identity', 'health', 'verification', 'x402'],
		}),
		feedHealth: withService({
			serviceName: 'three.ws Feed Health',
			tags: ['rss', 'feed', 'health', 'changelog', 'validation'],
		}),
		llmProxy: withService({
			serviceName: 'three.ws LLM Inference Proxy',
			tags: ['llm', 'inference', 'completion', 'proxy', 'benchmark'],
		}),
		mcpToolCatalog: withService({
			serviceName: 'three.ws MCP Tool Discovery',
			tags: ['mcp', 'discovery', 'tools', 'catalog', 'agent'],
		}),
		modelValidationSweep: withService({
			serviceName: 'three.ws Model Validation Sweep',
			tags: ['3d', 'gltf', 'glb', 'validation', 'quality'],
		}),
		notify: withService({
			serviceName: 'three.ws Notification Delivery',
			tags: ['notification', 'canary', 'health', 'delivery', 'ops'],
		}),
		payByName: withService({
			serviceName: 'Pay-By-Name Resolution',
			tags: ['identity', 'resolution', 'solana'],
		}),
		rateLimitProbe: withService({
			serviceName: 'three.ws Rate-Limit Probe',
			tags: ['rate-limit', 'capacity', 'health', 'oracle', 'agent'],
		}),
		schemaCheck: withService({
			serviceName: 'three.ws JSON API Schema Check',
			tags: ['schema', 'validation', 'changelog', 'health', 'api'],
		}),
		solanaRegisterHealth: withService({
			serviceName: 'three.ws Solana Reg Health',
			tags: ['health', 'solana', 'registration', 'agent', 'canary'],
		}),
		spendSession: withService({
			serviceName: 'three.ws Spend Session Health',
			tags: ['health', 'governance', 'payment-session', 'canary', 'x402'],
		}),
		telegramHealth: withService({
			serviceName: 'three.ws Telegram Bot Health',
			tags: ['health', 'telegram', 'bot', 'changelog', 'canary'],
		}),
		walletConnect: withService({
			serviceName: 'three.ws Wallet Connect Health',
			tags: ['health', 'wallet', 'siws', 'session', 'auth'],
		}),
	};

	// USE-13: per-tool MCP catalog entries. Each priced tool is its own
	// catalog row keyed on (resource, toolName) so search can find them
	// individually instead of all hiding behind the parent /api/mcp resource.
	// Built from the live TOOL_CATALOG so adding a new priced tool only
	// requires a pricing entry; the discovery shape follows automatically.
	const mcpToolItems = buildMcpToolItems({
		path: '/api/mcp',
		mcpUrl,
		mcpAccepts,
		mcpService: routeMeta.mcp,
		catalog: TOOL_CATALOG,
		priceForTool: priceFor,
	});

	// 3D Studio paid tools — one row per priced tool so "text to 3d" searches
	// on facilitators land on the tool, not just the transport. Service
	// identity comes from STUDIO_CHALLENGE (same source as the live 402).
	const studioService = {
		serviceName: STUDIO_CHALLENGE.serviceName,
		tags: STUDIO_CHALLENGE.tags,
		iconUrl: STUDIO_CHALLENGE.iconUrl,
	};
	const studioToolItems = buildMcpToolItems({
		path: '/api/mcp-3d',
		mcpUrl: mcp3dUrl,
		mcpAccepts: mcp3dAccepts,
		mcpService: studioService,
		catalog: STUDIO_TOOL_CATALOG,
		priceForTool: studioPriceFor,
	});

	// Agent-published paid services — dynamic, one entry per active listing.
	const agentServiceItems = await buildAgentServiceItems(origin);

	return json(
		res,
		200,
		{
			$schema: 'https://x402.org/schemas/discovery.json',
			service: {
				name: 'three.ws',
				legal_name: 'three.ws',
				tagline: 'AI-powered 3D model viewer and validation agent.',
				description:
					'three.ws is an agent-first 3D model platform. Drag-and-drop glTF/GLB preview, model validation/inspection/optimization, plus Solana agent data — reachable both as MCP tool calls and as paid REST endpoints (x402 v2). USDC on Base, Arbitrum, and Solana mainnet.',
				operator: 'three.ws',
				mission:
					'Make 3D model tooling and Solana agent data machine-native so any AI agent can transact with the HTTP 402 protocol.',
				website: origin,
				docs: `${origin}/docs/mcp`,
				repository: 'https://github.com/nirholas/three.ws',
				contact: `${origin}/`,
				tags: [
					'x402',
					'x402-v2',
					'mcp',
					'agent-first',
					'3d',
					'gltf',
					'glb',
					'three-js',
					'solana',
					'base',
					'arbitrum',
					'usdc',
				],
				environment: 'apex',
				origin,
			},
			// `.filter(Boolean)` drops any resource whose IIFE returned null —
			// e.g. permit2-paid-demo is omitted when CDP creds are missing,
			// matching the runtime 402 behavior so we don't catalog a route that
			// would fail at first paid call. The trailing .map(addOutputExample)
			// backfills a realistic response example onto every entry so indexers
			// render and rank each one (no empty result cards, no verifier warnings).
			resources: [
				{
					path: '/api/x402/model-check',
					url: modelCheckUrl,
					method: 'GET',
					description:
						'Fetches a glTF/GLB model from a URL and returns structural stats (vertex/triangle counts, materials, textures, animations, extensions) plus a prioritized list of optimization recommendations. Single GET, ?url=…. CDP-Bazaar-cataloged.',
					mimeType: 'application/json',
					serviceName: routeMeta.modelCheck.serviceName,
					tags: routeMeta.modelCheck.tags,
					iconUrl: routeMeta.modelCheck.iconUrl,
					accepts: modelCheckAccepts,
					extensions: extensionsForAccepts(modelCheckAccepts, {
						method: 'GET',
						discoverable: true,
						input: { url: 'https://three.ws/avatar/character-studio/sample.glb' },
						inputSchema: {
							type: 'object',
							required: ['url'],
							properties: {
								url: {
									type: 'string',
									format: 'uri',
									description: 'Public HTTPS URL of a glTF/GLB model.',
								},
							},
						},
					}),
				},
				{
					path: '/api/x402/mint-to-mesh',
					url: mintToMeshUrl,
					method: 'GET',
					description:
						'Mint to Mesh — pass a Solana fungible-token mint, get back a binary glTF (GLB) cube themed for that token. Color is derived from a stable hash of the mint; when the off-chain Metaplex JSON exposes a PNG/JPEG, that image is embedded as a baseColor texture on every face. Asset.extras carry mint, name, symbol, and timestamp. Useful for any agent that needs an instantly renderable 3D representation of a token. CDP-Bazaar-cataloged.',
					mimeType: 'application/json',
					serviceName: routeMeta.mintToMesh.serviceName,
					tags: routeMeta.mintToMesh.tags,
					iconUrl: routeMeta.mintToMesh.iconUrl,
					accepts: mintToMeshAccepts,
					extensions: extensionsForAccepts(mintToMeshAccepts, {
						method: 'GET',
						discoverable: true,
						input: { mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump' },
						inputSchema: {
							type: 'object',
							required: ['mint'],
							properties: {
								mint: {
									type: 'string',
									minLength: 32,
									maxLength: 64,
									description: 'Base58 SPL mint address on Solana mainnet.',
								},
							},
						},
					}),
				},
				{
					path: '/api/insights/revenue-vision',
					url: revenueVisionUrl,
					method: 'GET',
					description:
						'Revenue Vision — agentic growth analysis powered by Claude. Hand over a mission_brief and get back a single prioritized next-best move, a data-grounded insight, and an honestly-calibrated confidence rating. CDP-Bazaar-cataloged.',
					mimeType: 'application/json',
					serviceName: routeMeta.revenueVision.serviceName,
					tags: routeMeta.revenueVision.tags,
					iconUrl: routeMeta.revenueVision.iconUrl,
					accepts: revenueVisionAccepts,
					extensions: extensionsForAccepts(revenueVisionAccepts, {
						method: 'GET',
						discoverable: true,
						input: {
							agent_codename: 'ledger-bot',
							power_request: 'revenue-vision',
							mission_brief: 'Find the highest-converting buyer segment this week.',
						},
						inputSchema: {
							type: 'object',
							required: ['agent_codename', 'power_request', 'mission_brief'],
							properties: {
								agent_codename: { type: 'string' },
								power_request: { type: 'string', enum: ['revenue-vision'] },
								mission_brief: {
									type: 'string',
									minLength: 4,
									maxLength: 4000,
								},
							},
						},
					}),
				},
				{
					path: '/api/mcp',
					url: mcpUrl,
					method: 'POST',
					description:
						'MCP 2025-06-18 Streamable HTTP transport — 3D avatar viewer, glTF model validation/inspection/optimization, and Solana agent data exposed as MCP tools. JSON-RPC 2.0 batch-aware. Currency: USDC.',
					mimeType: 'application/json',
					serviceName: routeMeta.mcp.serviceName,
					tags: routeMeta.mcp.tags,
					iconUrl: routeMeta.mcp.iconUrl,
					accepts: mcpAccepts,
					extensions: extensionsForAccepts(mcpAccepts, bazaarExtension()),
					links: {
						openapi: `${origin}/openapi.json`,
						docs: `${origin}/docs/mcp`,
						agent_card: `${origin}/.well-known/agent-card.json`,
						payment_config: `${origin}/.well-known/x402`,
					},
				},
				{
					path: '/api/mcp-3d',
					url: mcp3dUrl,
					method: 'POST',
					description: STUDIO_CHALLENGE.description,
					mimeType: 'application/json',
					serviceName: STUDIO_CHALLENGE.serviceName,
					tags: STUDIO_CHALLENGE.tags,
					iconUrl: STUDIO_CHALLENGE.iconUrl,
					accepts: mcp3dAccepts,
					extensions: extensionsForAccepts(mcp3dAccepts, STUDIO_CHALLENGE.bazaar),
					links: {
						docs: `${origin}/docs/mcp-3d-studio`,
						payment_config: `${origin}/.well-known/x402`,
					},
				},
				(() => {
					const url = `${origin}/api/x402/agent-reputation`;
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/agent-reputation',
						url,
						method: 'GET',
						description:
							"Agent Reputation — return a reputation snapshot for a three.ws agent (USDC paid in to its pump-agent tokens, distinct payers, deployed mints, distribution success rate, Solana attestation counts). Built from three.ws's proprietary index of pump_agent_payments, pump_distribute_runs, and solana_attestations.",
						mimeType: 'application/json',
						serviceName: routeMeta.agentReputation.serviceName,
						tags: routeMeta.agentReputation.tags,
						iconUrl: routeMeta.agentReputation.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55' },
							inputSchema: {
								type: 'object',
								required: ['agent_id'],
								properties: { agent_id: { type: 'string', format: 'uuid' } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/agent-bouncer`;
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/agent-bouncer',
						url,
						method: 'GET',
						description:
							'Agent Bouncer — the Pole Club door check, opened to the whole platform’s Solana reputation. Given a three.ws agent_id and an optional trust policy, read the agent’s Solana track record (confirmed on-chain payments, distinct payers, payment failure rate, distribute/buyback follow-through, signed Solana attestations, Club ban/tip ledger) and return an admit/refuse verdict with a door tier (newcomer / regular / trusted / vip). Vet a counterparty before paying, hiring, or delegating.',
						mimeType: 'application/json',
						serviceName: routeMeta.agentBouncer.serviceName,
						tags: routeMeta.agentBouncer.tags,
						iconUrl: routeMeta.agentBouncer.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: {
								agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
								min_payments: 10,
								min_distinct_payers: 3,
								max_failure_rate: 0.2,
							},
							inputSchema: {
								type: 'object',
								required: ['agent_id'],
								properties: {
									agent_id: { type: 'string', format: 'uuid' },
									min_payments: { type: 'integer' },
									min_distinct_payers: { type: 'integer' },
									max_failure_rate: { type: 'number' },
									min_attestations: { type: 'integer' },
									allow_newcomers: { type: 'boolean' },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/onchain-identity-verify`;
					const accepts = acceptsForPrice('5000', url);
					return {
						path: '/api/x402/onchain-identity-verify',
						url,
						method: 'GET',
						description:
							'On-Chain Identity Verifier — given a three.ws agent_id + CAIP-2 chain + contract/mint, verify ownership from the canonical meta.onchain index and return tx_hash/wallet/deploy time evidence when verified. Trust primitive before paying counterparty agents.',
						mimeType: 'application/json',
						serviceName: routeMeta.onchainIdentity.serviceName,
						tags: routeMeta.onchainIdentity.tags,
						iconUrl: routeMeta.onchainIdentity.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: {
								agent_id: '7b9a4f30-2d11-4e2d-9d12-1cdb1f6a3a55',
								chain: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
								contract_or_mint: 'C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi',
							},
							inputSchema: {
								type: 'object',
								required: ['agent_id', 'chain', 'contract_or_mint'],
								properties: {
									agent_id: { type: 'string', format: 'uuid' },
									chain: { type: 'string', description: 'CAIP-2 chain ID' },
									contract_or_mint: { type: 'string' },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/pump-agent-audit`;
					const accepts = acceptsForPrice('20000', url);
					return {
						path: '/api/x402/pump-agent-audit',
						url,
						method: 'GET',
						description:
							"Pump-Agent Audit — full operational audit of a pump.fun agent-payments token: total USDC in, unique payers, distribute/buyback success history, latest error reasons, and risk flags (never_distributed, high_distribute_failure_rate, no_buybacks_run). Backed by three.ws's indexed pump_distribute_runs and pump_buyback_runs tables.",
						mimeType: 'application/json',
						serviceName: routeMeta.pumpAudit.serviceName,
						tags: routeMeta.pumpAudit.tags,
						iconUrl: routeMeta.pumpAudit.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { mint: 'C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi' },
							inputSchema: {
								type: 'object',
								required: ['mint'],
								properties: {
									mint: { type: 'string', minLength: 32, maxLength: 44 },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/pump-launch`;
					const accepts = acceptsForPrice('5000000', url);
					return {
						path: '/api/x402/pump-launch',
						url,
						method: 'POST',
						description:
							'Pump Launcher — deploy a brand-new pump.fun token in one paid call. Supply name + symbol and either a pre-pinned metadataUri or an imageUrl (we pin the image + descriptor to pump.fun IPFS). The server fronts the SOL deploy cost and signs the create-coin tx, so the buyer needs no SOL and no account. Creator rewards accrue to any Solana wallet you nominate; optional vanity prefix/suffix grinds a custom mint address. Returns mint + tx signature + pump.fun URL.',
						mimeType: 'application/json',
						serviceName: routeMeta.pumpLaunch.serviceName,
						tags: routeMeta.pumpLaunch.tags,
						iconUrl: routeMeta.pumpLaunch.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: {
								name: 'Helios',
								symbol: 'HELIO',
								imageUrl: 'https://example.com/helios.png',
								creator: 'wwwPqsM4N7T9J69tB82nLyzxqsH159j4orftLTQfUGV',
							},
							inputSchema: {
								type: 'object',
								required: ['name', 'symbol'],
								properties: {
									name: { type: 'string', maxLength: 32 },
									symbol: { type: 'string', maxLength: 10 },
									metadataUri: { type: 'string', maxLength: 2048 },
									imageUrl: { type: 'string', maxLength: 2048 },
									description: { type: 'string', maxLength: 2000 },
									creator: { type: 'string', minLength: 32, maxLength: 44 },
									vanityPrefix: { type: 'string', maxLength: 5 },
									vanitySuffix: { type: 'string', maxLength: 5 },
								},
							},
						}),
					};
				})(),
				(() => {
					// Forge generation is tier-priced ($0.05 draft / $0.15 standard /
					// $0.50 high). The catalog advertises the standard tier (sourced
					// from forge-tiers.js — the single price source); the live 402
					// quotes the exact price for the requested tier.
					const url = `${origin}/api/x402/forge`;
					const accepts = acceptsForPrice(String(priceAtomicsForTier('standard')), url);
					return {
						path: '/api/x402/forge',
						url,
						method: 'POST',
						description:
							'Forge — pay-per-call text→3D and image→3D. Submit a prompt (or up to four reference views of one object) and receive a job token; poll it for free at GET /api/forge?job=<id> for the finished GLB. Runs the FLUX→TRELLIS pipeline (text→image→mesh, or image→mesh). Priced per quality tier in USDC ($0.05 draft / $0.15 standard / $0.50 high). Pay autonomously on Base or Solana mainnet — no API key, no account.',
						mimeType: 'application/json',
						serviceName: routeMeta.forge.serviceName,
						tags: routeMeta.forge.tags,
						iconUrl: routeMeta.forge.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: {
								prompt: 'a brass steampunk owl, full body',
								tier: 'standard',
								aspect_ratio: '1:1',
							},
							inputSchema: {
								type: 'object',
								properties: {
									prompt: {
										type: 'string',
										minLength: 3,
										maxLength: 1000,
										description:
											'Describe one subject for text→3D. Omit when supplying image_urls.',
									},
									image_urls: {
										type: 'array',
										items: { type: 'string', format: 'uri' },
										minItems: 1,
										maxItems: 4,
										description:
											'Up to four public https reference views of one object for image→3D.',
									},
									tier: { type: 'string', enum: ['draft', 'standard', 'high'] },
									aspect_ratio: {
										type: 'string',
										enum: ['1:1', '4:3', '3:4', '16:9', '9:16'],
									},
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/skill-marketplace`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/skill-marketplace',
						url,
						method: 'GET',
						description:
							'Skill Marketplace — list active skill listings with prices across all three.ws agents. Filter by skill name to find the cheapest provider for a given capability. Returns price atomics, chain, currency, trial offer, and time-pass terms.',
						mimeType: 'application/json',
						serviceName: routeMeta.skillMarket.serviceName,
						tags: routeMeta.skillMarket.tags,
						iconUrl: routeMeta.skillMarket.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { skill: 'inspect_model', limit: 20 },
							inputSchema: {
								type: 'object',
								properties: {
									skill: { type: 'string' },
									limit: { type: 'integer', minimum: 1, maximum: 200 },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/symbol-availability`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/symbol-availability',
						url,
						method: 'GET',
						description:
							"Symbol Availability — pre-launch ticker collision check against three.ws's pump.fun mint index. Returns exact-symbol collisions plus trigram-similar tickers so launch agents can avoid name confusion and aggregator-search dilution.",
						mimeType: 'application/json',
						serviceName: routeMeta.symbolCheck.serviceName,
						tags: routeMeta.symbolCheck.tags,
						iconUrl: routeMeta.symbolCheck.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { ticker: 'HELIO', network: 'mainnet' },
							inputSchema: {
								type: 'object',
								required: ['ticker'],
								properties: {
									ticker: { type: 'string', minLength: 1, maxLength: 32 },
									network: { type: 'string', enum: ['mainnet', 'devnet'] },
								},
							},
						}),
					};
				})(),
				(() => {
					// Vanity grind is difficulty-tiered ($0.01–$0.25); the catalog
					// advertises the 1-char entry tier ('10000' = $0.01) while the live
					// 402 quotes the exact price for the requested pattern length.
					const url = `${origin}/api/x402/vanity`;
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/vanity',
						url,
						method: 'GET',
						description:
							'Vanity Grinder — generate a brand-new Solana keypair whose Base58 address starts with a chosen prefix and/or ends with a chosen suffix. Returns the public address and its secret key (Base58 + 64-byte array) so it imports into any Solana wallet. Ground fresh per request in a Rust/WASM ed25519 engine and never stored. Difficulty-tiered price ($0.01 for 1 char, $0.05 for 2, $0.25 for 3); combined pattern capped at 3 Base58 characters. Settlement runs only after a successful grind, so an exhausted budget costs nothing.',
						mimeType: 'application/json',
						serviceName: routeMeta.vanity.serviceName,
						tags: routeMeta.vanity.tags,
						iconUrl: routeMeta.vanity.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { prefix: 'So', suffix: '', ignoreCase: '0' },
							inputSchema: {
								type: 'object',
								anyOf: [{ required: ['prefix'] }, { required: ['suffix'] }],
								properties: {
									prefix: {
										type: 'string',
										maxLength: 3,
										description:
											'Base58 characters the address must start with (excludes 0, O, I, l). Combined with suffix, max 3.',
									},
									suffix: {
										type: 'string',
										maxLength: 3,
										description:
											'Base58 characters the address must end with. Combined with prefix, max 3.',
									},
									ignoreCase: {
										type: 'string',
										enum: ['0', '1', 'true', 'false'],
										description:
											'When 1/true, match case-insensitively (faster, less specific).',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					// Provably-fair vanity grind: same difficulty tiers as /vanity with a
					// small premium for the deterministic derivation + signed receipt. The
					// catalog advertises the 1-char entry tier ('20000' = $0.02); the live
					// 402 quotes the exact price for the requested pattern length.
					const url = `${origin}/api/x402/vanity-verifiable`;
					const accepts = acceptsForPrice('20000', url);
					return {
						path: '/api/x402/vanity-verifiable',
						url,
						method: 'GET',
						description:
							'Provably-Fair Vanity Grinder — generate a brand-new Solana keypair whose Base58 address starts with a chosen prefix and/or ends with a chosen suffix, with a SIGNED receipt that proves the key was ground fresh and never kept. The server commits to a random 32-byte seed (commitment = SHA-256(serverSeed)) BEFORE grinding, mixes in your optional clientSeed, derives each candidate deterministically (HMAC-SHA256 → Ed25519), and signs the receipt with its long-lived service key (published at /.well-known/three-vanity.json). Pass sealTo=<X25519 public key> and the secret is ECIES-sealed to you — plaintext never appears in the response or any log. Verify entirely client-side with @three-ws/solana-agent verifyVanityReceipt(), the CLI, or three.ws/vanity/verify. Combined pattern capped at 3 Base58 chars, priced $0.02–$0.40; settlement runs only after a successful grind, so an exhausted budget costs nothing.',
						mimeType: 'application/json',
						serviceName: routeMeta.vanityVerifiable.serviceName,
						tags: routeMeta.vanityVerifiable.tags,
						iconUrl: routeMeta.vanityVerifiable.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { prefix: 'So', suffix: '', ignoreCase: '0', sealTo: '' },
							inputSchema: {
								type: 'object',
								anyOf: [{ required: ['prefix'] }, { required: ['suffix'] }],
								properties: {
									prefix: {
										type: 'string',
										maxLength: 3,
										description:
											'Base58 characters the address must start with (excludes 0, O, I, l). Combined with suffix, max 3.',
									},
									suffix: {
										type: 'string',
										maxLength: 3,
										description:
											'Base58 characters the address must end with. Combined with prefix, max 3.',
									},
									ignoreCase: {
										type: 'string',
										enum: ['0', '1', 'true', 'false'],
										description:
											'When 1/true, match case-insensitively (faster, less specific).',
									},
									sealTo: {
										type: 'string',
										description:
											'Recommended. Your 32-byte X25519 public key (Base58/Base64url/hex). When set, the secret is ECIES-sealed to it and omitted from the response.',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					// Permit2-only demo: skip the EIP-3009 entry that acceptsForPrice
					// would push first, so SDK clients are forced through the gasless
					// EIP-2612 → settleWithPermit path the endpoint is meant to prove.
					// permit2VariantOf returns null without CDP creds, in which case we
					// omit the resource from discovery (matches the runtime 402 behavior).
					const url = `${origin}/api/x402/permit2-paid-demo`;
					const price = RAW_AMOUNT_TO_USDC('1000');
					const baseAccept = env.X402_PAY_TO_BASE
						? {
								scheme: 'exact',
								network: NETWORK_BASE_MAINNET,
								network_label: 'base-mainnet',
								amount: '1000',
								price,
								payTo: env.X402_PAY_TO_BASE,
								asset: env.X402_ASSET_ADDRESS_BASE,
								asset_symbol: 'USDC',
								maxTimeoutSeconds: 60,
								resource: url,
								extra: { name: 'USD Coin', version: '2', decimals: 6 },
							}
						: null;
					const permit2 = baseAccept ? permit2VariantOf(baseAccept) : null;
					if (!permit2) return null;
					const accepts = [permit2];
					return {
						path: '/api/x402/permit2-paid-demo',
						url,
						method: 'GET',
						description:
							"Permit2 + EIP-2612 Gas Sponsoring Demo — forces the gasless Permit2 path so a fresh wallet holding USDC but ZERO ETH can complete the flow. CDP's x402ExactPermit2Proxy submits the EIP-2612 permit + Permit2 transfer atomically via settleWithPermit. Response surfaces the on-chain tx hash and a Basescan link.",
						mimeType: 'application/json',
						serviceName: routeMeta.permit2Demo.serviceName,
						tags: routeMeta.permit2Demo.tags,
						iconUrl: routeMeta.permit2Demo.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: {},
							inputSchema: {
								type: 'object',
								properties: {},
								additionalProperties: false,
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/mint-to-mesh-batch`;
					const accepts = acceptsForPrice('50000', url);
					return {
						path: '/api/x402/mint-to-mesh-batch',
						url,
						method: 'POST',
						description:
							'Mint-to-Mesh (Batch) — resolve 1–10 Solana SPL mints to themed binary glTF cubes in a single paid call. Per-mint failures report ok:false individually instead of failing the whole batch. Output is base64 GLB bytes for Three.js / Babylon.js / model-viewer.',
						mimeType: 'application/json',
						serviceName: routeMeta.mintToMeshBatch.serviceName,
						tags: routeMeta.mintToMeshBatch.tags,
						iconUrl: routeMeta.mintToMeshBatch.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: {
								mints: [
									'C3vQABCDEFGHJKLMNopqrstuvwxyZ12345abcdefghi',
									'F7kXZYXWVUTSRQPONMLKJIHGFEDCba9876543210xyz',
								],
							},
							inputSchema: {
								type: 'object',
								required: ['mints'],
								properties: {
									mints: {
										type: 'array',
										minItems: 1,
										maxItems: 10,
										items: { type: 'string', minLength: 32, maxLength: 44 },
									},
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/dance-tip`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/dance-tip',
						url,
						method: 'GET',
						description:
							'three.ws Pole Club — tip a dancer to perform one routine on the 3D pole stage. Pay $0.001 USDC per performance. Pick a dancer slot (1-4) and a dance style. The settled call returns a performance ticket the /club page consumes to spawn the dancer and play the routine for ~12 seconds.',
						mimeType: 'application/json',
						serviceName: routeMeta.danceTip.serviceName,
						tags: routeMeta.danceTip.tags,
						iconUrl: routeMeta.danceTip.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { dancer: '1', dance: 'rumba' },
							inputSchema: {
								type: 'object',
								required: ['dancer', 'dance'],
								properties: {
									dancer: {
										type: 'string',
										enum: ['1', '2', '3', '4'],
										description:
											'Stage slot 1-4 — which dancer should take the pole.',
									},
									dance: {
										type: 'string',
										enum: ['rumba', 'silly', 'thriller', 'capoeira', 'hiphop'],
										description:
											'Performance style — a clip in /animations/manifest.json.',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					// Asset Bazaar advertises a representative price ($0.10 USDC =
					// 100_000 atomics); the live 402 challenge always reflects the
					// per-asset row from the paid_assets table. The discovery entry
					// is a placeholder so the Bazaar indexer can find the route;
					// per-asset listings would explode the catalog and aren't worth
					// the noise here. The `?slug=<slug>` query param is documented
					// in the input schema so crawlers know how to drive it.
					const url = `${origin}/api/x402/asset-download`;
					const accepts = acceptsForPrice('100000', url);
					return {
						path: '/api/x402/asset-download',
						url,
						method: 'GET',
						description:
							'three.ws Asset Bazaar — pay once in USDC to unlock a 3D asset (GLB, avatar, or accessory) hosted on R2. Wallets that have already paid can re-download for free by signing in with SIWX (CAIP-122). Each asset has its own price and creator payout address; the response carries a short-lived presigned R2 URL the client uses to fetch the file directly.',
						mimeType: 'application/json',
						serviceName: routeMeta.assetDownload.serviceName,
						tags: routeMeta.assetDownload.tags,
						iconUrl: routeMeta.assetDownload.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { slug: 'pole-dancer-rumba' },
							inputSchema: {
								type: 'object',
								required: ['slug'],
								properties: {
									slug: {
										type: 'string',
										minLength: 1,
										maxLength: 128,
										description:
											'Unique asset slug from the paid_assets catalog.',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/skill-call`;
					// Per-call price is set per skill from marketplace_skills; advertise
					// a representative $0.01 so facilitators can index the route.
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/skill-call',
						url,
						method: 'GET',
						description:
							"three.ws Skill Call — pay the per-call price of a marketplace skill in USDC (Base or Solana) and receive its executable payload: the tool schema and content the calling agent runs. Payment settles straight to the skill author's wallet. Per-call pricing — every invocation is a fresh payment.",
						mimeType: 'application/json',
						serviceName: routeMeta.skillCall.serviceName,
						tags: routeMeta.skillCall.tags,
						iconUrl: routeMeta.skillCall.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { skill: 'wallet-balance' },
							inputSchema: {
								type: 'object',
								required: ['skill'],
								properties: {
									skill: {
										type: 'string',
										minLength: 1,
										maxLength: 128,
										description:
											'Unique skill slug from the marketplace_skills catalog.',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/fact-check`;
					const accepts = acceptsForPrice('100000', url);
					return {
						path: '/api/x402/fact-check',
						url,
						method: 'POST',
						description:
							'three.ws Fact Checker — pay $0.10 USDC to verify a factual claim. Generates search queries, runs multi-source web search, extracts per-source stance with an LLM, computes a weighted verdict + confidence, and returns supporting sources plus a SHA-256 attestation of the result.',
						mimeType: 'application/json',
						serviceName: routeMeta.factCheck.serviceName,
						tags: routeMeta.factCheck.tags,
						iconUrl: routeMeta.factCheck.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { claim: 'The Eiffel Tower is in Paris.', strictness: 'medium' },
							inputSchema: {
								type: 'object',
								required: ['claim'],
								properties: {
									claim: {
										type: 'string',
										minLength: 5,
										maxLength: 1000,
										description: 'The factual claim to verify.',
									},
									strictness: {
										type: 'string',
										enum: ['high', 'medium', 'low'],
										description:
											'high: penalizes low-authority sources. medium: default. low: accepts all sources equally.',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/tutor`;
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/tutor',
						url,
						method: 'POST',
						description:
							'three.ws Pay-As-You-Learn Tutor — pay $0.01 USDC per answered question. Returns a leveled explanation, key points, a worked example, and a follow-up, plus a running session tab for a live itemized invoice. Pass a sessionId to accumulate a tab across questions.',
						mimeType: 'application/json',
						serviceName: routeMeta.tutor.serviceName,
						tags: routeMeta.tutor.tags,
						iconUrl: routeMeta.tutor.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { question: 'Why is the sky blue?', level: 'intermediate' },
							inputSchema: {
								type: 'object',
								required: ['question'],
								properties: {
									sessionId: {
										type: 'string',
										maxLength: 100,
										description:
											'Stable session identifier to accumulate a running tab. Omit to start a new session.',
									},
									question: {
										type: 'string',
										minLength: 5,
										maxLength: 2000,
										description: 'The question to be explained.',
									},
									context: {
										type: 'string',
										maxLength: 6000,
										description:
											'Optional code or context to ground the explanation.',
									},
									level: {
										type: 'string',
										enum: ['beginner', 'intermediate', 'expert'],
										description:
											'Target expertise level — controls depth and assumed background.',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/crypto-intel`;
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/crypto-intel',
						url,
						method: 'POST',
						description:
							'three.ws Crypto Intel — Agent-to-Agent crypto intelligence feed. Pay $0.01 USDC per call to receive a live market signal (bullish / bearish / neutral) with current price, 24 h change, and a two-sentence rationale. Powered by CoinGecko live prices. Powers the three.ws agent-exchange demo where two 3D avatars trade real intel for real USDC settled on-chain.',
						mimeType: 'application/json',
						serviceName: routeMeta.cryptoIntel.serviceName,
						tags: routeMeta.cryptoIntel.tags,
						iconUrl: routeMeta.cryptoIntel.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { topic: 'sol' },
							inputSchema: {
								type: 'object',
								properties: {
									topic: {
										type: 'string',
										description:
											'Token ticker or CoinGecko id: btc, sol, eth, xrp, …',
										default: 'sol',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/three-intel`;
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/three-intel',
						url,
						method: 'GET',
						description:
							'$THREE Town Oracle — pay $0.01 USDC per call for live $THREE market intel: price, 24 h change, market cap, liquidity, 24 h volume, and a bullish / bearish / neutral signal with a two-sentence rationale. Powered by live DexScreener data. This is the oracle behind the paid intel kiosk in the $THREE town on three.ws/play.',
						mimeType: 'application/json',
						serviceName: routeMeta.threeIntel.serviceName,
						tags: routeMeta.threeIntel.tags,
						iconUrl: routeMeta.threeIntel.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: {},
							inputSchema: { type: 'object', properties: {} },
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/token-intel`;
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/token-intel',
						url,
						method: 'GET',
						description:
							'three.ws Token Oracle — pay $0.01 USDC per call for live market intel on ANY token by contract address: price, 24 h change, market cap, liquidity, 24 h volume, and a bullish / bearish / neutral signal with a two-sentence rationale. Pass ?mint=<contract-address> (Solana mint or EVM 0x). The mint is supplied at runtime — generic coin-agnostic plumbing. Powered by live DexScreener data; this is the paid endpoint the CA-to-x402 resolver generates.',
						mimeType: 'application/json',
						serviceName: routeMeta.tokenIntel.serviceName,
						tags: routeMeta.tokenIntel.tags,
						iconUrl: routeMeta.tokenIntel.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump' },
							inputSchema: {
								type: 'object',
								required: ['mint'],
								properties: {
									mint: {
										type: 'string',
										description:
											'Token contract address — Solana base58 mint or EVM 0x address.',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					// Avatar Shop pricing is per-rarity ($0.25 common → $3.00
					// legendary). The catalog advertises the rare tier ('500000' =
					// $0.50) as a representative price; the live 402 challenge always
					// quotes the exact USDC amount for the requested cosmetic id.
					const url = `${origin}/api/x402/cosmetic-purchase`;
					const accepts = acceptsForPrice('500000', url);
					return {
						path: '/api/x402/cosmetic-purchase',
						url,
						method: 'GET',
						description:
							'three.ws Avatar Shop — pay once in USDC to unlock a premium avatar cosmetic (skin or emote) for an account. Pay on Base or Solana; the cosmetic is recorded to the buyer-specified account and is wearable across /play and /walk. Wallets that already purchased an item re-confirm for free by signing in with SIWX (CAIP-122). Price varies by rarity ($0.25–$3.00 USDC).',
						mimeType: 'application/json',
						serviceName: routeMeta.avatarShop.serviceName,
						tags: routeMeta.avatarShop.tags,
						iconUrl: routeMeta.avatarShop.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { id: 'skin-midnight', account: 'g_5f3c9a21b8' },
							inputSchema: {
								type: 'object',
								required: ['id', 'account'],
								properties: {
									id: {
										type: 'string',
										minLength: 1,
										maxLength: 64,
										description:
											'Premium cosmetic id from /api/cosmetics/catalog.',
									},
									account: {
										type: 'string',
										minLength: 3,
										maxLength: 64,
										description:
											'Account the cosmetic is granted to — a Solana wallet address or a guest id (g_…).',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					// Animation price is per-animation (from DB); advertise a
					// representative $0.01 so facilitators can index the route.
					const url = `${origin}/api/x402/animation-download`;
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/animation-download',
						url,
						method: 'GET',
						description:
							'three.ws Animation Bazaar — pay once in USDC to unlock a 3D avatar animation (GLB). Each animation has its own price; the response carries a short-lived presigned URL the client fetches directly. Wallets that have already paid can re-download for free by signing in with SIWX.',
						mimeType: 'application/json',
						serviceName: routeMeta.animationDownload.serviceName,
						tags: routeMeta.animationDownload.tags,
						iconUrl: routeMeta.animationDownload.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: { id: 'pole-dancer-rumba' },
							inputSchema: {
								type: 'object',
								required: ['id'],
								properties: {
									id: {
										type: 'string',
										minLength: 1,
										maxLength: 128,
										description: 'Animation slug or UUID from the animations catalog.',
									},
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/club-cover`;
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/club-cover',
						url,
						method: 'GET',
						description:
							'three.ws Pole Club Cover Charge — pay $0.01 USDC to access the three.ws Pole Club. Once the payment settles the caller receives an entry token granting access to the live club scene for 24 hours.',
						mimeType: 'application/json',
						serviceName: routeMeta.clubCover.serviceName,
						tags: routeMeta.clubCover.tags,
						iconUrl: routeMeta.clubCover.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: {},
							inputSchema: { type: 'object', properties: {} },
						}),
					};
				})(),
				// Platform-operations + autonomous-loop paid endpoints. Each is a
				// real x402-gated route (paidEndpoint / send402) that powers the
				// self-running platform — health canaries, analytics oracles, the
				// LLM proxy, the bazaar/feed monitors. Cataloged here so x402
				// indexers (CDP Bazaar / agentic.market / x402scan) can find them.
				(() => {
					const url = `${origin}/api/x402/analytics`;
					const accepts = acceptsForPrice('5000', url);
					return {
						path: '/api/x402/analytics',
						url,
						method: 'POST',
						description:
							'three.ws Economy Analytics — pay $0.005 USDC per call for a live, aggregated view of platform activity. "clubs": Pole Club economy — active stages, patrons, tip volume, cover charges, fastest-growing leaderboard. "agent_leaderboard": top agents by USDC spend over a trailing window. "marketplace": catalog stats — active listing count, price distribution normalised to USD + SOL at the live rate, new listings in the window, and the most-viewed / most-forked listing. All numbers are read live from the real ledgers and catalog tables.',
						mimeType: 'application/json',
						serviceName: routeMeta.analytics.serviceName,
						tags: routeMeta.analytics.tags,
						iconUrl: routeMeta.analytics.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { report: 'clubs', period: '24h' },
							inputSchema: {
								type: 'object',
								properties: {
									report: {
										type: 'string',
										enum: ['clubs', 'agent_leaderboard', 'marketplace', 'revenue', 'sniper_trades', 'user_activity', 'x402_volume'],
										default: 'clubs',
									},
									period: { type: 'string', enum: ['1h', '6h', '24h', '7d', '30d', 'all'], default: '24h' },
									limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
									window_days: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
									network: { type: 'string', enum: ['mainnet', 'devnet', 'all'], default: 'mainnet' },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/api-key-health`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/api-key-health',
						url,
						method: 'POST',
						description:
							'API Key Validity Health Check — verifies that the platform has a valid, non-expired access key covering a given scope. Checks x402 subscription keys and the internal service key. Returns valid, scopes, expires_at, and key_type. Used by the autonomous loop to confirm its access lane is healthy before each tick. Pay-per-call in USDC on Solana or Base mainnet.',
						mimeType: 'application/json',
						serviceName: routeMeta.apiKeyHealth.serviceName,
						tags: routeMeta.apiKeyHealth.tags,
						iconUrl: routeMeta.apiKeyHealth.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { scope: 'autonomous_loop' },
							inputSchema: {
								type: 'object',
								properties: { scope: { type: 'string', default: 'autonomous_loop' } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/auth-health`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/auth-health',
						url,
						method: 'POST',
						description:
							'Auth Session Lifecycle Health — pay $0.001 USDC to exercise the full JWT auth session lifecycle: create, validate, refresh, and expiry-rejection. Returns { all_pass, failed_step, latency_ms } so a monitoring loop can detect a broken auth subsystem before users do.',
						mimeType: 'application/json',
						serviceName: routeMeta.authHealth.serviceName,
						tags: routeMeta.authHealth.tags,
						iconUrl: routeMeta.authHealth.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { mode: 'session_lifecycle' },
							inputSchema: {
								type: 'object',
								properties: { mode: { type: 'string', enum: ['session_lifecycle'], default: 'session_lifecycle' } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/avatar-optimize-batch`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/avatar-optimize-batch',
						url,
						method: 'POST',
						description:
							'three.ws Avatar Optimization Pipeline — pay $0.001 USDC to trigger a batch glTF/GLB analysis of the top most-viewed public avatars. Returns a ranked list of optimization suggestions (Draco/Meshopt compression, oversized textures, non-indexed primitives) and stores results per-avatar so owners can be notified of actionable improvements.',
						mimeType: 'application/json',
						serviceName: routeMeta.avatarOptimizeBatch.serviceName,
						tags: routeMeta.avatarOptimizeBatch.tags,
						iconUrl: routeMeta.avatarOptimizeBatch.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { limit: 50 },
							inputSchema: {
								type: 'object',
								properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 50 } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/bazaar-feed`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/bazaar-feed',
						url,
						method: 'POST',
						description:
							'Bazaar Feed — pay $0.001 USDC per call for two live views of the x402 service marketplace. filter "new"/"active": newest service listings (id, name, price, networks, tags, first_seen) plus category rollup and listing-velocity signal (spike/active/quiet). filter "price_trends": 24h price-movement across all tracked services — trending up/down/stable and net market pressure as bullish/bearish/neutral. Live data from the platform bazaar index.',
						mimeType: 'application/json',
						serviceName: routeMeta.bazaarFeed.serviceName,
						tags: routeMeta.bazaarFeed.tags,
						iconUrl: routeMeta.bazaarFeed.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { filter: 'new', limit: 10 },
							inputSchema: {
								type: 'object',
								properties: {
									filter: { type: 'string', enum: ['new', 'active', 'price_trends'], default: 'new' },
									limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
									period: { type: 'string', default: '24h' },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/billboard`;
					const accepts = acceptsForPrice('50000', url);
					return {
						path: '/api/x402/billboard',
						url,
						method: 'GET',
						description:
							'three.ws coin worlds — feature your content on a 3D world’s billboard. Pay once to hold the framed panel behind spawn: pass the coin-world mint plus an image URL and/or a short caption. The coin world renders your placement in place of its default content for everyone who walks in until the slot expires. It is a paid content canvas, not an ad unit — nothing is targeted or tracked.',
						mimeType: 'application/json',
						serviceName: routeMeta.billboard.serviceName,
						tags: routeMeta.billboard.tags,
						iconUrl: routeMeta.billboard.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: {
								coin: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump',
								image: 'https://three.ws/og-image.png',
								caption: 'gm from the gallery',
							},
							inputSchema: {
								type: 'object',
								required: ['coin'],
								properties: {
									coin: { type: 'string', pattern: '^[1-9A-HJ-NP-Za-km-z]{32,44}$' },
									image: { type: 'string', format: 'uri' },
									caption: { type: 'string', maxLength: 80 },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/cross-chain`;
					const accepts = acceptsForPrice('5000', url);
					return {
						path: '/api/x402/cross-chain',
						url,
						method: 'POST',
						description:
							'Cross-Chain Bridge Status Monitor — pay $0.005 USDC to receive the live operational status and latency of major Solana bridge providers (Wormhole, Li.Fi, deBridge). Any bridge with status=down is flagged as a platform risk.',
						mimeType: 'application/json',
						serviceName: routeMeta.crossChain.serviceName,
						tags: routeMeta.crossChain.tags,
						iconUrl: routeMeta.crossChain.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { mode: 'bridge_status' },
							inputSchema: {
								type: 'object',
								properties: { mode: { type: 'string', enum: ['bridge_status'], default: 'bridge_status' } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/did`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/did',
						url,
						method: 'POST',
						description:
							"DID Verification Canary — pay $0.001 USDC to resolve three.ws's published W3C DID document over its real public route, structurally validate it, and measure end-to-end resolution latency. Returns { verified, latency_ms } plus a per-check breakdown. verified=false when the document is unreachable, malformed, or slower than 1500ms — the same failure an external x402 verifier would hit resolving our offer/receipt signing key.",
						mimeType: 'application/json',
						serviceName: routeMeta.did.serviceName,
						tags: routeMeta.did.tags,
						iconUrl: routeMeta.did.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { did: 'did:three:canary', mode: 'verify' },
							inputSchema: {
								type: 'object',
								properties: {
									did: { type: 'string', default: 'did:three:canary' },
									mode: { type: 'string', enum: ['verify'], default: 'verify' },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/feed-health`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/feed-health',
						url,
						method: 'POST',
						description:
							'three.ws Feed Health Validator — fetches a named public feed (changelog RSS, sitemap, etc.) and returns a structural health verdict: { valid, item_count, latest_title }. Pays $0.001 USDC per check. Supported feeds: changelog_rss. The latest_title is cross-checked against the canonical changelog record so both a broken XML feed and a stale/diverged feed surface as valid:false.',
						mimeType: 'application/json',
						serviceName: routeMeta.feedHealth.serviceName,
						tags: routeMeta.feedHealth.tags,
						iconUrl: routeMeta.feedHealth.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { feed: 'changelog_rss' },
							inputSchema: {
								type: 'object',
								required: ['feed'],
								properties: { feed: { type: 'string', enum: ['changelog_rss'] } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/llm-proxy`;
					const accepts = acceptsForPrice('5000', url);
					return {
						path: '/api/x402/llm-proxy',
						url,
						method: 'POST',
						description:
							"three.ws LLM Inference Proxy — pay per completion with no API key required. Runs one-shot text prompts through the platform's free-first provider chain. Response includes measured latency, token counts, and the provider actually used. Ideal for latency benchmarking, agent pipelines, and one-off completions. Model aliases: \"fast\" (sub-second) · \"smart\" (quality backstop). Price: $0.005 USDC per completion on Base or Solana.",
						mimeType: 'application/json',
						serviceName: routeMeta.llmProxy.serviceName,
						tags: routeMeta.llmProxy.tags,
						iconUrl: routeMeta.llmProxy.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { model: 'fast', prompt: 'Count to 3.', max_tokens: 10 },
							inputSchema: {
								type: 'object',
								required: ['prompt'],
								properties: {
									model: { type: 'string', default: 'fast' },
									prompt: { type: 'string', minLength: 1, maxLength: 4000 },
									max_tokens: { type: 'integer', minimum: 1, maximum: 2048, default: 256 },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/mcp-tool-catalog`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/mcp-tool-catalog',
						url,
						method: 'POST',
						description:
							'three.ws MCP Tool Discovery — pay $0.001 USDC to discover MCP tools that were registered (or whose price/shape changed, or that were removed) on the three.ws MCP server since you last probed. Returns the diff against a durable tool registry so agents can feature-flag new capabilities the moment they ship instead of re-fetching and diffing tools/list themselves.',
						mimeType: 'application/json',
						serviceName: routeMeta.mcpToolCatalog.serviceName,
						tags: routeMeta.mcpToolCatalog.tags,
						iconUrl: routeMeta.mcpToolCatalog.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { mode: 'discover' },
							inputSchema: {
								type: 'object',
								additionalProperties: false,
								properties: { mode: { type: 'string', enum: ['discover', 'sync', 'list'], default: 'discover' } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/model-validation-sweep`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/model-validation-sweep',
						url,
						method: 'POST',
						description:
							'three.ws model quality sweep — picks the next public GLB avatar in the database that has never been inspected (or whose inspection is older than 24 hours), downloads the file, runs the glTF-Transform inspector, computes a 0-100 quality score, and records a time-series row. Use to proactively detect geometry errors, missing rigs, and unsupported features before users encounter them in the viewer.',
						mimeType: 'application/json',
						serviceName: routeMeta.modelValidationSweep.serviceName,
						tags: routeMeta.modelValidationSweep.tags,
						iconUrl: routeMeta.modelValidationSweep.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: {},
							inputSchema: { type: 'object', additionalProperties: false, properties: {} },
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/notify`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/notify',
						url,
						method: 'POST',
						description:
							'Notification Delivery Probe — pay $0.001 USDC to send a canary message through the platform notification channel and confirm delivery. Returns { delivered, channel, latency_ms } so the autonomous loop can assert the notification subsystem is alive within a 2-second SLA. Channel "canary" is the x402 loop heartbeat lane; "ops" and "system" route to the ops alert surface.',
						mimeType: 'application/json',
						serviceName: routeMeta.notify.serviceName,
						tags: routeMeta.notify.tags,
						iconUrl: routeMeta.notify.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { channel: 'canary', message: 'x402 loop heartbeat', priority: 'low' },
							inputSchema: {
								type: 'object',
								properties: {
									channel: { type: 'string', enum: ['canary', 'ops', 'system'], default: 'canary' },
									message: { type: 'string', maxLength: 500, default: 'x402 loop heartbeat' },
									priority: { type: 'string', enum: ['low', 'normal', 'high'], default: 'low' },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/pay-by-name`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/pay-by-name',
						url,
						method: 'POST',
						description:
							'Pay-By-Name Resolution — pay $0.001 USDC to resolve a wallet name (@username, a *.sol name, or a raw base58 address) to a verified on-chain Solana address via the three.ws pay-by-name registry. Returns the resolved address, an on-curve verification flag, and the resolution source.',
						mimeType: 'application/json',
						serviceName: routeMeta.payByName.serviceName,
						tags: routeMeta.payByName.tags,
						iconUrl: routeMeta.payByName.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { name: 'nich.threews.sol' },
							inputSchema: {
								type: 'object',
								required: ['name'],
								properties: { name: { type: 'string', description: '@username, a *.sol name, or a base58 address.' } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/rate-limit-probe`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/rate-limit-probe',
						url,
						method: 'POST',
						description:
							'Rate-Limit Capacity Probe — pay $0.001 USDC to learn how many more calls the x402 autonomous loop can make to a target endpoint today before hitting its daily USDC spend cap. Returns remaining_calls, reset_at, and cooldown_active so agents can throttle dynamically instead of discovering the cap by failure.',
						mimeType: 'application/json',
						serviceName: routeMeta.rateLimitProbe.serviceName,
						tags: routeMeta.rateLimitProbe.tags,
						iconUrl: routeMeta.rateLimitProbe.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { endpoint: '/api/x402/crypto-intel' },
							inputSchema: {
								type: 'object',
								required: ['endpoint'],
								properties: { endpoint: { type: 'string', pattern: '^/api/' } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/schema-check`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/schema-check',
						url,
						method: 'POST',
						description:
							'three.ws JSON API schema conformance checker — pay $0.001 USDC to fetch a named three.ws public API and validate its response against the declared schema. Surfaces breaking schema changes before users notice a broken feed. Current target: changelog_json — the /changelog.json feed holders and RSS consumers depend on. Returns { valid, version, entry_count, schema_errors }.',
						mimeType: 'application/json',
						serviceName: routeMeta.schemaCheck.serviceName,
						tags: routeMeta.schemaCheck.tags,
						iconUrl: routeMeta.schemaCheck.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { api: 'changelog_json' },
							inputSchema: {
								type: 'object',
								required: ['api'],
								additionalProperties: false,
								properties: { api: { type: 'string', enum: ['changelog_json'] } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/solana-register-health`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/solana-register-health',
						url,
						method: 'GET',
						description:
							"Solana Agent Registration Health Check — verifies three.ws's server-custodial Solana agent-registration subsystem end-to-end by resolving a known canary agent's on-chain Metaplex Agent Registry record (Identity PDA + Core asset) and confirming both accounts exist on-chain right now. Returns a health snapshot with latency and the checked asset. Pay-per-call in USDC on Solana or Base mainnet.",
						mimeType: 'application/json',
						serviceName: routeMeta.solanaRegisterHealth.serviceName,
						tags: routeMeta.solanaRegisterHealth.tags,
						iconUrl: routeMeta.solanaRegisterHealth.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'GET',
							discoverable: true,
							input: {},
							inputSchema: { type: 'object', properties: {} },
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/spend-session`;
					const accepts = acceptsForPrice('10000', url);
					return {
						path: '/api/x402/spend-session',
						url,
						method: 'POST',
						description:
							'three.ws Spend Session Health — pay $0.01 USDC to probe the Agent Payment Sessions governance layer. mode:"canary" creates a canary session row and immediately consumes it, returning { created, consumed, latency_ms } — the most important health check for the x402 governance layer. mode:"audit" returns a live aggregate snapshot of all payment sessions (active count, remaining budget, expired_count_24h). Pay-per-call in USDC on Solana mainnet.',
						mimeType: 'application/json',
						serviceName: routeMeta.spendSession.serviceName,
						tags: routeMeta.spendSession.tags,
						iconUrl: routeMeta.spendSession.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { mode: 'canary', budget: 0.01 },
							inputSchema: {
								type: 'object',
								properties: {
									mode: { type: 'string', enum: ['canary', 'audit'], default: 'canary' },
									budget: { type: 'number', minimum: 0 },
								},
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/telegram-health`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/telegram-health',
						url,
						method: 'POST',
						description:
							'Changelog Telegram Bot Health Check — pays $0.001 USDC to verify that the three.ws platform bot can reach the Telegram API and is alive. Returns { reachable, bot_id, bot_username, latency_ms }. If unreachable, new changelog entries will not reach $THREE holders until the bot is restored.',
						mimeType: 'application/json',
						serviceName: routeMeta.telegramHealth.serviceName,
						tags: routeMeta.telegramHealth.tags,
						iconUrl: routeMeta.telegramHealth.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { bot: 'changelog' },
							inputSchema: {
								type: 'object',
								required: ['bot'],
								additionalProperties: false,
								properties: { bot: { type: 'string', enum: ['changelog'] } },
							},
						}),
					};
				})(),
				(() => {
					const url = `${origin}/api/x402/wallet-connect`;
					const accepts = acceptsForPrice('1000', url);
					return {
						path: '/api/x402/wallet-connect',
						url,
						method: 'POST',
						description:
							'Wallet Connection Session Health Check — probes the SIWS (Sign-In With Solana) session initiation path: issues a real nonce challenge against the platform auth gateway, validates its structure and expiry, and measures roundtrip latency. Returns { session_created, latency_ms }. Pay-per-call in USDC on Solana or Base mainnet.',
						mimeType: 'application/json',
						serviceName: routeMeta.walletConnect.serviceName,
						tags: routeMeta.walletConnect.tags,
						iconUrl: routeMeta.walletConnect.iconUrl,
						accepts,
						extensions: extensionsForAccepts(accepts, {
							method: 'POST',
							discoverable: true,
							input: { mode: 'health' },
							inputSchema: {
								type: 'object',
								required: ['mode'],
								properties: { mode: { type: 'string', enum: ['health'] } },
							},
						}),
					};
				})(),
				// USE-13: one Bazaar catalog row per priced MCP tool. The shared
				// `/api/mcp` and `/api/mcp-3d` resources above are the transport
				// entries; these are the individual paid tools facilitators
				// index by toolName.
				...mcpToolItems,
				...studioToolItems,
				// Agent-published paid endpoints (monetize_endpoint). Dynamic —
				// one entry per active agent_paid_services listing.
				...agentServiceItems,
			]
				.filter(Boolean)
				.map(addOutputExample),
		},
		{ 'cache-control': 'public, max-age=300' },
	);
}

// ── dispatcher ────────────────────────────────────────────────────────────────

function handleChatPlugin(req, res) {
	return json(
		res,
		200,
		{
			identifier: '3dagent',
			schemaVersion: 1,
			meta: {
				title: 'three.ws',
				description: 'Render a 3D avatar that reacts to the chat.',
				avatar: 'https://three.ws/favicon.ico',
				tags: ['avatar', '3d', 'agent'],
			},
			ui: { position: 'right', size: { width: 320, height: 420 } },
			settings: [
				{ name: 'agentId', type: 'string', required: true, title: 'Agent ID' },
				{
					name: 'apiOrigin',
					type: 'string',
					default: 'https://three.ws/',
					title: 'API Origin',
				},
			],
		},
		{ 'cache-control': 'public, max-age=3600' },
	);
}

// SperaxOS / plugin.delivery manifest. Single source of truth is the static
// file at public/sperax/manifest.json (also served verbatim at /sperax/manifest.json);
// this alias adds cross-origin headers so the marketplace + browser validators
// can fetch it from /.well-known/sperax-plugin.json.
let speraxManifest;
try {
	speraxManifest = JSON.parse(
		readFileSync(join(process.cwd(), 'public/sperax/manifest.json'), 'utf8'),
	);
} catch (err) {
	console.error('[wk/sperax-plugin] failed to load manifest', err);
}

function handleSperaxPlugin(req, res) {
	if (!speraxManifest) return error(res, 500, 'internal_error', 'manifest unavailable');
	return json(res, 200, speraxManifest, { 'cache-control': 'public, max-age=3600' });
}

// ── three-vanity (/.well-known/three-vanity.json) ────────────────────────────
// Publishes the provably-fair vanity grinder's service identity: the long-lived
// Ed25519 public key that signs every verifiable-grind receipt, the protocol
// version, and the scheme ids. The SDK + CLI + /vanity/verify page pin this key
// so a buyer can prove a receipt really came from three.ws. The SECRET seed
// never leaves the server — only the public key is published here.
async function handleThreeVanity(req, res) {
	let identity;
	try {
		const mod = await import('./_lib/vanity-service-key.js');
		identity = await mod.getServiceIdentity();
	} catch (err) {
		console.error('[wk/three-vanity] service key unavailable', err?.message || err);
		return error(res, 500, 'service_key_unavailable', 'vanity service key not configured');
	}
	const origin = env.APP_ORIGIN;
	return json(
		res,
		200,
		{
			protocol: 'three-vanity/v1',
			protocols: ['three-vanity/v1', 'three-pog/v1'],
			description:
				'Provably-fair Solana vanity grinding. Keys are ground under a commit–reveal ' +
				'seed-mixing protocol (three-vanity/v1) and/or attested with a proof-of-grind ' +
				'certificate (three-pog/v1). Both are signed by the attestation key below and ' +
				'verified entirely client-side — nothing here is trusted, everything is recomputed.',
			serviceKey: {
				curve: 'ed25519',
				keyId: identity.keyId,
				publicKeyBase58: identity.publicKeyBase58,
				publicKeyHex: identity.publicKeyHex,
				use: 'receipt-signing, proof-of-grind-attestation',
			},
			// Rotation-aware verifier keyring: the set of attestation keys a verifier
			// should accept. On rotation, the retiring key stays here (with a
			// `retired` flag/date) until all in-flight certs age out, so historical
			// proofs keep verifying. Today there is one active key.
			keyring: [
				{
					keyId: identity.keyId,
					curve: 'ed25519',
					publicKeyBase58: identity.publicKeyBase58,
					status: 'active',
				},
			],
			schemes: {
				commitment: 'sha256(domain‖serverSeed)',
				seedMix: 'hkdf-sha256(serverSeed‖clientSeed‖requestNonce)',
				candidate: 'hmac-sha256(masterSeed, domain‖uint64_be(index)) → ed25519 seed',
				signature: 'ed25519',
				sealedEnvelope: 'x25519-hkdf-sha256-aes256gcm/v1',
				proofOfGrind: 'ed25519 over canonical(three-pog/cert/v1 ‖ sorted-json(core))',
				splitKeyNonCustody: 'P1 + a2·B == address (recomputed from public points)',
			},
			endpoints: {
				grind: `${origin}/api/x402/vanity`,
				verifiableGrind: `${origin}/api/x402/vanity-verifiable`,
				certRegistry: `${origin}/api/vanity/cert`,
				verifyPage: `${origin}/vanity/verify`,
			},
			documentation: `${origin}/vanity/verify`,
			protocolSpec: 'https://github.com/nirholas/three.ws/blob/main/docs/PROTOCOL-vanity.md',
		},
		{ 'cache-control': 'public, max-age=300' },
	);
}

const DISPATCH = {
	'agent-attestation-schemas': handleAttestationSchemas,
	'three-vanity': handleThreeVanity,
	'chat-plugin': handleChatPlugin,
	'sperax-plugin': handleSperaxPlugin,
	'oauth-authorization-server': handleOauthAuthServer,
	'oauth-protected-resource': handleOauthProtectedResource,
	x402: handleX402,
	'x402-discovery': handleX402Discovery,
};

// Public discovery docs (x402, x402-discovery, chat-plugin, agent-attestation-schemas)
// must be readable cross-origin so browser-based validators (agentic.market,
// x402scan, bazaar) can fetch them. OAuth metadata stays restricted.
const PUBLIC_DISCOVERY = new Set([
	'x402',
	'x402-discovery',
	'chat-plugin',
	'sperax-plugin',
	'agent-attestation-schemas',
	'three-vanity',
]);

export default wrap(async (req, res) => {
	const name = req.query?.name ?? new URL(req.url, 'http://x').searchParams.get('name');
	const corsOpts = PUBLIC_DISCOVERY.has(name)
		? { methods: 'GET,OPTIONS', origins: '*' }
		: { methods: 'GET,OPTIONS' };
	if (cors(req, res, corsOpts)) return;
	if (!method(req, res, ['GET'])) return;
	const fn = DISPATCH[name];
	if (!fn) return error(res, 404, 'not_found', `unknown well-known resource: ${name}`);
	return fn(req, res);
});
