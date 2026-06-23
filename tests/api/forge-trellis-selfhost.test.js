// Self-hosted TRELLIS image→3D lane — registration, env-gated config, routing
// precedence, and the gcp provider's `trellis` mode wire contract.
//
// This lane wires our own Microsoft TRELLIS worker (workers/model-trellis) into
// /forge as a NATIVE single-hop image→3D engine: image → TRELLIS → GLB, no FLUX
// intermediate, no vendor cost. Unlike NVIDIA's hosted preview (text-only), a
// self-deployed NIM accepts real user photos, so this is the preferred free image
// lane when MODEL_TRELLIS_URL is configured. The worker speaks the standard task
// shape (POST /infer → GET /tasks/:id → result_gcs_url), distinct from the avatar
// pipeline's face-only `reconstruct` (/reconstruct + /jobs/:id).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	BACKENDS,
	resolveBackendId,
	backendIsConfigured,
	buildCatalog,
} from '../../api/_lib/forge-tiers.js';
import { createRegenProvider } from '../../api/_providers/gcp.js';

const VARS = [
	'MODEL_TRELLIS_URL',
	'GCP_RECONSTRUCTION_KEY',
	'NVIDIA_API_KEY',
	'HF_TOKEN',
];
const saved = {};
const ORIGINAL_FETCH = globalThis.fetch;

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
	globalThis.fetch = ORIGINAL_FETCH;
	vi.restoreAllMocks();
});

describe('forge-tiers — self-hosted TRELLIS backend registration', () => {
	it('registers a free, platform-keyed image backend that accepts user photos', () => {
		const b = BACKENDS.trellis_selfhost;
		expect(b).toBeTruthy();
		expect(b.provider).toBe('gcp');
		expect(b.byok).toBe(false);
		expect(b.paths).toEqual(['image']);
		expect(b.requiresEnv).toEqual(['MODEL_TRELLIS_URL', 'GCP_RECONSTRUCTION_KEY']);
		expect(b.free).toBe(true);
		expect(b.userImages).toBe(true);
		expect(b.credits).toBeNull();
		expect(b.baseEta).toBeGreaterThan(0);
	});

	it('is configured only when BOTH the worker URL and the shared key are present', () => {
		expect(backendIsConfigured('trellis_selfhost')).toBe(false);
		process.env.MODEL_TRELLIS_URL = 'https://trellis.example.run.app';
		expect(backendIsConfigured('trellis_selfhost')).toBe(false); // key still missing
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';
		expect(backendIsConfigured('trellis_selfhost')).toBe(true);
	});

	it('surfaces in the catalog as a free, photo-capable, selectable engine', () => {
		process.env.MODEL_TRELLIS_URL = 'https://trellis.example.run.app';
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';
		const b = buildCatalog().backends.find((x) => x.id === 'trellis_selfhost');
		expect(b).toBeTruthy();
		expect(b.free).toBe(true);
		expect(b.user_images).toBe(true);
		expect(b.byok).toBeNull();
		expect(b.configured).toBe(true);
		const est = b.estimates.image.find((e) => e.tier === 'standard');
		expect(est.eta_seconds).toBeGreaterThan(0);
		expect(est.credits).toBeNull();
	});
});

