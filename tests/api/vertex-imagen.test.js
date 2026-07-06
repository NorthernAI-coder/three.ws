// Unit tests for the Vertex AI image-generation client.
//
// The Imagen `:predict` family is being retired (imagen-3.0-* shut down
// 2026-06-30; imagen-4.0-* by 2026-08-17), so the client now defaults to the
// live Gemini image model `gemini-2.5-flash-image` via `:generateContent`, and
// only takes the legacy `:predict` shape for an explicit `imagen-*` override.
//
// These tests pin BOTH request/response shapes against the documented Vertex
// contract and the model-prefix router, without any live credentials: the GCP
// token mint is mocked and every HTTP call is a recorded-shape fixture (a test
// double for an external API, not product data). Live E2E is a separate, creds-
// gated step tracked in docs/gcp-credits.md.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api/_lib/gcp-auth.js', () => ({
	getGcpAccessToken: vi.fn(async () => 'fake-access-token'),
}));

import { generateImage, editImage, isConfigured } from '../../api/_mcp3d/vertex-imagen.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ENV_KEYS = ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'VERTEX_IMAGEN_MODEL', 'VERTEX_IMAGEN_EDIT_MODEL'];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function stubFetch(responder) {
	const calls = [];
	globalThis.fetch = vi.fn(async (url, opts = {}) => {
		const call = { url: String(url), body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers };
		calls.push(call);
		return responder(call);
	});
	return calls;
}

// A gemini-2.5-flash-image generateContent success: the image rides back as an
// inlineData part (base64 + mimeType), same as the live API.
function geminiImageResponse(b64 = Buffer.from('gemini-png').toString('base64'), mime = 'image/png') {
	return new Response(
		JSON.stringify({
			candidates: [{ content: { parts: [{ inlineData: { mimeType: mime, data: b64 } }] }, finishReason: 'STOP' }],
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } },
	);
}

// A legacy Imagen :predict success: base64 under predictions[].bytesBase64Encoded.
function imagenPredictResponse(b64 = Buffer.from('imagen-png').toString('base64')) {
	return new Response(JSON.stringify({ predictions: [{ bytesBase64Encoded: b64 }] }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

beforeEach(() => {
	for (const k of ENV_KEYS) delete process.env[k];
	process.env.GOOGLE_CLOUD_PROJECT = 'demo-project';
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	for (const k of ENV_KEYS) {
		if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
		else process.env[k] = ORIGINAL_ENV[k];
	}
	vi.clearAllMocks();
});

describe('vertex-imagen — default Gemini image path', () => {
	it('calls :generateContent with the documented image-modality body', async () => {
		const calls = stubFetch(() => geminiImageResponse());
		const result = await generateImage('a red teapot', { aspectRatio: '16:9' });

		expect(calls).toHaveLength(1);
		const { url, body, headers } = calls[0];
		// Endpoint: regional host + publisher model + :generateContent (NOT :predict).
		expect(url).toBe(
			'https://us-central1-aiplatform.googleapis.com/v1/projects/demo-project' +
				'/locations/us-central1/publishers/google/models/gemini-2.5-flash-image:generateContent',
		);
		expect(headers.authorization).toBe('Bearer fake-access-token');
		// Request shape: text prompt + IMAGE modality + aspect ratio in imageConfig.
		expect(body.contents[0].parts[0].text).toBe('a red teapot');
		expect(body.generationConfig.responseModalities).toEqual(['IMAGE']);
		expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');

		// Response parse: inlineData → data URI carrying the real mime type + model tag.
		expect(result.imageUrl).toBe(`data:image/png;base64,${Buffer.from('gemini-png').toString('base64')}`);
		expect(result.model).toBe('vertex-ai/gemini-2.5-flash-image');
	});

	it('preserves the response mime type in the data URI', async () => {
		stubFetch(() => geminiImageResponse(Buffer.from('jpg').toString('base64'), 'image/jpeg'));
		const result = await generateImage('a teapot');
		expect(result.imageUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
	});

	it('accepts the wide Gemini aspect-ratio set and falls back to 1:1 for unknown', async () => {
		let calls = stubFetch(() => geminiImageResponse());
		await generateImage('x', { aspectRatio: '21:9' });
		expect(calls[0].body.generationConfig.imageConfig.aspectRatio).toBe('21:9');

		calls = stubFetch(() => geminiImageResponse());
		await generateImage('x', { aspectRatio: '7:3' }); // not a supported ratio
		expect(calls[0].body.generationConfig.imageConfig.aspectRatio).toBe('1:1');
	});

	it('throws with the finishReason when a safety block returns no image', async () => {
		stubFetch(
			() =>
				new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'blocked' }] }, finishReason: 'SAFETY' }] }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
		);
		await expect(generateImage('x')).rejects.toThrow(/no image data.*SAFETY/);
	});
});

