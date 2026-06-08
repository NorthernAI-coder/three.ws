import { describe, it, expect } from 'vitest';

import { buildToolResult, toolError } from '../mcp-server/src/payments.js';
import { buildTools, buildServer } from '../mcp-server/src/index.js';

// Guards the MCP result envelope that EVERY paid tool funnels through
// (mcp-server/src/payments.js → buildToolResult). The contract:
//   - text content is always present (back-compat for text-only clients)
//   - plain-object returns are surfaced as MCP structuredContent (2025-06-18)
//   - only the explicit toolError() envelope flips isError (which also tells the
//     x402 wrapper to cancel — not settle — the payment, so failures don't bill)
describe('buildToolResult — MCP CallToolResult envelope', () => {
	it('surfaces a plain object as both text and structuredContent', () => {
		const out = { seed: 'abc', presetId: 'wave', match: { score: 3 } };
		const res = buildToolResult(out);

		expect(res.content).toEqual([{ type: 'text', text: JSON.stringify(out) }]);
		// Structured output: the exact object, not a re-parsed copy.
		expect(res.structuredContent).toBe(out);
		// A successful call must NOT be flagged as an error.
		expect(res.isError).toBeUndefined();
	});

	it('flags the toolError() envelope with isError so the payment is cancelled, not settled', () => {
		const err = toolError('invalid_mint', 'token must be a base58 Solana pubkey', {
			token: 'nope',
		});
		const res = buildToolResult(err);

		expect(res.isError).toBe(true);
		expect(res.structuredContent).toEqual({
			ok: false,
			error: 'invalid_mint',
			message: 'token must be a base58 Solana pubkey',
			token: 'nope',
		});
		// Text mirror still carries the full error envelope for text-only clients.
		expect(JSON.parse(res.content[0].text)).toEqual(res.structuredContent);
	});

	it('does NOT flag a partial-data success (embedded sub-field error, no top-level ok:false)', () => {
		// pump_snapshot returns this shape when one upstream (Jupiter) is down but
		// the overall call succeeded — the caller should still pay and not see isError.
		const partial = {
			token: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
			price: { error: 'jupiter timeout' },
			volume24h: { volume24hUsd: 1000 },
		};
		const res = buildToolResult(partial);

		expect(res.isError).toBeUndefined();
		expect(res.structuredContent).toBe(partial);
	});

	it('keeps string returns text-only (structuredContent must be an object)', () => {
		const res = buildToolResult('plain text result');
		expect(res.content).toEqual([{ type: 'text', text: 'plain text result' }]);
		expect(res.structuredContent).toBeUndefined();
		expect(res.isError).toBeUndefined();
	});

	it('does not promote arrays to structuredContent (spec requires an object)', () => {
		const arr = [{ a: 1 }, { b: 2 }];
		const res = buildToolResult(arr);
		expect(res.content).toEqual([{ type: 'text', text: JSON.stringify(arr) }]);
		expect(res.structuredContent).toBeUndefined();
	});
});

// The tool surface must be enumerable WITHOUT any payment env — tool
// registration is secret-free; only an actual paid invocation needs a pay-to.
describe('MCP tool surface', () => {
	it('builds every tool descriptor with a complete, unique contract', async () => {
		const tools = await buildTools();
		expect(tools.length).toBeGreaterThanOrEqual(15);

		const names = new Set();
		for (const t of tools) {
			expect(typeof t.name).toBe('string');
			expect(t.name).toMatch(/^[a-z][a-z0-9_]*$/);
			expect(typeof t.title).toBe('string');
			expect(t.title.length).toBeGreaterThan(0);
			expect(typeof t.description).toBe('string');
			// Every paid tool must quote its USDC price in its description.
			expect(t.description).toMatch(/\$[0-9]/);
			expect(t.inputSchema).toBeTypeOf('object');
			expect(t.handler).toBeTypeOf('function');
			expect(names.has(t.name)).toBe(false);
			names.add(t.name);
		}
	});

	it('constructs the MCP server with no payment env set', async () => {
		const server = await buildServer();
		expect(server).toBeTruthy();
	});
});
