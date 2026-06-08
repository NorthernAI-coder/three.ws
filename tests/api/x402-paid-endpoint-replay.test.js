// Always-on replay protection for api/_lib/x402-paid-endpoint.js.
//
// The payment-identifier idempotency extension is client-opt-in. A payer who
// omits it must still not be able to replay a captured X-PAYMENT header to
// re-run the handler (re-delivering the paid good) or re-settle. The wrapper
// falls back to the signed payment-proof hash as the dedup key so replay
// protection is unconditional, WITHOUT trusting the external facilitator.
//
// We drive the full paidEndpoint() handler with a stubbed req/res and mock only
// verifyPayment + settlePayment (the external-facilitator round-trips); the rest
// of the wrapper — 402 build, idempotency cache, proof binding — runs for real
// against the in-memory cache fallback.

import { Readable } from 'node:stream';

import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';

// Mock only the facilitator-facing verify/settle; keep every other export real
// so send402/build402Body/encodePaymentResponseHeader behave normally.
const verifyPayment = vi.fn();
const settlePayment = vi.fn();
vi.mock('../../api/_lib/x402-spec.js', async (importActual) => {
	const actual = await importActual();
	return { ...actual, verifyPayment, settlePayment };
});

// Heavy upstreams imported transitively — stub so the suite is fast + offline.
vi.mock('@coinbase/x402', () => ({ createCdpAuthHeaders: vi.fn(async () => ({})) }));

let paidEndpoint;
let cacheMod;

const BASE = 'eip155:8453';
const PAY_TO_BASE = '0x4022de2d36c334e73c7a108805cea11c0564f402';
const ASSET_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ROUTE = '/api/x402/replay-test';

const HANDLER_BAZAAR = {
	discoverable: true,
	info: {
		input: { type: 'object', properties: {}, required: [] },
		output: { type: 'object', properties: { ok: { type: 'boolean' } } },
	},
	schema: { type: 'object' },
};

function mockReqRes({ method = 'GET', headers = {}, url = ROUTE } = {}) {
	const lowerHeaders = {};
	for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = v;
	const req = Object.assign(new Readable({ read() {} }), {
		method,
		url,
		headers: lowerHeaders,
		connection: { remoteAddress: '127.0.0.1' },
		socket: { remoteAddress: '127.0.0.1' },
	});
	req.push(null);
	const chunks = [];
	const resHeaders = {};
	const res = {
		statusCode: 200,
		writableEnded: false,
		setHeader(k, v) {
			resHeaders[k.toLowerCase()] = v;
		},
		getHeader(k) {
			return resHeaders[k.toLowerCase()];
		},
		end(body) {
			if (body !== undefined) chunks.push(body);
			res.writableEnded = true;
		},
		write(chunk) {
			chunks.push(chunk);
		},
		get body() {
			return chunks.join('');
		},
		get headers() {
			return resHeaders;
		},
	};
	return { req, res };
}

