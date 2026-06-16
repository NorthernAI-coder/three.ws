// Forge backend registry — registration + default-routing contract.
//
// Focuses on the free NVIDIA NIM lane (free-first platform policy): it is the
// default for draft AND standard tiers on text prompts WHEN configured, must
// never disturb other tiers or the geometry path, and must stay fully
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

	describe('free-tier default routing', () => {
		it('keeps the Replicate TRELLIS default when NIM is unconfigured', () => {
			delete process.env.NVIDIA_API_KEY;
			expect(resolveBackendId({ path: 'image', tier: 'draft' })).toBe('trellis');
			expect(resolveBackendId({ path: 'image', tier: 'standard' })).toBe('trellis');
		});

		it('routes draft and standard tiers to the free NIM lane when configured', () => {
			process.env.NVIDIA_API_KEY = 'nvapi-test';
			expect(resolveBackendId({ path: 'image', tier: 'draft' })).toBe('nvidia');
			expect(resolveBackendId({ path: 'image', tier: 'standard' })).toBe('nvidia');
		});

		it('never disturbs the high tier or the geometry path', () => {
			process.env.NVIDIA_API_KEY = 'nvapi-test';
			expect(resolveBackendId({ path: 'image', tier: 'high' })).toBe('trellis');
			expect(resolveBackendId({ path: 'geometry', tier: 'draft' })).toBe('meshy');
			expect(resolveBackendId({ path: 'geometry', tier: 'standard' })).toBe('meshy');
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
		// The tier-aware default map advertises the free lane for draft and standard.
		expect(cat.default_backend_for_tier.draft.image).toBe('nvidia');
		expect(cat.default_backend_for_tier.standard.image).toBe('nvidia');
		expect(cat.default_backend_for_tier.high.image).toBe('trellis');
	});

	// NVIDIA's hosted TRELLIS preview is text-only (rejects every user-image
	// input — see tasks/nvidia-nim/probes/trellis.md). Photo submissions must
	// never default onto it.
	it('routes photo submissions to the standing image backend, not the text-only free lane', () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		// Photo uploads at draft and standard must route to trellis (NVIDIA is text-only).
		expect(resolveBackendId({ path: 'image', tier: 'draft', userImages: true })).toBe('trellis');
		expect(resolveBackendId({ path: 'image', tier: 'standard', userImages: true })).toBe('trellis');
		// Prompt-only drafts and standard requests still get the free lane.
		expect(resolveBackendId({ path: 'image', tier: 'draft', userImages: false })).toBe('nvidia');
		expect(resolveBackendId({ path: 'image', tier: 'draft' })).toBe('nvidia');
		expect(resolveBackendId({ path: 'image', tier: 'standard', userImages: false })).toBe('nvidia');
		expect(resolveBackendId({ path: 'image', tier: 'standard' })).toBe('nvidia');
	});

	it('honors an explicit nvidia selection in resolution (the handler owns the rejection)', () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		expect(resolveBackendId({ path: 'image', tier: 'draft', backend: 'nvidia', userImages: true })).toBe('nvidia');
	});

	it('declares the text-only capability in the public catalog', () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		const cat = buildCatalog();
		expect(cat.backends.find((b) => b.id === 'nvidia').user_images).toBe(false);
		expect(cat.backends.find((b) => b.id === 'trellis').user_images).toBe(true);
		expect(cat.backends.find((b) => b.id === 'meshy').user_images).toBe(true);
	});
});

// The Hunyuan3D lane runs on its own Cloud Run worker. It must never report
// configured off the avatar pipeline's GCP_RECONSTRUCTION_URL — that service's
// face pipeline rejects every non-face image, so the lane looked live in the
// catalog while failing 100% of general prompts (prod incident 2026-06-12).
describe('forge-tiers — Hunyuan3D self-host configuration', () => {
	const saved = {};
	const VARS = ['GCP_HUNYUAN3D_URL', 'GCP_RECONSTRUCTION_URL', 'GCP_RECONSTRUCTION_KEY'];
	beforeEach(() => {
		for (const v of VARS) {
			saved[v] = process.env[v];
			delete process.env[v];
		}
	});
	afterEach(() => {
		for (const v of VARS) {
			if (saved[v] === undefined) delete process.env[v];
			else process.env[v] = saved[v];
		}
	});

	it('requires the dedicated worker URL, not the avatar pipeline URL', () => {
		expect(BACKENDS.hunyuan3d.requiresEnv).toEqual(['GCP_HUNYUAN3D_URL', 'GCP_RECONSTRUCTION_KEY']);
	});

	it('stays unconfigured when only the avatar pipeline is deployed', () => {
		process.env.GCP_RECONSTRUCTION_URL = 'https://avatar-reconstruction.example.run.app';
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';
		expect(backendIsConfigured('hunyuan3d')).toBe(false);
		expect(buildCatalog().backends.find((b) => b.id === 'hunyuan3d').configured).toBe(false);
	});

	it('reports configured once its own worker URL and key are set', () => {
		process.env.GCP_HUNYUAN3D_URL = 'https://hunyuan3d.example.run.app';
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';
		expect(backendIsConfigured('hunyuan3d')).toBe(true);
		expect(buildCatalog().backends.find((b) => b.id === 'hunyuan3d').configured).toBe(true);
	});
});
