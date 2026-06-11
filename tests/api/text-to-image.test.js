// Tests for the text→image provider chain behind text→3D.
//
// Regression cover for the production outage where a mangled
// GCP_SERVICE_ACCOUNT_JSON took down ALL text→3D generation:
//   • vertex-imagen must reject mangled service-account JSON with a designed
//     `unconfigured` error, not a raw JSON.parse SyntaxError.
//   • textToImage must fall back to Replicate flux when the preferred Vertex
//     path throws for any reason (it previously trusted isConfigured() — which
//     only checks GOOGLE_CLOUD_PROJECT — and never fell back).
//   • A Vertex data: URI result must be persisted to object storage and
//     returned as an https URL (Replicate caps inline data URIs well below an
//     Imagen PNG's size, so forwarding the data URI breaks reconstruction).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const vertexState = { configured: false, generate: null };
vi.mock('../../api/_mcp3d/vertex-imagen.js', () => ({
	isConfigured: () => vertexState.configured,
	generateImage: (...a) => vertexState.generate(...a),
}));

const r2State = { puts: [] };
vi.mock('../../api/_lib/r2.js', () => ({
	putObject: async (args) => {
		r2State.puts.push(args);
	},
	publicUrl: (key) => `https://cdn.example/${key}`,
}));

const ORIGINAL_FETCH = globalThis.fetch;
const ENV_KEYS = ['NVIDIA_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GCP_SERVICE_ACCOUNT_JSON', 'REPLICATE_API_TOKEN'];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

async function freshTextToImage() {
	const mod = await import('../../api/_mcp3d/text-to-image.js?t=' + Math.random());
	return mod.textToImage;
}

// Route a mocked fetch by host so a single test can exercise the full fallback
// chain (NIM → Vertex → Replicate) and assert which lanes were actually hit.
// Each route is [substringMatch, () => Response]; the first match wins.
function stubFetch(routes) {
	const calls = [];
	globalThis.fetch = vi.fn(async (url, opts = {}) => {
		const u = String(url);
		calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
		for (const [match, responder] of routes) {
			if (u.includes(match)) return responder();
		}
		throw new Error(`unexpected fetch in test: ${u}`);
	});
	return calls;
}

// NIM FLUX artifacts are JPEG (probed live — tasks/nvidia-nim/probes/flux.md),
// so the fixture carries real JPEG magic bytes (ff d8 ff) for the format sniff.
const NIM_JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('nim-jpeg-bytes')]);

function nimSuccessResponse(b64 = NIM_JPEG_BYTES.toString('base64')) {
	return new Response(JSON.stringify({ artifacts: [{ base64: b64, finishReason: 'SUCCESS' }] }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

function replicateSuccessResponse(url = 'https://replicate.delivery/out.png') {
	return new Response(JSON.stringify({ id: 'pred_flux', status: 'succeeded', output: [url] }), {
		status: 201,
		headers: { 'content-type': 'application/json' },
	});
}

function stubFluxSuccess() {
	return stubFetch([['api.replicate.com', () => replicateSuccessResponse()]]);
}

beforeEach(() => {
	vertexState.configured = false;
	vertexState.generate = null;
	r2State.puts.length = 0;
	for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	for (const k of ENV_KEYS) {
		if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
		else process.env[k] = ORIGINAL_ENV[k];
	}
	vi.restoreAllMocks();
});

describe('textToImage — NIM FLUX free lane (first)', () => {
	it('serves from NIM and never touches Vertex or Replicate', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		process.env.GOOGLE_CLOUD_PROJECT = 'demo-project';
		process.env.REPLICATE_API_TOKEN = 'r8_test_token';
		vertexState.configured = true;
		vertexState.generate = vi.fn(async () => ({ imageUrl: 'data:image/png;base64,AAAA' }));
		const calls = stubFetch([['ai.api.nvidia.com', () => nimSuccessResponse()]]);

		const textToImage = await freshTextToImage();
		const result = await textToImage('a red teapot');

		expect(result.model).toBe('black-forest-labs/flux.1-schnell');
		// NIM output is JPEG — persisted bytes, key extension, and Content-Type
		// must all say jpeg, not png (regression cover for the probe finding).
		expect(result.imageUrl).toMatch(/^https:\/\/cdn\.example\/forge\/refs\/.+\.jpg$/);
		// NIM artifact persisted to R2; Vertex and Replicate left untouched.
		expect(r2State.puts).toHaveLength(1);
		expect(r2State.puts[0].contentType).toBe('image/jpeg');
		expect(r2State.puts[0].key).toMatch(/\.jpg$/);
		expect(Buffer.compare(r2State.puts[0].body, NIM_JPEG_BYTES)).toBe(0);
		expect(vertexState.generate).not.toHaveBeenCalled();
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toContain('flux.1-schnell');
		expect(calls[0].body).toMatchObject({ prompt: 'a red teapot', steps: 4 });
		// schnell is guidance-distilled: the endpoint 422s on cfg_scale > 0
		// (verified live), so the request must not send it at all.
		expect(calls[0].body).not.toHaveProperty('cfg_scale');
	});

	it('maps aspect ratio to FLUX pixel dimensions', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		const calls = stubFetch([['ai.api.nvidia.com', () => nimSuccessResponse()]]);

		const textToImage = await freshTextToImage();
		await textToImage('a wide vista', { aspectRatio: '16:9' });

		expect(calls[0].body).toMatchObject({ width: 1344, height: 768 });
	});

	it('falls through to Vertex when NIM fails', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		process.env.GOOGLE_CLOUD_PROJECT = 'demo-project';
		vertexState.configured = true;
		const png = Buffer.from('vertex-png').toString('base64');
		vertexState.generate = vi.fn(async () => ({
			imageUrl: `data:image/png;base64,${png}`,
			model: 'vertex-ai/imagen-3.0-generate-001',
		}));
		const calls = stubFetch([['ai.api.nvidia.com', () => new Response('upstream boom', { status: 500 })]]);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const textToImage = await freshTextToImage();
		const result = await textToImage('a red teapot');

		expect(result.model).toBe('vertex-ai/imagen-3.0-generate-001');
		expect(vertexState.generate).toHaveBeenCalledOnce();
		expect(calls).toHaveLength(1); // NIM was attempted exactly once before handoff
		expect(Buffer.compare(r2State.puts[0].body, Buffer.from('vertex-png'))).toBe(0);
	});

	it('falls all the way through NIM → Vertex → Replicate', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		process.env.GOOGLE_CLOUD_PROJECT = 'demo-project';
		process.env.REPLICATE_API_TOKEN = 'r8_test_token';
		vertexState.configured = true;
		vertexState.generate = vi.fn(async () => {
			throw Object.assign(new Error('vertex down'), { code: 'unconfigured' });
		});
		const calls = stubFetch([
			['ai.api.nvidia.com', () => new Response('boom', { status: 503 })],
			['api.replicate.com', () => replicateSuccessResponse()],
		]);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const textToImage = await freshTextToImage();
		const result = await textToImage('a red teapot');

		expect(result.imageUrl).toBe('https://replicate.delivery/out.png');
		expect(vertexState.generate).toHaveBeenCalledOnce();
		expect(calls.some((c) => c.url.includes('ai.api.nvidia.com'))).toBe(true);
		expect(calls.some((c) => c.url.includes('api.replicate.com'))).toBe(true);
	});

	it('surfaces the NIM error when it is the only configured lane', async () => {
		process.env.NVIDIA_API_KEY = 'nvapi-test';
		stubFetch([['ai.api.nvidia.com', () => new Response('nope', { status: 401 })]]);

		const textToImage = await freshTextToImage();
		await expect(textToImage('a red teapot')).rejects.toThrow(/nim flux returned 401/);
	});
});

