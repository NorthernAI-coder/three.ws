// Forge backend registry — registration + default-routing contract.
//
// Focuses on the free NVIDIA NIM lane added for the draft tier (free-first
// platform policy): it must be the draft default WHEN configured, must never
// disturb the existing per-path defaults at other tiers, and must stay fully
// selectable. The provider module / live behavior is covered separately.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	BACKENDS,
	resolveBackendId,
	backendIsConfigured,
	buildCatalog,
} from '../../api/_lib/forge-tiers.js';

describe('forge-tiers — NVIDIA NIM backend registration', () => {
	const prevKey = process.env.NVIDIA_API_KEY;
	afterEach(() => {
		if (prevKey === undefined) delete process.env.NVIDIA_API_KEY;
		else process.env.NVIDIA_API_KEY = prevKey;
	});

	it('registers a platform-keyed, free image-path backend', () => {
		const nv = BACKENDS.nvidia;
		expect(nv).toBeTruthy();
		expect(nv.provider).toBe('nvidia');
		expect(nv.byok).toBe(false);
		expect(nv.paths).toEqual(['image']);
		expect(nv.requiresEnv).toEqual(['NVIDIA_API_KEY']);
		expect(nv.free).toBe(true);
		expect(nv.credits).toBeNull();
		expect(nv.baseEta).toBeGreaterThan(0);
	});

	it('is configured only when NVIDIA_API_KEY is present', () => {
		delete process.env.NVIDIA_API_KEY;
		expect(backendIsConfigured('nvidia')).toBe(false);
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		expect(backendIsConfigured('nvidia')).toBe(true);
	});

	describe('draft-tier default routing', () => {
		it('keeps the Replicate TRELLIS default when NIM is unconfigured', () => {
			delete process.env.NVIDIA_API_KEY;
			expect(resolveBackendId({ path: 'image', tier: 'draft' })).toBe('trellis');
		});

		it('routes the draft tier to the free NIM lane when configured', () => {
			process.env.NVIDIA_API_KEY = 'nvapi-test';
			expect(resolveBackendId({ path: 'image', tier: 'draft' })).toBe('nvidia');
		});

		it('never disturbs standard/high or the geometry path', () => {
			process.env.NVIDIA_API_KEY = 'nvapi-test';
			expect(resolveBackendId({ path: 'image', tier: 'standard' })).toBe('trellis');
			expect(resolveBackendId({ path: 'image', tier: 'high' })).toBe('trellis');
			expect(resolveBackendId({ path: 'geometry', tier: 'draft' })).toBe('meshy');
		});
	});

	it('stays selectable at any tier when explicitly named', () => {
		delete process.env.NVIDIA_API_KEY;
		expect(resolveBackendId({ path: 'image', tier: 'standard', backend: 'nvidia' })).toBe('nvidia');
		expect(resolveBackendId({ path: 'image', tier: 'high', backend: 'nvidia' })).toBe('nvidia');
	});

	it('keeps other backends selectable on the draft tier even when NIM is the default', () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		expect(resolveBackendId({ path: 'image', tier: 'draft', backend: 'trellis' })).toBe('trellis');
	});

	it('surfaces the backend in the public catalog with honest estimates', () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		const cat = buildCatalog();
		const nv = cat.backends.find((b) => b.id === 'nvidia');
		expect(nv).toBeTruthy();
		expect(nv.free).toBe(true);
		expect(nv.configured).toBe(true);
		expect(nv.byok).toBeNull();
		const draftEst = nv.estimates.image.find((e) => e.tier === 'draft');
		expect(draftEst.eta_seconds).toBeGreaterThan(0);
		expect(draftEst.credits).toBeNull();
		// The tier-aware default map advertises the free lane for draft.
		expect(cat.default_backend_for_tier.draft.image).toBe('nvidia');
		expect(cat.default_backend_for_tier.standard.image).toBe('trellis');
	});
});
