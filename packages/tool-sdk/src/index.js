/**
 * @three-ws/tool-sdk
 *
 * Typed tool authoring for three.ws MCP servers: define a tool's identity,
 * API surface, and permission manifest once with `defineTool`, wire an
 * implementation with `defineExecutor`, and adapt it into a live MCP server
 * with `toMcpTools`.
 *
 * Quick start:
 * ```js
 * import { defineTool, defineExecutor, toMcpTools, z } from '@three-ws/tool-sdk';
 *
 * export const priceTool = defineTool({
 *   id: 'my-org-price-feed',
 *   title: 'My Price Feed',
 *   description: 'Fetches live token prices.',
 *   version: '1.0.0',
 *   permissions: { network: ['api.example.com'], rateLimit: { calls: 30, perSeconds: 60 } },
 *   apis: [{
 *     name: 'getPrice',
 *     description: 'Get the current USD price for a token symbol.',
 *     parameters: z.object({ symbol: z.string() }),
 *   }],
 * });
 *
 * export const priceExecutor = defineExecutor(priceTool, {
 *   async getPrice({ symbol }) {
 *     const res = await fetch(`https://api.example.com/v1/price/${symbol}`);
 *     const data = await res.json();
 *     return { symbol, price: data.price };
 *   },
 * });
 *
 * export const mcpTools = toMcpTools(priceTool, priceExecutor);
 * ```
 *
 * See `README.md` in this package for the full API reference, permission
 * model, and a complete runnable example.
 */

export { defineTool } from './define-tool.js';
export { defineExecutor } from './define-executor.js';
export { toMcpTools } from './mcp-adapter.js';
export { guardedFetch, createRateLimiter, normalizePermissions } from './permissions.js';
export { z } from 'zod';