describe('textToImage — Vertex → Replicate fallback', () => {
	it('falls back to Replicate flux when the Vertex path throws', async () => {
		process.env.GOOGLE_CLOUD_PROJECT = 'demo-project';
		process.env.REPLICATE_API_TOKEN = 'r8_test_token';
		vertexState.configured = true;
		vertexState.generate = async () => {
			throw Object.assign(new Error('GCP_SERVICE_ACCOUNT_JSON is set but is not valid'), {
				code: 'unconfigured',
			});
		};
		const calls = stubFluxSuccess();
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const textToImage = await freshTextToImage();
		const result = await textToImage('a red teapot');

		expect(result.imageUrl).toBe('https://replicate.delivery/out.png');
		expect(calls.some((c) => c.url.includes('flux-schnell'))).toBe(true);
	});

	it('rethrows the Vertex error when no Replicate token exists to fall back to', async () => {
		process.env.GOOGLE_CLOUD_PROJECT = 'demo-project';
		vertexState.configured = true;
		vertexState.generate = async () => {
			throw Object.assign(new Error('vertex broke'), { code: 'unconfigured' });
		};

		const textToImage = await freshTextToImage();
		await expect(textToImage('a red teapot')).rejects.toThrow('vertex broke');
	});

	it('persists a Vertex data: URI to object storage and returns the https URL', async () => {
		process.env.GOOGLE_CLOUD_PROJECT = 'demo-project';
		vertexState.configured = true;
		const png = Buffer.from('fake-png-bytes').toString('base64');
		vertexState.generate = async () => ({
			imageUrl: `data:image/png;base64,${png}`,
			model: 'vertex-ai/imagen-3.0-generate-001',
		});

		const textToImage = await freshTextToImage();
		const result = await textToImage('a red teapot');

		expect(result.imageUrl).toMatch(/^https:\/\/cdn\.example\/forge\/refs\/.+\.png$/);
		expect(result.model).toBe('vertex-ai/imagen-3.0-generate-001');
		expect(r2State.puts).toHaveLength(1);
		expect(r2State.puts[0].contentType).toBe('image/png');
		expect(Buffer.compare(r2State.puts[0].body, Buffer.from('fake-png-bytes'))).toBe(0);
	});
});

describe('vertex-imagen — service-account JSON hardening', () => {
	it('rejects mangled GCP_SERVICE_ACCOUNT_JSON with a designed unconfigured error', async () => {
		process.env.GOOGLE_CLOUD_PROJECT = 'demo-project';
		// The classic secrets-UI mangle: escaped quotes but no usable key material.
		process.env.GCP_SERVICE_ACCOUNT_JSON = '{\\"type\\":\\"service_account\\"}';
		const real = await vi.importActual('../../api/_mcp3d/vertex-imagen.js');

		await expect(real.generateImage('a red teapot')).rejects.toMatchObject({
			code: 'unconfigured',
		});
	});
});