// A base64 X-PAYMENT header. `withId` attaches a payment-identifier extension;
// omit it to exercise the always-on proof-hash fallback. `salt` varies the
// signed proof so distinct payments hash distinctly.
function paymentHeader({ withId = null, salt = 'a' } = {}) {
	const payload = {
		x402Version: 2,
		scheme: 'exact',
		network: BASE,
		payload: { authorization: { value: '1000', to: PAY_TO_BASE, salt } },
	};
	if (withId) {
		payload.extensions = {
			'payment-identifier': { info: { required: false, id: withId } },
		};
	}
	return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function makeEndpoint(handler, spec = {}) {
	return paidEndpoint({
		route: ROUTE,
		method: 'GET',
		networks: ['base'],
		description: 'replay protection test',
		bazaar: HANDLER_BAZAAR,
		offerReceipt: false,
		handler,
		...spec,
	});
}

const ORIG_ENV = { ...process.env };

beforeAll(async () => {
	process.env.X402_ALLOW_MEMORY_FALLBACK = '1';
	paidEndpoint = (await import('../../api/_lib/x402-paid-endpoint.js')).paidEndpoint;
	cacheMod = await import('../../api/_lib/x402/idempotency-cache.js');
});

beforeEach(() => {
	process.env.X402_PAY_TO_BASE = PAY_TO_BASE;
	process.env.X402_ASSET_ADDRESS_BASE = ASSET_BASE;
	process.env.X402_MAX_AMOUNT_REQUIRED = '1000';
	delete process.env.CDP_API_KEY_ID;
	delete process.env.CDP_API_KEY_SECRET;
	delete process.env.X402_BUILDER_CODE_APP;
	cacheMod._resetMemoryStore();
	verifyPayment.mockReset();
	settlePayment.mockReset();
	verifyPayment.mockImplementation(async () => ({
		paymentPayload: {},
		requirement: { scheme: 'exact', network: BASE, payTo: PAY_TO_BASE, asset: ASSET_BASE, amount: '1000' },
		payer: 'PAYER',
	}));
	settlePayment.mockImplementation(async () => ({
		success: true,
		transaction: '0xdeadbeef',
		network: BASE,
		payer: 'PAYER',
	}));
});

afterAll(() => {
	for (const k of Object.keys(process.env)) if (!(k in ORIG_ENV)) delete process.env[k];
	Object.assign(process.env, ORIG_ENV);
});

describe('paidEndpoint() always-on replay protection (no client payment-identifier)', () => {
	it('first call delivers + settles; a replay of the same proof serves the cached body without re-running the handler or re-settling', async () => {
		let handlerCalls = 0;
		const handler = makeEndpoint(async ({ payer }) => {
			handlerCalls += 1;
			return { ok: true, n: handlerCalls, payer };
		});
		const header = paymentHeader();

		const { req: r1, res: s1 } = mockReqRes({ headers: { 'x-payment': header } });
		await handler(r1, s1);
		expect(s1.statusCode).toBe(200);
		expect(JSON.parse(s1.body)).toMatchObject({ ok: true, n: 1 });
		expect(handlerCalls).toBe(1);
		expect(settlePayment).toHaveBeenCalledTimes(1);

		const { req: r2, res: s2 } = mockReqRes({ headers: { 'x-payment': header } });
		await handler(r2, s2);
		expect(s2.statusCode).toBe(200);
		// Cached replay — same body, flagged, and crucially the handler + settle
		// did NOT run a second time.
		expect(s2.getHeader('x-x402-idempotent')).toBe('replay');
		expect(s2.body).toBe(s1.body);
		expect(handlerCalls).toBe(1);
		expect(settlePayment).toHaveBeenCalledTimes(1);
	});

	it('a different payment (distinct signed proof) is NOT blocked', async () => {
		let handlerCalls = 0;
		const handler = makeEndpoint(async () => {
			handlerCalls += 1;
			return { ok: true, n: handlerCalls };
		});

		const { req: r1, res: s1 } = mockReqRes({ headers: { 'x-payment': paymentHeader({ salt: 'a' }) } });
		await handler(r1, s1);
		const { req: r2, res: s2 } = mockReqRes({ headers: { 'x-payment': paymentHeader({ salt: 'b' }) } });
		await handler(r2, s2);

		expect(s1.statusCode).toBe(200);
		expect(s2.statusCode).toBe(200);
		expect(s2.getHeader('x-x402-idempotent')).toBeUndefined();
		expect(handlerCalls).toBe(2);
		expect(settlePayment).toHaveBeenCalledTimes(2);
	});

	it('the same proof replayed against a different request payload is denied with 409 conflict', async () => {
		const handler = makeEndpoint(async () => ({ ok: true }));
		const header = paymentHeader();

		const { req: r1, res: s1 } = mockReqRes({ url: `${ROUTE}?good=1`, headers: { 'x-payment': header } });
		await handler(r1, s1);
		expect(s1.statusCode).toBe(200);

		// Same signed proof, different query string → payload hash differs → the
		// payment is being reused for a different good. Deny rather than serve.
		const { req: r2, res: s2 } = mockReqRes({ url: `${ROUTE}?good=2`, headers: { 'x-payment': header } });
		await handler(r2, s2);
		expect(s2.statusCode).toBe(409);
		expect(s2.getHeader('x-x402-idempotent')).toBe('conflict');
		expect(JSON.parse(s2.body).error).toBe('payment_identifier_conflict');
	});

	it('a transient settle failure does NOT cache, so the payer can retry the same payment', async () => {
		let handlerCalls = 0;
		const handler = makeEndpoint(async () => {
			handlerCalls += 1;
			return { ok: true, n: handlerCalls };
		});
		const header = paymentHeader();

		// First attempt: settle blips (facilitator 5xx).
		settlePayment.mockRejectedValueOnce(
			Object.assign(new Error('facilitator down'), { status: 502, code: 'settle_failed' }),
		);
		const { req: r1, res: s1 } = mockReqRes({ headers: { 'x-payment': header } });
		await handler(r1, s1);
		expect(s1.statusCode).toBe(502);

		// Retry the SAME payment: must not be treated as a replay (nothing was
		// cached because settle never succeeded). Handler + settle run again.
		const { req: r2, res: s2 } = mockReqRes({ headers: { 'x-payment': header } });
		await handler(r2, s2);
		expect(s2.statusCode).toBe(200);
		expect(s2.getHeader('x-x402-idempotent')).toBeUndefined();
		expect(handlerCalls).toBe(2);
	});
});
