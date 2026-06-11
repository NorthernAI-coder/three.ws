// Tests for the free NVIDIA NIM (Microsoft TRELLIS) 3D-generation provider.
//
// Mirrors providers-replicate.test.js: global fetch is stubbed, no live calls.
// This is the backend that gives /forge a zero-vendor-cost text→3D and image→3D
// lane behind the platform NVIDIA_API_KEY, so the contract under test is the
// NVCF invoke → 202 → poll → base64-GLB shape plus the normalized error codes
// the forge layer routes around a dead/limited lane on.
//
// Coverage:
//   1. Submit request construction (text→3D and image→3D) against the schema.
//   2. The 202-then-poll loop: running → done, running → failed, poll timeout.
//   3. Asset-upload branch by image size (inline base64 vs NVCF asset handshake).
//   4. Base64-GLB decode + R2 persist (putObject mocked; asserts decoded bytes
//      in, public URL out).
//   5. Every normalized error mapping (401/403/402/429/5xx/network throw).
//   6. Forge-tiers registration + draft-tier free-first default selection.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNvidiaProvider } from '../../api/_providers/nvidia.js';
import {
	BACKENDS,
	resolveBackendId,
	backendIsConfigured,
} from '../../api/_lib/forge-tiers.js';

const TRELLIS_INVOKE = 'https://ai.api.nvidia.com/v1/genai/microsoft/trellis';
const NVCF_STATUS = 'https://api.nvcf.nvidia.com/v2/nvcf/pexec/status';
const NVCF_ASSETS = 'https://api.nvcf.nvidia.com/v2/nvcf/assets';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.NVIDIA_API_KEY;

// persistGlb does a dynamic import of ../_lib/r2.js; intercept it so we can
// assert the decoded GLB bytes flow through to storage and the public URL flows
// back out, without touching real object storage.
const putObjectMock = vi.fn(async () => ({}));
const publicUrlMock = vi.fn((key) => `https://cdn.three.ws/${key}`);
vi.mock('../../api/_lib/r2.js', () => ({
	putObject: (...args) => putObjectMock(...args),
	publicUrl: (...args) => publicUrlMock(...args),
}));