describe('vertex-imagen — legacy Imagen :predict override', () => {
	beforeEach(() => {
		process.env.VERTEX_IMAGEN_MODEL = 'imagen-4.0-generate-001';
	});

	it('routes an imagen-* model to :predict with the instances/parameters body', async () => {
		const calls = stubFetch(() => imagenPredictResponse());
		const result = await generateImage('a red teapot', { aspectRatio: '4:3' });

		const { url, body } = calls[0];
		expect(url).toContain('/models/imagen-4.0-generate-001:predict');
		expect(body.instances[0].prompt).toBe('a red teapot');
		expect(body.parameters).toMatchObject({
			sampleCount: 1,
			aspectRatio: '4:3',
			addWatermark: false,
			safetySetting: 'block_some',
			personGeneration: 'allow_adult',
		});
		expect(result.imageUrl).toBe(`data:image/png;base64,${Buffer.from('imagen-png').toString('base64')}`);
		expect(result.model).toBe('vertex-ai/imagen-4.0-generate-001');
	});
});

describe('vertex-imagen — location + error handling', () => {
	it('uses the un-prefixed host for the global location', async () => {
		process.env.GOOGLE_CLOUD_LOCATION = 'global';
		const calls = stubFetch(() => geminiImageResponse());
		await generateImage('x');
		expect(calls[0].url.startsWith('https://aiplatform.googleapis.com/v1/projects/demo-project/locations/global/')).toBe(true);
	});

	it('maps 429 to a retryable rate_limited error', async () => {
		stubFetch(() => new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 }));
		await expect(generateImage('x')).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 10 });
	});

	it('surfaces a 500 with providerStatus so the caller can fall back', async () => {
		stubFetch(() => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }));
		await expect(generateImage('x')).rejects.toMatchObject({ providerStatus: 500 });
	});

	it('maps a network failure to provider_unreachable', async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error('ECONNRESET');
		});
		await expect(generateImage('x')).rejects.toMatchObject({ code: 'provider_unreachable' });
	});

	it('throws unconfigured when GOOGLE_CLOUD_PROJECT is missing', async () => {
		delete process.env.GOOGLE_CLOUD_PROJECT;
		expect(isConfigured()).toBe(false);
		await expect(generateImage('x')).rejects.toMatchObject({ code: 'unconfigured' });
	});
});

describe('vertex-imagen — editImage routing', () => {
	it('sends the source image as an inlineData part on the Gemini edit path', async () => {
		const calls = stubFetch(() => geminiImageResponse());
		const src = `data:image/png;base64,${Buffer.from('source').toString('base64')}`;
		const result = await editImage(src, 'make it blue');

		const { url, body } = calls[0];
		expect(url).toContain('/models/gemini-2.5-flash-image:generateContent');
		expect(body.contents[0].parts[0].text).toBe('make it blue');
		expect(body.contents[0].parts[1].inlineData.data).toBe(Buffer.from('source').toString('base64'));
		expect(result.model).toBe('vertex-ai/gemini-2.5-flash-image');
	});
});
