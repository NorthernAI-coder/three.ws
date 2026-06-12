// /api/forge?health — the live backend probe behind the catalog.
//
// The catalog's `configured` flag only proves an env var exists; two prod
// outages (a Replicate account throttle, a misrouted Hunyuan3D worker) hid
// behind it. These tests pin the probe's verdict for each upstream response
// so the health surface can never drift back to "green because env-present".

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { probeForgeHealth, resetForgeHealthCache } from '../../api/_lib/forge-health.js';
import { BACKENDS } from '../../api/_lib/forge-tiers.js';

const ENV_VARS = [
	'NVIDIA_API_KEY',
	'REPLICATE_API_TOKEN',
	'GCP_HUNYUAN3D_URL',
	'GCP_TRIPOSG_URL',
	'GCP_RECONSTRUCTION_URL',
	'GCP_RECONSTRUCTION_KEY',
];
const savedEnv = {};
let savedFetch;

// One mock upstream per probe URL; anything unrouted fails the test loudly.
function mockUpstreams(routes) {
	global.fetch = vi.fn(async (url) => {
		for (const [match, status] of routes) {
			if (String(url).includes(match)) return new Response('{}', { status });
		}
		throw new Error(`unrouted probe fetch: ${url}`);
	});
}

beforeEach(() => {
	for (const v of ENV_VARS) {
		savedEnv[v] = process.env[v];
		delete process.env[v];
	}
	savedFetch = global.fetch;
	resetForgeHealthCache();
});

afterEach(() => {
	for (const v of ENV_VARS) {
		if (savedEnv[v] === undefined) delete process.env[v];
		else process.env[v] = savedEnv[v];
	}
	global.fetch = savedFetch;
	resetForgeHealthCache();
});

describe('forge-health — per-backend verdicts', () => {
	it('reports every backend in the registry, with BYOK lanes marked byok', async () => {
		mockUpstreams([]);
		const health = await probeForgeHealth();
		// Coverage is derived from the registry so a newly added backend can never
		// be silently absent from the health report.
		expect(Object.keys(health.backends).sort()).toEqual(Object.keys(BACKENDS).sort());
		expect(health.backends.meshy.status).toBe('byok');
		expect(health.backends.tripo.status).toBe('byok');
		// No platform env at all → nothing probed, nothing fetched.
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('marks unset platform lanes unconfigured', async () => {
		mockUpstreams([]);
		const health = await probeForgeHealth();
		expect(health.backends.nvidia.status).toBe('unconfigured');
		expect(health.backends.trellis.status).toBe('unconfigured');
		expect(health.backends.hunyuan3d.status).toBe('unconfigured');
	});

	it('hunyuan3d stays unconfigured on the avatar pipeline env alone', async () => {
		process.env.GCP_RECONSTRUCTION_URL = 'https://avatar-reconstruction.example.run.app';
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';
		mockUpstreams([]);
		const health = await probeForgeHealth();
		expect(health.backends.hunyuan3d.status).toBe('unconfigured');
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('passes Replicate when the invalid-version probe is rejected after auth (422)', async () => {
		process.env.REPLICATE_API_TOKEN = 'r8_test';
		mockUpstreams([['api.replicate.com', 422]]);
		const health = await probeForgeHealth();
		expect(health.backends.trellis.status).toBe('ok');
	});

	it('flags a throttled Replicate account as degraded (429)', async () => {
		process.env.REPLICATE_API_TOKEN = 'r8_test';
		mockUpstreams([['api.replicate.com', 429]]);
		const health = await probeForgeHealth();
		expect(health.backends.trellis.status).toBe('degraded');
		expect(health.backends.trellis.message).toMatch(/throttling/i);
		expect(health.status).toBe('degraded');
	});

	it('flags a billing failure as down (402) and a bad token as down (401)', async () => {
		process.env.REPLICATE_API_TOKEN = 'r8_test';
		mockUpstreams([['api.replicate.com', 402]]);
		expect((await probeForgeHealth()).backends.trellis.status).toBe('down');
		resetForgeHealthCache();
		mockUpstreams([['api.replicate.com', 401]]);
		expect((await probeForgeHealth()).backends.trellis.status).toBe('down');
	});

	it('passes NVIDIA when the synthetic status id 404s under a live key', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		mockUpstreams([['api.nvcf.nvidia.com', 404]]);
		const health = await probeForgeHealth();
		expect(health.backends.nvidia.status).toBe('ok');
	});

	it('fails NVIDIA when the key is rejected (401)', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-bad';
		mockUpstreams([['api.nvcf.nvidia.com', 401]]);
		const health = await probeForgeHealth();
		expect(health.backends.nvidia.status).toBe('down');
	});

	it('probes a deployed Hunyuan3D worker and reports 5xx as down', async () => {
		process.env.GCP_HUNYUAN3D_URL = 'https://hunyuan3d.example.run.app';
		process.env.GCP_RECONSTRUCTION_KEY = 'secret';
		mockUpstreams([['hunyuan3d.example.run.app', 200]]);
		expect((await probeForgeHealth()).backends.hunyuan3d.status).toBe('ok');
		resetForgeHealthCache();
		mockUpstreams([['hunyuan3d.example.run.app', 503]]);
		expect((await probeForgeHealth()).backends.hunyuan3d.status).toBe('down');
	});

	it('marks an unreachable upstream down instead of throwing', async () => {
		process.env.REPLICATE_API_TOKEN = 'r8_test';
		global.fetch = vi.fn(async () => {
			throw new Error('network down');
		});
		const health = await probeForgeHealth();
		expect(health.backends.trellis.status).toBe('down');
	});
});

describe('forge-health — caching', () => {
	it('serves the cached payload within the TTL and re-probes on force', async () => {
		process.env.REPLICATE_API_TOKEN = 'r8_test';
		mockUpstreams([['api.replicate.com', 422]]);
		const first = await probeForgeHealth();
		expect(first.cached).toBe(false);
		const calls = global.fetch.mock.calls.length;
		const second = await probeForgeHealth();
		expect(second.cached).toBe(true);
		expect(global.fetch.mock.calls.length).toBe(calls);
		const third = await probeForgeHealth({ force: true });
		expect(third.cached).toBe(false);
		expect(global.fetch.mock.calls.length).toBeGreaterThan(calls);
	});
});
