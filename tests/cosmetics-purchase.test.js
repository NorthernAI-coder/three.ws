// Coverage for the R22 avatar-shop purchase lineage:
//
//   • api/_lib/cosmetics.js        — USDC pricing layer + catalog owned-merge
//   • api/_lib/cosmetics-ownership.js — durable ownership ledger (fail-closed
//                                       grant, graceful reads, idempotency)
//   • api/x402/cosmetic-purchase.js — input validation + the 402 challenge
//
// The on-chain settlement itself needs a funded wallet + facilitator and is
// verified against the real rail on deploy; here we lock down the boundary
// behaviour that must hold regardless: server-owned pricing, honest validation,
// fail-closed ownership, and a correctly-priced 402.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	buildCatalog, getCosmetic, priceUsdcAtomicsOf, priceUsdcDisplayOf,
} from '../api/_lib/cosmetics.js';

describe('cosmetics USDC pricing', () => {
	afterEach(() => { delete process.env.X402_PRICE_COSMETIC_LEGENDARY; });

	it('prices premium items by rarity and frees the base pack', () => {
		expect(priceUsdcAtomicsOf(getCosmetic('skin-crimson'))).toBe('500000');   // rare $0.50
		expect(priceUsdcAtomicsOf(getCosmetic('skin-whiteout'))).toBe('1500000'); // epic $1.50
		expect(priceUsdcAtomicsOf(getCosmetic('skin-midnight'))).toBe('3000000'); // legendary $3.00
		expect(priceUsdcAtomicsOf(getCosmetic('hat-baseball'))).toBe('0');        // free base item
		expect(priceUsdcDisplayOf(getCosmetic('skin-midnight'))).toBe('3.00');
	});

	it('honours an env price override', () => {
		process.env.X402_PRICE_COSMETIC_LEGENDARY = '4200000';
		expect(priceUsdcAtomicsOf(getCosmetic('skin-midnight'))).toBe('4200000');
	});

	it('surfaces both the $THREE value and the USDC charge in the catalog', () => {
		const midnight = buildCatalog({}).find((c) => c.id === 'skin-midnight');
		expect(midnight.currency).toBe('THREE');      // coin-facing copy stays $THREE
		expect(midnight.price).toBe(750);
		expect(midnight.priceUsdc).toBe('3.00');       // USDC is the settlement asset
		expect(midnight.priceUsdcAtomics).toBe('3000000');
		expect(midnight.owned).toBe(false);
	});

	it('reads a purchased premium item as owned when merged in', () => {
		const owned = buildCatalog({ ownedIds: ['skin-midnight'] }).find((c) => c.id === 'skin-midnight');
		expect(owned.owned).toBe(true);
		expect(owned.locked).toBe(false);
	});
});

// ── ownership ledger ─────────────────────────────────────────────────────────
// A tiny in-memory stand-in for Upstash Redis so we can exercise the SET-backed
// ledger without a live instance.
class FakeRedis {
	constructor() { this.sets = new Map(); }
	async sadd(key, member) {
		const s = this.sets.get(key) || new Set();
		const had = s.has(member);
		s.add(member); this.sets.set(key, s);
		return had ? 0 : 1;
	}
	async smembers(key) { return [...(this.sets.get(key) || [])]; }
	async sismember(key, m) { return this.sets.get(key)?.has(m) ? 1 : 0; }
	async expire() { return 1; }
}

async function loadOwnership({ withRedis }) {
	vi.resetModules();
	if (withRedis) {
		process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
		process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
		const fake = new FakeRedis();
		vi.doMock('@upstash/redis', () => ({ Redis: class { constructor() { return fake; } } }));
	} else {
		delete process.env.UPSTASH_REDIS_REST_URL;
		delete process.env.UPSTASH_REDIS_REST_TOKEN;
		delete process.env.three_KV_REST_API_URL;
		delete process.env.KV_REST_API_URL;
		vi.doMock('@upstash/redis', () => ({ Redis: class {} }));
	}
	return import('../api/_lib/cosmetics-ownership.js');
}

