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
const ENV_KEYS = ['GOOGLE_CLOUD_PROJECT', 'GCP_SERVICE_ACCOUNT_JSON', 'REPLICATE_API_TOKEN'];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

async function freshTextToImage() {
	const mod = await import('../../api/_mcp3d/text-to-image.js?t=' + Math.random());
	return mod.textToImage;
}

function stubFluxSuccess() {
	const calls = [];
	globalThis.fetch = vi.fn(async (url, opts = {}) => {
		calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
		return new Response(
			JSON.stringify({ id: 'pred_flux', status: 'succeeded', output: ['https://replicate.delivery/out.png'] }),
			{ status: 201, headers: { 'content-type': 'application/json' } },
		);
	});
	return calls;
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
