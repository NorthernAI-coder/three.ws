/**
 * Resilience tests for the free-first fallback in api/forge.js.
 *
 * The default forge flow — type a prompt, Standard tier — routes to the paid
 * image-intermediate TRELLIS lane on Replicate. When that upstream is throttled
 * or over-quota (HTTP 429/5xx) a text prompt must NEVER dead-end: it degrades to
 * the free NVIDIA NIM lane so the user always gets a model. These tests stub the
 * provider boundaries and assert the degraded request still returns a finished
 * model with provenance reporting the lane that actually ran (backend:nvidia),
 * so the downgrade is visible rather than silent.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

beforeAll(() => {
	Object.assign(process.env, {
		APP_ORIGIN: 'https://three.ws',
		REPLICATE_API_TOKEN: 'test-token',
		NVIDIA_API_KEY: 'test-nvidia-key',
	});
});

// Replicate (paid TRELLIS lane) is over-quota — every submit throws a 429 the
// same way api/_providers/replicate.js does on a non-ok response.
vi.mock('../../api/_providers/replicate.js', () => ({
	createRegenProvider: () => ({
		submit: vi.fn(async () => {
			throw Object.assign(new Error('replicate returned 429'), {
				code: 'provider_error',
				status: 502,
				providerStatus: 429,
			});
		}),
	}),
}));

// FLUX text-to-image (the standard-tier intermediate view) succeeds — the
// failure under test is the reconstruction submit, not image synthesis.
vi.mock('../../api/_mcp3d/text-to-image.js', () => ({
	textToImage: vi.fn(async () => ({ imageUrl: 'https://cdn.example/ref.png', model: 'flux' })),
}));

// Free NVIDIA NIM lane completes synchronously with a durable GLB.
const nvidiaTextTo3d = vi.fn(async () => ({ taskId: null, resultGlbUrl: 'https://cdn.example/free.glb' }));
vi.mock('../../api/_providers/nvidia.js', () => ({
	createNvidiaProvider: () => ({ textTo3d: nvidiaTextTo3d }),
}));

// Store: no real DB. createCreation returns an id; materialize echoes a durable url.
vi.mock('../../api/_lib/forge-store.js', () => ({
	hashClient: (v) => `client:${v || 'anon'}`,
	hashIp: (v) => `ip:${v}`,
	createCreation: vi.fn(async () => 'creation-1'),
	materializeCreation: vi.fn(async ({ glbUrl }) => ({ id: 'creation-1', glbUrl })),
	markFailed: vi.fn(async () => {}),
	findByJob: vi.fn(async () => null),
}));

// Vision pre-check is a no-op pass (irrelevant to text→3D anyway).
vi.mock('../../api/_lib/forge-image-validate.js', () => ({
	validateForgeImage: vi.fn(async () => ({ ok: true })),
}));

// Rate limiter: deterministic success so the lane logic — not the limiter — is
// what the test exercises.
vi.mock('../../api/_lib/rate-limit.js', async (importActual) => {
	const actual = await importActual();
	return {
		...actual,
		limits: {
			...actual.limits,
			mcp3dGenerate: vi.fn(async () => ({ success: true, reset: Date.now() + 1000 })),
			mcp3dGenerateFree: vi.fn(async () => ({ success: true, reset: Date.now() + 1000 })),
		},
		clientIp: () => '203.0.113.9',
	};
});

const { default: handler } = await import('../../api/forge.js');

function makeReq(body) {
	return {
		method: 'POST',
		url: '/api/forge',
		headers: { 'content-type': 'application/json', 'x-forge-client': 'tester' },
		on(event, cb) {
			if (event === 'data') cb(Buffer.from(JSON.stringify(body)));
			if (event === 'end') cb();
		},
	};
}

function makeRes() {
	return {
		statusCode: 200,
		headers: {},
		body: null,
		setHeader(name, value) {
			this.headers[String(name).toLowerCase()] = value;
		},
		end(body) {
			this.body = body ? JSON.parse(body) : null;
		},
	};
}

describe('forge free-first fallback when the paid lane is over-quota', () => {
	it('degrades a Standard text prompt to the free NVIDIA lane instead of 429ing', async () => {
		const req = makeReq({ prompt: 'a red ceramic coffee mug', tier: 'standard', path: 'image' });
		const res = makeRes();
		await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(res.body.status).toBe('done');
		expect(res.body.backend).toBe('nvidia');
		expect(res.body.glb_url).toBe('https://cdn.example/free.glb');
		expect(nvidiaTextTo3d).toHaveBeenCalled();
	});

	it('still surfaces a busy state for an image upload (no free reconstruct fallback)', async () => {
		nvidiaTextTo3d.mockClear();
		const req = makeReq({
			image_urls: ['https://cdn.example/photo.png'],
			prompt: 'a mug',
			tier: 'standard',
			path: 'image',
			skip_validation: true,
		});
		const res = makeRes();
		await handler(req, res);

		// Image→3D has no free fallback (NVCF is text-only), so it does NOT silently
		// produce an unrelated prompt-based model — it returns the honest busy state.
		expect(res.statusCode).toBe(429);
		expect(res.body.error).toBe('rate_limited');
		expect(nvidiaTextTo3d).not.toHaveBeenCalled();
	});
});