function jsonResponse(body, status = 200, headers = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

beforeEach(() => {
	process.env.NVIDIA_API_KEY = 'nvapi-test-key';
	putObjectMock.mockClear();
	publicUrlMock.mockClear();
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	if (ORIGINAL_KEY === undefined) delete process.env.NVIDIA_API_KEY;
	else process.env.NVIDIA_API_KEY = ORIGINAL_KEY;
	vi.restoreAllMocks();
});

describe('nvidia provider — construction', () => {
	it('refuses to construct without NVIDIA_API_KEY', () => {
		delete process.env.NVIDIA_API_KEY;
		expect(() => createNvidiaProvider()).toThrow(/NVIDIA_API_KEY/);
		try {
			createNvidiaProvider();
		} catch (err) {
			expect(err.code).toBe('missing_key');
			expect(err.status).toBe(503);
		}
	});
});

describe('nvidia provider — text→3D submit', () => {
	function stubAccept() {
		const calls = [];
		globalThis.fetch = vi.fn(async (url, opts = {}) => {
			calls.push({ url: String(url), headers: opts.headers || {}, body: JSON.parse(opts.body) });
			return jsonResponse({}, 202, { 'nvcf-reqid': 'req-text-1' });
		});
		return calls;
	}

	it('builds the TRELLIS text body against the probed schema and returns a poll handle', async () => {
		const calls = stubAccept();
		const provider = createNvidiaProvider();
		const job = await provider.textTo3d({ prompt: 'a tiny brass teapot', tier: 'draft', seed: 7 });

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(TRELLIS_INVOKE);
		expect(calls[0].headers.authorization).toBe('Bearer nvapi-test-key');
		const body = calls[0].body;
		expect(body.mode).toBe('text');
		expect(body.prompt).toBe('a tiny brass teapot');
		expect(body.output_format).toBe('glb');
		expect(body.ss_sampling_steps).toBe(15); // draft tier
		expect(body.slat_sampling_steps).toBe(15);
		expect(body.seed).toBe(7);

		expect(job).toEqual({ kind: 'text-to-3d', taskId: 'req-text-1' });
	});

	it('scales sampling steps by tier and clamps the prompt to 77 chars', async () => {
		const calls = stubAccept();
		const provider = createNvidiaProvider();
		const longPrompt = 'x'.repeat(200);
		await provider.textTo3d({ prompt: longPrompt, tier: { id: 'high' } });

		expect(calls[0].body.ss_sampling_steps).toBe(40); // high tier
		expect(calls[0].body.slat_sampling_steps).toBe(40);
		expect(calls[0].body.prompt).toHaveLength(77);
		// Non-integer seed is omitted, never sent as NaN/garbage.
		expect(calls[0].body).not.toHaveProperty('seed');
	});

	it('errors cleanly when NVCF accepts the job but omits the NVCF-REQID', async () => {
		globalThis.fetch = vi.fn(async () => jsonResponse({}, 202)); // no nvcf-reqid header
		const provider = createNvidiaProvider();
		await expect(provider.textTo3d({ prompt: 'orb' })).rejects.toMatchObject({
			code: 'provider_error',
			status: 502,
		});
	});
});

describe('nvidia provider — image→3D submit + asset-upload branch', () => {
	// Route fetch by URL/method so we can model the image fetch, the optional
	// NVCF asset handshake, and the invoke in one stub.
	function stubImagePipeline({ imageBytes, assetId } = {}) {
		const calls = [];
		globalThis.fetch = vi.fn(async (url, opts = {}) => {
			const u = String(url);
			const method = opts.method || 'GET';
			calls.push({ url: u, method, headers: opts.headers || {}, body: opts.body });
			if (u === 'https://img.three.ws/ref.png') {
				return new Response(imageBytes, { status: 200, headers: { 'content-type': 'image/png' } });
			}
			if (u === NVCF_ASSETS && method === 'POST') {
				return jsonResponse({ assetId, uploadUrl: 'https://presigned.nvcf/upload' });
			}
			if (u === 'https://presigned.nvcf/upload' && method === 'PUT') {
				return new Response(null, { status: 200 });
			}
			if (u === TRELLIS_INVOKE && method === 'POST') {
				return jsonResponse({}, 202, { 'nvcf-reqid': 'req-img-1' });
			}
			throw new Error(`unexpected fetch: ${method} ${u}`);
		});
		return calls;
	}

	it('inlines a small reference image as base64 (no asset handshake)', async () => {
		const calls = stubImagePipeline({ imageBytes: Buffer.from('small-png-bytes') });
		const provider = createNvidiaProvider();
		const job = await provider.imageTo3d({ imageUrl: 'https://img.three.ws/ref.png', tier: 'standard' });

		// No NVCF asset POST happened — only the image fetch + the invoke.
		expect(calls.some((c) => c.url === NVCF_ASSETS)).toBe(false);
		const invoke = calls.find((c) => c.url === TRELLIS_INVOKE);
		const body = JSON.parse(invoke.body);
		expect(body.mode).toBe('image');
		expect(body.image).toBe(`data:image/png;base64,${Buffer.from('small-png-bytes').toString('base64')}`);
		expect(body.ss_sampling_steps).toBe(25); // standard tier
		// No asset reference header on the inline path.
		expect(invoke.headers).not.toHaveProperty('NVCF-INPUT-ASSET-REFERENCES');
		expect(job).toEqual({ kind: 'image-to-3d', taskId: 'req-img-1' });
	});

	it('runs the NVCF asset handshake for an image over the inline limit', async () => {
		const big = Buffer.alloc(190 * 1024, 1); // > 180 KB inline limit
		const calls = stubImagePipeline({ imageBytes: big, assetId: 'asset-xyz' });
		const provider = createNvidiaProvider();
		await provider.imageTo3d({ imageUrl: 'https://img.three.ws/ref.png' });

		// Asset created, then the raw bytes PUT to the presigned URL.
		const create = calls.find((c) => c.url === NVCF_ASSETS && c.method === 'POST');
		expect(create).toBeDefined();
		const put = calls.find((c) => c.url === 'https://presigned.nvcf/upload' && c.method === 'PUT');
		expect(put).toBeDefined();
		expect(Buffer.isBuffer(put.body)).toBe(true);
		expect(put.body.equals(big)).toBe(true); // the raw bytes, not re-encoded

		const invoke = calls.find((c) => c.url === TRELLIS_INVOKE);
		const body = JSON.parse(invoke.body);
		expect(body.image).toBe('data:image/png;asset_id,asset-xyz');
		expect(invoke.headers['NVCF-INPUT-ASSET-REFERENCES']).toBe('asset-xyz');
	});

	it('rejects imageTo3d called without an imageUrl', async () => {
		globalThis.fetch = vi.fn(async () => jsonResponse({}, 202, { 'nvcf-reqid': 'x' }));
		const provider = createNvidiaProvider();
		await expect(provider.imageTo3d({})).rejects.toMatchObject({ code: 'provider_error', status: 400 });
	});

	it('maps an unreachable reference-image host to provider_unreachable', async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		const provider = createNvidiaProvider();
		await expect(provider.imageTo3d({ imageUrl: 'https://img.three.ws/ref.png' })).rejects.toMatchObject({
			code: 'provider_unreachable',
			status: 502,
		});
	});
});