describe('forge-tiers — self-hosted TRELLIS routing precedence', () => {
	it('becomes the preferred free image lane for photo submissions when configured', () => {
		process.env.MODEL_TRELLIS_URL = 'https://trellis.example.run.app';
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';
		process.env.HF_TOKEN = 'hf_test'; // HF also live — TRELLIS must still win the photo default
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		// Draft/standard photo uploads route to our self-hosted TRELLIS, ahead of HF.
		expect(resolveBackendId({ path: 'image', tier: 'draft', userImages: true })).toBe('trellis_selfhost');
		expect(resolveBackendId({ path: 'image', tier: 'standard', userImages: true })).toBe('trellis_selfhost');
	});

	it('does not disturb the native text→3D default (NVIDIA) or the high-tier textured engine', () => {
		process.env.MODEL_TRELLIS_URL = 'https://trellis.example.run.app';
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';
		process.env.HF_TOKEN = 'hf_test';
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		// Text prompts at draft/standard still get NVIDIA's native single-hop lane.
		expect(resolveBackendId({ path: 'image', tier: 'draft', userImages: false })).toBe('nvidia');
		expect(resolveBackendId({ path: 'image', tier: 'standard', userImages: false })).toBe('nvidia');
		// High tier keeps the higher-fidelity textured HuggingFace engine.
		expect(resolveBackendId({ path: 'image', tier: 'high' })).toBe('huggingface');
	});

	it('degrades cleanly to HuggingFace when the worker URL is absent', () => {
		// No MODEL_TRELLIS_URL → trellis_selfhost unconfigured → HF serves photos.
		process.env.HF_TOKEN = 'hf_test';
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		expect(resolveBackendId({ path: 'image', tier: 'draft', userImages: true })).toBe('huggingface');
	});

	it('stays explicitly selectable (the handler owns any rejection)', () => {
		// Even unconfigured, an explicit pick is honored at resolution time.
		expect(
			resolveBackendId({ path: 'image', tier: 'standard', backend: 'trellis_selfhost', userImages: true }),
		).toBe('trellis_selfhost');
	});
});

describe('gcp provider — trellis mode wire contract', () => {
	it('submits image→3D to the worker /infer endpoint and packs a pollable job', async () => {
		process.env.MODEL_TRELLIS_URL = 'https://trellis.example.run.app';
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';

		const fetchMock = vi.fn(async (url, opts) => {
			expect(url).toBe('https://trellis.example.run.app/infer');
			const body = JSON.parse(opts.body);
			expect(body.images).toEqual(['https://cdn.three.ws/photo.png']);
			expect(body.body_type).toBe('neutral');
			expect(opts.headers.authorization).toBe('Bearer secret');
			return new Response(JSON.stringify({ task_id: 'task-123', status: 'queued' }), {
				status: 202,
				headers: { 'content-type': 'application/json' },
			});
		});
		globalThis.fetch = fetchMock;

		const provider = createRegenProvider();
		const submitted = await provider.submit({
			mode: 'trellis',
			sourceUrl: 'https://cdn.three.ws/photo.png',
			params: { images: ['https://cdn.three.ws/photo.png'] },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(submitted.extJobId).toBeTruthy();
		expect(submitted.backend).toBe('gcp');
		expect(submitted.viewsUsed).toBe(1);
		expect(submitted.eta).toBeGreaterThan(0);
	});

	it('polls /tasks/:id and surfaces result_gcs_url as the GLB url on done', async () => {
		process.env.MODEL_TRELLIS_URL = 'https://trellis.example.run.app';
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';

		// First call: submit (202 + task_id). Second call: poll (200 + done).
		const calls = [];
		globalThis.fetch = vi.fn(async (url) => {
			calls.push(url);
			if (url.endsWith('/infer')) {
				return new Response(JSON.stringify({ task_id: 'task-xyz', status: 'queued' }), {
					status: 202,
					headers: { 'content-type': 'application/json' },
				});
			}
			// poll
			expect(url).toBe('https://trellis.example.run.app/tasks/task-xyz');
			return new Response(
				JSON.stringify({
					task_id: 'task-xyz',
					status: 'done',
					result_gcs_url: 'https://storage.googleapis.com/bucket/raw-meshes/trellis/task-xyz.glb',
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		});

		const provider = createRegenProvider();
		const submitted = await provider.submit({
			mode: 'trellis',
			sourceUrl: 'https://cdn.three.ws/photo.png',
			params: { images: ['https://cdn.three.ws/photo.png'] },
		});
		const status = await provider.status(submitted.extJobId);
		expect(status.status).toBe('done');
		expect(status.resultGlbUrl).toBe(
			'https://storage.googleapis.com/bucket/raw-meshes/trellis/task-xyz.glb',
		);
	});
});
