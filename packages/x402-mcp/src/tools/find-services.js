// `find_services` — search an x402 bazaar / discovery API for paid services.
// Read-only.
//
// Wraps GET /api/bazaar/search on whatever discovery endpoint you point
// X402_API_BASE at (e.g. https://three.ws, or your own bazaar that merges the
// public facilitator feeds). Feed a returned `resource` into pay_and_call to use it.

import { z } from 'zod';

import { apiRequest } from '../lib/api.js';
import { requireApiBase } from '../config.js';

export const def = {
	name: 'find_services',
	title: 'Find paid x402 services the agent can call',
	annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
	description:
		'Search a configured x402 bazaar / discovery API for paid services — HTTP APIs and MCP tools. Returns each match with its price, networks, and resource URL. Pass a resource into pay_and_call to use it. Requires X402_API_BASE to point at a discovery endpoint (e.g. https://three.ws). Read-only.',
	inputSchema: {
		query: z.string().min(1).describe('What you need, e.g. "weather", "image upscale", "token intel".'),
		type: z.enum(['http', 'mcp']).default('http').describe('Service kind to search.'),
		network: z.string().optional().describe('CAIP-2 network filter, e.g. "solana:*" or "eip155:8453".'),
		max_price_usdc: z.number().min(0).optional().describe('Only return services at or under this USDC price.'),
		limit: z.number().int().min(1).max(100).optional().describe('Max results (default 25).'),
	},
	async handler(args) {
		const base = requireApiBase('find_services');
		const query = String(args?.query ?? '').trim();
		const type = args?.type === 'mcp' ? 'mcp' : 'http';
		const maxPrice =
			args?.max_price_usdc != null ? String(Math.round(Number(args.max_price_usdc) * 1_000_000)) : undefined;
		const data = await apiRequest(base, '/api/bazaar/search', {
			query: {
				query,
				type,
				network: args?.network,
				maxPrice,
				limit: args?.limit ?? 25,
			},
		});
		const resources = Array.isArray(data?.resources) ? data.resources : [];
		const services = resources.map((it) => ({
			resource: it.resource,
			name: it.serviceName || it.name || undefined,
			description: it.description || undefined,
			price: it.minPriceLabel || it.price || undefined,
			networks: it.networks,
			tool_name: it.toolName || undefined,
		}));
		return { ok: true, query, type, count: services.length, services };
	},
};
