/**
 * Tests for the paid x402 generation endpoint (api/x402/forge.js).
 *
 * Payment verification/settlement, the FLUX text-to-image step, and the
 * Replicate reconstruction submit are stubbed at their module boundaries — the
 * real upstreams (payment facilitators, Replicate) are exercised by their own
 * suites. What's tested here is the endpoint's own logic: pricing sourced from
 * forge-tiers, the 402 challenge, input validation, and the verify → submit →
 * settle ordering that guarantees a failed generation never charges.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Env the 402 challenge builder reads. Set before importing the handler.
beforeAll(() => {
	Object.assign(process.env, {
		APP_ORIGIN: 'https://three.ws',
		X402_PAY_TO_BASE: '0x0000000000000000000000000000000000000001',
		X402_ASSET_ADDRESS_BASE: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		REPLICATE_API_TOKEN: 'test-token',
	});
});

// Stub payment verify/settle (keep the rest of x402-spec real: send402,
// buildRequirements helpers, buildBazaarSchema, resolveResourceUrl).
vi.mock('../../api/_lib/x402-spec.js', async (importActual) => {
	const actual = await importActual();
	return {
		...actual,
		verifyPayment: vi.fn(async () => ({ ok: true })),
		settlePayment: vi.fn(async () => ({ settled: true })),
		encodePaymentResponseHeader: vi.fn(() => 'stub-payment-response'),
	};
});

// Stub the FLUX text-to-image step and the Replicate reconstruction submit.
vi.mock('../../api/_mcp3d/text-to-image.js', () => ({
	textToImage: vi.fn(async () => ({ imageUrl: 'https://cdn.example/ref.png', model: 'flux', predictionId: 'p1' })),
}));
vi.mock('../../api/_providers/replicate.js', () => ({
	createRegenProvider: () => ({
		submit: vi.fn(async () => ({ extJobId: 'abcd1234efgh5678ij', jobId: 'abcd1234efgh5678ij', eta: 60 })),
	}),
}));

// Rate limiter: deterministic success, no Upstash dependency.
vi.mock('../../api/_lib/rate-limit.js', async (importActual) => {
	const actual = await importActual();
	return {
		...actual,
		limits: { ...actual.limits, publicIp: vi.fn(async () => ({ success: true, reset: Date.now() + 1000 })) },
		clientIp: () => '203.0.113.7',
	};
});

const { default: handler } = await import('../../api/x402/forge.js');

function makeRes() {
	return {
		statusCode: 200,
		headers: {},
		body: null,
		setHeader(name, value) {
			this.headers[String(name).toLowerCase()] = value;
		},
		end(body) {
			this.body = body ?? null;
		},
	};
}

// A request the handler can consume: async-iterable body + headers/method/url.
function makeReq({ method = 'POST', url = '/api/x402/forge', headers = {}, body = null } = {}) {
	const payload = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
	return {
		method,
		url,
		headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
		async *[Symbol.asyncIterator]() {
			if (payload) yield Buffer.from(payload, 'utf8');
		},
	};
}

describe('GET /api/x402/forge — pricing discovery', () => {
	it('returns the per-tier USDC pricing sourced from forge-tiers', async () => {
		const res = makeRes();
		await handler(makeReq({ method: 'GET', url: '/api/x402/forge' }), res);
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.route).toBe('/api/x402/forge');
		const standard = body.pricing_usdc.find((p) => p.tier === 'standard');
		expect(standard.price_usdc).toBe('0.15');
		expect(body.pricing_usdc.find((p) => p.tier === 'draft').price_usdc).toBe('0.05');
		expect(body.pricing_usdc.find((p) => p.tier === 'high').price_usdc).toBe('0.50');
	});
});

describe('POST /api/x402/forge — 402 challenge', () => {
	it('emits a 402 quoting the requested tier price when unpaid', async () => {
		const res = makeRes();
		await handler(makeReq({ body: { prompt: 'a brass owl', tier: 'high' } }), res);
		expect(res.statusCode).toBe(402);
		const body = JSON.parse(res.body);
		// High tier = $0.50 = 500000 atomic. The Base accept must quote it.
		const amounts = (body.accepts || []).map((a) => a.amount);
		expect(amounts).toContain('500000');
	});

	it('quotes the standard price by default', async () => {
		const res = makeRes();
		await handler(makeReq({ body: { prompt: 'a brass owl' } }), res);
		expect(res.statusCode).toBe(402);
		const body = JSON.parse(res.body);
		expect((body.accepts || []).map((a) => a.amount)).toContain('150000');
	});
});

describe('POST /api/x402/forge — validation', () => {
	it('rejects a too-short prompt with no payment required', async () => {
		const res = makeRes();
		await handler(makeReq({ body: { prompt: 'hi' } }), res);
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.body).error).toBe('invalid_prompt');
	});

	it('rejects non-https image_urls', async () => {
		const res = makeRes();
		await handler(makeReq({ body: { image_urls: ['http://insecure/x.png'] } }), res);
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.body).error).toBe('invalid_image_urls');
	});
});

describe('POST /api/x402/forge — paid generation', () => {
	it('submits a job and returns a free poll_url after payment', async () => {
		const res = makeRes();
		await handler(
			makeReq({ headers: { 'x-payment': 'stub-payment-proof' }, body: { prompt: 'a brass steampunk owl', tier: 'standard' } }),
			res,
		);
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.job_id).toBe('abcd1234efgh5678ij');
		expect(body.poll_url).toBe('/api/forge?job=abcd1234efgh5678ij');
		expect(body.mode).toBe('text_to_3d');
		expect(body.tier).toBe('standard');
		expect(body.backend).toBe('trellis');
		expect(body.price_usdc).toBe('0.15');
		// Settlement ran (the x-payment-response header is set).
		expect(res.headers['x-payment-response']).toBe('stub-payment-response');
	});

	it('rejects a paid request that carries no actual input', async () => {
		const res = makeRes();
		await handler(makeReq({ headers: { 'x-payment': 'stub-payment-proof' }, body: {} }), res);
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.body).error).toBe('missing_input');
	});
});