describe('cosmetics ownership ledger', () => {
	// Each scenario re-imports the module fresh (resetModules) with its own
	// @upstash/redis doMock, so no cross-test mock leakage.
	beforeEach(() => { vi.resetModules(); });
	afterEach(() => { vi.resetModules(); });

	it('normalizeAccountId accepts wallets + guest ids, rejects junk', async () => {
		const { normalizeAccountId } = await loadOwnership({ withRedis: false });
		expect(normalizeAccountId('FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump'))
			.toBe('FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump');
		expect(normalizeAccountId('guest-ab12cd34')).toBe('guest-ab12cd34');
		expect(normalizeAccountId('a b/c')).toBe('');
		expect(normalizeAccountId('')).toBe('');
		expect(normalizeAccountId('x'.repeat(80))).toBe('');
	});

	it('grants idempotently and reads back when a store is configured', async () => {
		const lib = await loadOwnership({ withRedis: true });
		expect(lib.ownershipStoreConfigured()).toBe(true);
		expect(await lib.grantCosmeticOwnership('guest-1', 'skin-midnight')).toBe(true);  // newly owned
		expect(await lib.grantCosmeticOwnership('guest-1', 'skin-midnight')).toBe(false); // idempotent
		expect(await lib.readOwnedCosmetics('guest-1')).toEqual(['skin-midnight']);
		expect(await lib.ownsCosmetic('guest-1', 'skin-midnight')).toBe(true);
		expect(await lib.ownsCosmetic('guest-1', 'skin-crimson')).toBe(false);
	});

	it('fails closed on grant and degrades gracefully on read with no store', async () => {
		const lib = await loadOwnership({ withRedis: false });
		expect(lib.ownershipStoreConfigured()).toBe(false);
		await expect(lib.grantCosmeticOwnership('guest-1', 'skin-midnight')).rejects.toMatchObject({
			status: 503, code: 'ownership_store_unavailable',
		});
		expect(await lib.readOwnedCosmetics('guest-1')).toEqual([]);
		expect(await lib.ownsCosmetic('guest-1', 'skin-midnight')).toBe(false);
	});
});

// ── purchase endpoint boundary ───────────────────────────────────────────────
function mockReq(query) {
	return {
		method: 'GET',
		url: '/api/x402/cosmetic-purchase?' + new URLSearchParams(query).toString(),
		query,
		headers: {},
	};
}

function mockRes() {
	const res = { statusCode: 0, body: '', headers: {} };
	res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
	res.getHeader = (k) => res.headers[k.toLowerCase()];
	res.status = (s) => { res.statusCode = s; return res; };
	res.end = (b) => { res.body = b || ''; res.writableEnded = true; };
	return res;
}

async function call(query) {
	const { default: handler } = await import('../api/x402/cosmetic-purchase.js');
	const req = mockReq(query);
	const res = mockRes();
	await handler(req, res);
	let parsed; try { parsed = JSON.parse(res.body); } catch { parsed = res.body; }
	return { status: res.statusCode, parsed };
}

describe('cosmetic-purchase endpoint boundary', () => {
	beforeEach(() => {
		// Minimal x402 config so the 402 challenge can build a Solana accept — the
		// Solana leg needs both a payout address and a co-signing fee payer.
		process.env.X402_PAY_TO_SOLANA = 'BUrwd1nK6tFeeJMyzRHDo6AuVbnSfUULfvwq21X93nSN';
		process.env.X402_ASSET_MINT_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
		process.env.X402_FEE_PAYER_SOLANA = 'BUrwd1nK6tFeeJMyzRHDo6AuVbnSfUULfvwq21X93nSN';
	});

	it('rejects missing id / account', async () => {
		expect((await call({ account: 'guest-1' })).status).toBe(400);
		expect((await call({ id: 'skin-midnight' })).status).toBe(400);
	});

	it('404s an unknown cosmetic and 400s a free base item', async () => {
		expect((await call({ id: 'nope', account: 'guest-1' })).status).toBe(404);
		const free = await call({ id: 'hat-baseball', account: 'guest-1' });
		expect(free.status).toBe(400);
		expect(free.parsed.error).toBe('not_purchasable');
	});

	it('issues a 402 priced in USDC for a premium cosmetic', async () => {
		const r = await call({ id: 'skin-midnight', account: 'guest-1' });
		expect(r.status).toBe(402);
		const sol = (r.parsed.accepts || []).find((a) => String(a.network).startsWith('solana'));
		expect(sol).toBeTruthy();
		expect(sol.amount).toBe('3000000'); // $3.00 USDC, server-owned price
		expect(sol.asset).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
	});
});