describe('nvidia provider — synchronous 200 completion persists the GLB', () => {
	it('decodes the inline base64 GLB, persists the bytes to R2, returns the public URL', async () => {
		const glbBytes = Buffer.from('GLB\0binary-mesh-data');
		const b64 = glbBytes.toString('base64');
		globalThis.fetch = vi.fn(async () => jsonResponse({ artifacts: [{ base64: b64 }] }, 200));

		const provider = createNvidiaProvider();
		const job = await provider.textTo3d({ prompt: 'sphere' });

		// persist helper received the DECODED bytes + the GLB content type.
		expect(putObjectMock).toHaveBeenCalledTimes(1);
		const putArg = putObjectMock.mock.calls[0][0];
		expect(Buffer.isBuffer(putArg.body)).toBe(true);
		expect(putArg.body.equals(glbBytes)).toBe(true);
		expect(putArg.contentType).toBe('model/gltf-binary');
		expect(putArg.key).toMatch(/^forge\/nvidia\/.+\.glb$/);

		// Provider hands back the durable public URL, no poll handle.
		expect(job.kind).toBe('text-to-3d');
		expect(job.taskId).toBeNull();
		expect(job.resultGlbUrl).toBe(`https://cdn.three.ws/${putArg.key}`);
	});
});

describe('nvidia provider — 202-then-poll loop', () => {
	it('reports running while NVCF returns 202', async () => {
		globalThis.fetch = vi.fn(async () => new Response(null, { status: 202 }));
		const provider = createNvidiaProvider();
		const res = await provider.status({ taskId: 'req-1' });
		expect(res.status).toBe('running');
	});

	it('reports done and persists the GLB when the poll returns 200', async () => {
		const glbBytes = Buffer.from('polled-glb-bytes');
		globalThis.fetch = vi.fn(async (url) => {
			expect(String(url)).toBe(`${NVCF_STATUS}/req-1`);
			return jsonResponse({ artifacts: [{ base64: glbBytes.toString('base64') }] }, 200);
		});
		const provider = createNvidiaProvider();
		const res = await provider.status({ taskId: 'req-1' });

		expect(res.status).toBe('done');
		expect(putObjectMock).toHaveBeenCalledTimes(1);
		expect(putObjectMock.mock.calls[0][0].body.equals(glbBytes)).toBe(true);
		expect(res.resultGlbUrl).toBe(`https://cdn.three.ws/${putObjectMock.mock.calls[0][0].key}`);
	});

	it('reports failed when a finished poll carries no GLB artifact', async () => {
		globalThis.fetch = vi.fn(async () => jsonResponse({ artifacts: [] }, 200));
		const provider = createNvidiaProvider();
		const res = await provider.status({ taskId: 'req-1' });
		expect(res.status).toBe('failed');
		expect(res.error).toMatch(/no GLB/i);
	});

	it('fails terminally on a 401/403 or 404, but keeps polling on 429/5xx', async () => {
		const provider = createNvidiaProvider();

		globalThis.fetch = vi.fn(async () => new Response('no', { status: 403 }));
		expect(await provider.status({ taskId: 'r' })).toMatchObject({ status: 'failed' });

		globalThis.fetch = vi.fn(async () => new Response('gone', { status: 404 }));
		expect(await provider.status({ taskId: 'r' })).toMatchObject({ status: 'failed' });

		globalThis.fetch = vi.fn(async () => new Response('slow down', { status: 429 }));
		expect(await provider.status({ taskId: 'r' })).toMatchObject({ status: 'running' });

		globalThis.fetch = vi.fn(async () => new Response('boom', { status: 503 }));
		expect(await provider.status({ taskId: 'r' })).toMatchObject({ status: 'running' });
	});

	it('keeps the job alive on a poll timeout / network throw', async () => {
		globalThis.fetch = vi.fn(async () => {
			throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
		});
		const provider = createNvidiaProvider();
		const res = await provider.status({ taskId: 'req-1' });
		expect(res.status).toBe('running');
		expect(res.error).toMatch(/poll failed/i);
	});

	it('fails fast when asked to poll with no task id', async () => {
		const provider = createNvidiaProvider();
		const res = await provider.status({});
		expect(res.status).toBe('failed');
		expect(res.error).toMatch(/missing/i);
	});

	it('reports failed when the GLB persist throws mid-poll', async () => {
		putObjectMock.mockRejectedValueOnce(new Error('R2 down'));
		globalThis.fetch = vi.fn(async () =>
			jsonResponse({ artifacts: [{ base64: Buffer.from('x').toString('base64') }] }, 200),
		);
		const provider = createNvidiaProvider();
		const res = await provider.status({ taskId: 'req-1' });
		expect(res.status).toBe('failed');
		expect(res.error).toMatch(/persist/i);
	});
});

