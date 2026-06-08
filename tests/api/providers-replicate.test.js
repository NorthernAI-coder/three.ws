// Tests for the Replicate avatar-reconstruction provider.
//
// Regression cover for the two TRELLIS contract bugs that made the selfie → 3D
// pipeline silently produce nothing:
//   • TRELLIS `generate_model` defaults to FALSE, so the prediction "succeeds"
//     but returns no GLB unless we explicitly ask for one. The provider must
//     send generate_model:true for TRELLIS-family models.
//   • TRELLIS emits the mesh under the `model_file` output key, which the GLB
//     extractor previously ignored. extractGlbUrl must resolve `model_file`.
//
// Also guards the model-awareness boundary: TRELLIS-only flags must NOT leak to
// a non-TRELLIS model (e.g. Hunyuan3D), where they would 422 against its schema.
//
// We stub global fetch to capture the submitted prediction body and to model
// Replicate's predictions API responses.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_TOKEN = process.env.REPLICATE_API_TOKEN;
const ORIGINAL_RECONSTRUCT = process.env.REPLICATE_RECONSTRUCT_MODEL;
const ORIGINAL_WEBHOOK = process.env.REPLICATE_WEBHOOK_URL;
const ORIGINAL_ORIGIN = process.env.APP_ORIGIN;

async function freshProvider() {
	// Import fresh each time so module-level env reads don't bleed across cases.
	const mod = await import('../../api/_providers/replicate.js?t=' + Math.random());
	return mod.createRegenProvider();
}

// Capture the POST body sent to Replicate and reply with a queued prediction.
function stubSubmit() {
	const calls = [];
	globalThis.fetch = vi.fn(async (url, opts) => {
		calls.push({ url: String(url), body: JSON.parse(opts.body) });
		return new Response(JSON.stringify({ id: 'pred_123', status: 'starting' }), {
			status: 201,
			headers: { 'content-type': 'application/json' },
		});
	});
	return calls;
}

beforeEach(() => {
	process.env.REPLICATE_API_TOKEN = 'r8_test_token';
	delete process.env.REPLICATE_RECONSTRUCT_MODEL;
	delete process.env.REPLICATE_WEBHOOK_URL;
	delete process.env.APP_ORIGIN;
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	if (ORIGINAL_TOKEN === undefined) delete process.env.REPLICATE_API_TOKEN;
	else process.env.REPLICATE_API_TOKEN = ORIGINAL_TOKEN;
	if (ORIGINAL_RECONSTRUCT === undefined) delete process.env.REPLICATE_RECONSTRUCT_MODEL;
	else process.env.REPLICATE_RECONSTRUCT_MODEL = ORIGINAL_RECONSTRUCT;
	if (ORIGINAL_WEBHOOK === undefined) delete process.env.REPLICATE_WEBHOOK_URL;
	else process.env.REPLICATE_WEBHOOK_URL = ORIGINAL_WEBHOOK;
	if (ORIGINAL_ORIGIN === undefined) delete process.env.APP_ORIGIN;
	else process.env.APP_ORIGIN = ORIGINAL_ORIGIN;
	vi.restoreAllMocks();
});

describe('replicate provider — TRELLIS reconstruct input', () => {
	it('sends generate_model:true (the default model would emit no GLB otherwise)', async () => {
		const calls = stubSubmit();
		const provider = await freshProvider();
		await provider.submit({
			mode: 'reconstruct',
			params: { images: ['https://img/a.jpg'] },
			sourceUrl: 'https://img/a.jpg',
		});
		expect(calls).toHaveLength(1);
		// Default model is the firtoz/trellis slug → /models/.../predictions.
		expect(calls[0].url).toContain('/models/firtoz/trellis/predictions');
		const input = calls[0].body.input;
		expect(input.generate_model).toBe(true);
		expect(input.images).toEqual(['https://img/a.jpg']);
		// Video/ply outputs are disabled to halve GPU cost — we only consume the mesh.
		expect(input.generate_color).toBe(false);
	});

	it('lets caller params override the TRELLIS defaults', async () => {
		const calls = stubSubmit();
		const provider = await freshProvider();
		await provider.submit({
			mode: 'reconstruct',
			params: { images: ['https://img/a.jpg'], generate_color: true, texture_size: 2048 },
			sourceUrl: 'https://img/a.jpg',
		});
		const input = calls[0].body.input;
		expect(input.generate_model).toBe(true); // still forced on
		expect(input.generate_color).toBe(true); // caller wins
		expect(input.texture_size).toBe(2048);
	});

	it('does NOT leak generate_model to a non-TRELLIS model (would 422)', async () => {
		process.env.REPLICATE_RECONSTRUCT_MODEL = 'tencent/hunyuan3d-2';
		const calls = stubSubmit();
		const provider = await freshProvider();
		await provider.submit({
			mode: 'reconstruct',
			params: { images: ['https://img/a.jpg'] },
			sourceUrl: 'https://img/a.jpg',
		});
		const input = calls[0].body.input;
		expect(input).not.toHaveProperty('generate_model');
		expect(input).not.toHaveProperty('generate_color');
		expect(input.images).toEqual(['https://img/a.jpg']);
	});
});

describe('replicate provider — GLB extraction from status', () => {
	function stubStatus(output) {
		globalThis.fetch = vi.fn(async () =>
			new Response(JSON.stringify({ id: 'pred_123', status: 'succeeded', output }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			}),
		);
	}

	it('resolves the GLB from the TRELLIS `model_file` output key', async () => {
		stubStatus({ model_file: 'https://cdn/replicate/output.glb', color_video: null });
		const provider = await freshProvider();
		const res = await provider.status('pred_123');
		expect(res.status).toBe('done');
		expect(res.resultGlbUrl).toBe('https://cdn/replicate/output.glb');
		expect(res.error).toBeUndefined();
	});

	it('reports a clear error when a finished prediction carries no GLB', async () => {
		stubStatus({ color_video: 'https://cdn/replicate/render.mp4' });
		const provider = await freshProvider();
		const res = await provider.status('pred_123');
		expect(res.status).toBe('done');
		expect(res.resultGlbUrl).toBeUndefined();
		expect(res.error).toMatch(/no GLB/i);
	});
});
