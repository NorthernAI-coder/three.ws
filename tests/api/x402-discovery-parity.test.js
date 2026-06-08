// Guardrail: every paid /api/x402/* endpoint must appear in the
// /.well-known/x402-discovery catalog, or agents (and the CDP Bazaar /
// agentic.market crawlers) can never find it — an unlisted paid endpoint earns
// zero, no matter how good it is. The discovery doc in api/wk.js is
// hand-maintained, so it silently drifts every time a new paid route ships
// without a matching catalog entry. This test makes that drift a red build.
//
// "Paid" is detected structurally: a route file is paid if it wraps the shared
// paidEndpoint() helper OR emits a 402 challenge directly via send402(). Pure
// utility/infra routes (did, my-receipts, pay-by-name — a tx-builder, not a
// 402-gated resource) match neither and are correctly out of scope.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const x402Dir = join(here, '..', '..', 'api', 'x402');

// Routes intentionally absent from the catalog, with the reason each is exempt.
// Keep this list short and justified — it is the only sanctioned escape hatch.
const EXCLUSIONS = new Map([
	[
		'/api/x402/permit2-paid-demo',
		'CDP-only: its sole accept is a Permit2 sibling that permit2VariantOf() ' +
			'returns null without CDP creds, so the live 402 (and thus the catalog) ' +
			'omits the route entirely in non-CDP environments.',
	],
	[
		'/api/x402/service',
		'Dynamic dispatcher, not a single fixed-price route: it serves the paywall ' +
			'for every agent-published listing at /api/x402/service/<slug>. Each ' +
			'concrete listing is cataloged dynamically from agent_paid_services by ' +
			"handleX402Discovery's buildAgentServiceItems(), not as a static entry.",
	],
]);

function paidRoutesFromFiles() {
	const routes = [];
	for (const name of readdirSync(x402Dir)) {
		if (!name.endsWith('.js')) continue;
		const src = readFileSync(join(x402Dir, name), 'utf8');
		const isPaid = src.includes('paidEndpoint(') || src.includes('send402(');
		if (!isPaid) continue;
		routes.push(`/api/x402/${name.replace(/\.js$/, '')}`);
	}
	return routes.sort();
}

async function renderDiscovery() {
	// Set the env the discovery builder reads BEFORE importing it, so both Base
	// and Solana accepts are advertised and APP_ORIGIN resolves. No CDP creds →
	// Permit2 siblings are omitted, matching production's non-CDP behavior.
	Object.assign(process.env, {
		APP_ORIGIN: 'https://three.ws',
		X402_PAY_TO_BASE: '0x0000000000000000000000000000000000000001',
		X402_PAY_TO_SOLANA: 'So11111111111111111111111111111111111111112',
		X402_ASSET_ADDRESS_BASE: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		X402_ASSET_MINT_SOLANA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
		X402_ASSET_ADDRESS_ARBITRUM: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
		X402_MAX_AMOUNT_REQUIRED: '1000',
		X402_FEE_PAYER_SOLANA: 'So11111111111111111111111111111111111111112',
	});
	const mod = await import('../../api/wk.js');
	const res = {
		statusCode: 0,
		headers: {},
		setHeader(k, v) {
			this.headers[k.toLowerCase()] = v;
		},
		end(body) {
			this.body = body;
		},
	};
	const req = {
		method: 'GET',
		url: '/.well-known/x402-discovery?name=x402-discovery',
		query: { name: 'x402-discovery' },
		headers: {},
	};
	await mod.default(req, res);
	return JSON.parse(res.body);
}

describe('x402 discovery catalog parity', () => {
	it('lists every paid /api/x402/* endpoint (no silent drift)', async () => {
		const doc = await renderDiscovery();
		const cataloged = new Set(doc.resources.map((r) => r.path));
		const required = paidRoutesFromFiles().filter((r) => !EXCLUSIONS.has(r));

		const missing = required.filter((r) => !cataloged.has(r));
		expect(
			missing,
			`Paid x402 endpoints missing from /.well-known/x402-discovery: ${missing.join(
				', ',
			)}. Add a matching resources[] entry in api/wk.js handleX402Discovery, ` +
				`or document an exemption in EXCLUSIONS with a reason.`,
		).toEqual([]);
	});

	it('only exempts routes that still exist as paid endpoints', async () => {
		// Stops EXCLUSIONS from rotting: an exemption for a deleted/renamed route
		// would otherwise hide a real gap forever.
		const paid = new Set(paidRoutesFromFiles());
		const stale = [...EXCLUSIONS.keys()].filter((r) => !paid.has(r));
		expect(
			stale,
			`Stale EXCLUSIONS entries (route no longer paid): ${stale.join(', ')}`,
		).toEqual([]);
	});

	it('every cataloged x402 resource carries a price and at least one accept', async () => {
		const doc = await renderDiscovery();
		const x402Resources = doc.resources.filter((r) => r.path?.startsWith('/api/x402/'));
		expect(x402Resources.length).toBeGreaterThan(0);
		for (const r of x402Resources) {
			expect(
				Array.isArray(r.accepts) && r.accepts.length > 0,
				`${r.path} has no accepts`,
			).toBe(true);
			for (const a of r.accepts) {
				expect(
					typeof a.amount === 'string' && a.amount.length > 0,
					`${r.path} accept amount`,
				).toBe(true);
				expect(Boolean(a.payTo), `${r.path} accept payTo`).toBe(true);
			}
		}
	});
});