describe('nvidia provider — normalized error mapping on submit', () => {
	const cases = [
		{ status: 401, code: 'invalid_key', mapped: 401 },
		{ status: 403, code: 'invalid_key', mapped: 401 },
		{ status: 402, code: 'insufficient_credits', mapped: 402 },
		{ status: 429, code: 'rate_limited', mapped: 429 },
		{ status: 500, code: 'provider_error', mapped: 502 },
		{ status: 503, code: 'provider_error', mapped: 502 },
	];

	for (const c of cases) {
		it(`maps HTTP ${c.status} → ${c.code}`, async () => {
			globalThis.fetch = vi.fn(async () =>
				jsonResponse({ detail: `upstream said ${c.status}` }, c.status),
			);
			const provider = createNvidiaProvider();
			await expect(provider.textTo3d({ prompt: 'cube' })).rejects.toMatchObject({
				code: c.code,
				status: c.mapped,
				providerStatus: c.status,
			});
		});
	}

	it('attaches retryAfter (seconds) from the 429 Retry-After header', async () => {
		globalThis.fetch = vi.fn(async () => jsonResponse({ detail: 'slow down' }, 429, { 'retry-after': '30' }));
		const provider = createNvidiaProvider();
		await expect(provider.textTo3d({ prompt: 'cube' })).rejects.toMatchObject({
			code: 'rate_limited',
			retryAfter: 30,
		});
	});

	it('maps a network throw on submit → provider_unreachable', async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		const provider = createNvidiaProvider();
		await expect(provider.textTo3d({ prompt: 'cube' })).rejects.toMatchObject({
			code: 'provider_unreachable',
			status: 502,
		});
	});

	it('surfaces a TRELLIS 422 validation array as readable detail, not [object Object]', async () => {
		globalThis.fetch = vi.fn(async () =>
			jsonResponse({ detail: [{ loc: ['body', 'prompt'], msg: 'field required' }] }, 422),
		);
		const provider = createNvidiaProvider();
		await expect(provider.textTo3d({ prompt: '' })).rejects.toMatchObject({
			code: 'provider_error',
			providerStatus: 422,
		});
		await provider.textTo3d({ prompt: '' }).catch((err) => {
			expect(err.message).toContain('field required');
		});
	});
});

describe('nvidia provider — forge-tiers registration', () => {
	const prevKey = process.env.NVIDIA_API_KEY;
	afterEach(() => {
		if (prevKey === undefined) delete process.env.NVIDIA_API_KEY;
		else process.env.NVIDIA_API_KEY = prevKey;
	});

	it('registers the platform-keyed free nvidia image backend', () => {
		expect(BACKENDS.nvidia.provider).toBe('nvidia');
		expect(BACKENDS.nvidia.paths).toContain('image');
		expect(BACKENDS.nvidia.free).toBe(true);
		expect(BACKENDS.nvidia.requiresEnv).toContain('NVIDIA_API_KEY');
	});

	it('selects nvidia as the draft default only when NVIDIA_API_KEY is set', () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test-key';
		expect(backendIsConfigured('nvidia')).toBe(true);
		expect(resolveBackendId({ path: 'image', tier: 'draft' })).toBe('nvidia');

		delete process.env.NVIDIA_API_KEY;
		expect(backendIsConfigured('nvidia')).toBe(false);
		// Cleanly skipped → the standing Replicate TRELLIS default takes over.
		expect(resolveBackendId({ path: 'image', tier: 'draft' })).toBe('trellis');
	});

	it('stays explicitly selectable even when its key is absent', () => {
		delete process.env.NVIDIA_API_KEY;
		expect(resolveBackendId({ path: 'image', tier: 'standard', backend: 'nvidia' })).toBe('nvidia');
	});
});
