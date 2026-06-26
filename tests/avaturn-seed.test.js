/**
 * avaturn-seed — unit tests for the pure look-randomization helpers and the
 * catalog-session request shaping. The headless chromium export path is covered
 * by deployment smoke (it needs a live AVATURN_API_KEY + browser), so here we
 * pin the deterministic, I/O-free logic that decides *what* gets exported.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	hashSeed,
	mulberry32,
	pickOne,
	normalizeSlot,
	groupAssetsBySlot,
	pickRandomLook,
	pickBodyType,
	WEARABLE_SLOTS,
	HAIR_COLORS,
	EYE_COLORS,
} from '../api/_lib/avaturn-seed.js';

const BODIES = [
	{ id: 'body-m1', gender: 'male' },
	{ id: 'body-m2', gender: 'male' },
	{ id: 'body-f1', gender: 'female' },
];

const ASSETS = [
	{ id: 'out-1', category: 'outfit' },
	{ id: 'out-2', category: 'clothing' }, // alias → outfit
	{ id: 'sho-1', category: 'footwear' }, // alias → shoes
	{ id: 'hair-1', category: 'hairstyle' }, // alias → hair
	{ id: 'hair-2', category: 'hair' },
	{ id: 'gls-1', category: 'eyewear' }, // alias → glasses
	{ id: 'hat-1', category: 'headwear' },
	{ id: 'misc-1', category: 'tattoo' }, // not a wearable slot — ignored
	{ id: 'bad' }, // no category, no id-less guard exercised elsewhere
];

describe('seeded RNG', () => {
	it('hashSeed is deterministic and unsigned 32-bit', () => {
		expect(hashSeed('hello')).toBe(hashSeed('hello'));
		expect(hashSeed('hello')).not.toBe(hashSeed('world'));
		expect(hashSeed('x')).toBeGreaterThanOrEqual(0);
		expect(hashSeed('x')).toBeLessThan(2 ** 32);
	});

	it('mulberry32 yields a reproducible stream in [0,1)', () => {
		const a = mulberry32(123);
		const b = mulberry32(123);
		for (let i = 0; i < 50; i++) {
			const v = a();
			expect(v).toBe(b());
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it('pickOne returns undefined for empty input', () => {
		expect(pickOne([], mulberry32(1))).toBeUndefined();
		expect(pickOne(null, mulberry32(1))).toBeUndefined();
	});
});

describe('slot normalization + grouping', () => {
	it('maps known aliases onto canonical slots', () => {
		expect(normalizeSlot('Clothing')).toBe('outfit');
		expect(normalizeSlot('FOOTWEAR')).toBe('shoes');
		expect(normalizeSlot('hairstyle')).toBe('hair');
		expect(normalizeSlot('eyewear')).toBe('glasses');
		expect(normalizeSlot('unknown')).toBe('unknown');
	});

	it('groups only wearable slots and drops id-less / non-wearable assets', () => {
		const grouped = groupAssetsBySlot(ASSETS);
		expect(grouped.outfit.map((a) => a.id).sort()).toEqual(['out-1', 'out-2']);
		expect(grouped.shoes.map((a) => a.id)).toEqual(['sho-1']);
		expect(grouped.hair.map((a) => a.id).sort()).toEqual(['hair-1', 'hair-2']);
		expect(grouped.glasses.map((a) => a.id)).toEqual(['gls-1']);
		expect(grouped.headwear.map((a) => a.id)).toEqual(['hat-1']);
		expect(grouped.tattoo).toBeUndefined();
		expect(grouped.bad).toBeUndefined();
	});
});

describe('pickRandomLook', () => {
	it('is deterministic for a given seed', () => {
		const a = pickRandomLook('seed-A', { bodies: BODIES, assets: ASSETS, bodyType: 'male' });
		const b = pickRandomLook('seed-A', { bodies: BODIES, assets: ASSETS, bodyType: 'male' });
		expect(a).toEqual(b);
	});

	it('respects the requested body type when bodies are tagged', () => {
		for (const seed of ['1', '2', '3', '4', '5']) {
			const look = pickRandomLook(seed, { bodies: BODIES, assets: ASSETS, bodyType: 'female' });
			expect(look.bodyId).toBe('body-f1');
		}
	});

	it('picks at most one asset per slot, all real ids', () => {
		const look = pickRandomLook('xyz', { bodies: BODIES, assets: ASSETS, bodyType: 'male' });
		const allIds = ASSETS.map((a) => a.id);
		for (const id of look.assetIds) expect(allIds).toContain(id);
		// No more picks than slots the catalog actually offers.
		expect(look.assetIds.length).toBeLessThanOrEqual(WEARABLE_SLOTS.length);
		// No duplicate ids.
		expect(new Set(look.assetIds).size).toBe(look.assetIds.length);
	});

	it('produces in-range colors + skin correction', () => {
		const look = pickRandomLook('color-seed', { bodies: BODIES, assets: ASSETS });
		expect(HAIR_COLORS).toContain(look.hairColor);
		expect(EYE_COLORS).toContain(look.eyeColor);
		expect(look.skinToneCorrection).toBeGreaterThanOrEqual(-15);
		expect(look.skinToneCorrection).toBeLessThanOrEqual(15);
	});

	it('falls back to the whole body pool when no gender match exists', () => {
		const untyped = [{ id: 'b1' }, { id: 'b2' }];
		const look = pickRandomLook('s', { bodies: untyped, assets: [], bodyType: 'female' });
		expect(['b1', 'b2']).toContain(look.bodyId);
		expect(look.assetIds).toEqual([]);
	});

	it('handles a totally empty catalog without throwing', () => {
		const look = pickRandomLook('s', { bodies: [], assets: [] });
		expect(look.bodyId).toBeNull();
		expect(look.assetIds).toEqual([]);
	});
});

describe('pickBodyType', () => {
	it('is deterministic and returns male|female', () => {
		expect(pickBodyType('abc')).toBe(pickBodyType('abc'));
		expect(['male', 'female']).toContain(pickBodyType('abc'));
	});

	it('produces a mix across seeds', () => {
		const types = new Set();
		for (let i = 0; i < 40; i++) types.add(pickBodyType('seed-' + i));
		expect(types).toEqual(new Set(['male', 'female']));
	});
});

describe('createCatalogSession request shaping', () => {
	let fetchSpy;
	beforeEach(() => {
		vi.resetModules();
		process.env.AVATURN_API_KEY = 'test-key';
		process.env.AVATURN_API_URL = 'https://api.avaturn.me';
		fetchSpy = vi.spyOn(globalThis, 'fetch');
	});
	afterEach(() => {
		fetchSpy.mockRestore();
		delete process.env.AVATURN_API_KEY;
		delete process.env.AVATURN_API_URL;
	});

	it('POSTs a no-photo create session and returns the session url', async () => {
		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ session_url: 'https://hub.avaturn.me/s/abc', expires_at: '2026-06-26T00:00:00Z' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			}),
		);
		const { createCatalogSession } = await import('../api/_lib/avaturn.js');
		const out = await createCatalogSession({ externalUserId: 'user-1', bodyType: 'female' });

		expect(out.sessionUrl).toBe('https://hub.avaturn.me/s/abc');
		expect(out.expiresAt).toBe('2026-06-26T00:00:00Z');

		const [url, init] = fetchSpy.mock.calls[0];
		expect(url).toBe('https://api.avaturn.me/api/v1/sessions');
		expect(init.method).toBe('POST');
		expect(init.headers.authorization).toBe('Bearer test-key');
		const body = JSON.parse(init.body);
		expect(body).toMatchObject({ external_user_id: 'user-1', body_type: 'female', session_type: 'create' });
		expect(body.photos).toBeUndefined();
	});

	it('throws a coded error on an upstream failure', async () => {
		fetchSpy.mockResolvedValue(new Response('nope', { status: 401 }));
		const { createCatalogSession } = await import('../api/_lib/avaturn.js');
		await expect(createCatalogSession({ externalUserId: 'u' })).rejects.toMatchObject({ code: 'upstream_auth' });
	});
});
