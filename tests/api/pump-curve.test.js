// Handler tests for /api/pump/curve and /api/pump/quote-sdk. The sdk-bridge
// helpers are mocked at module-boundary so the test runs purely against the
// validation + response layer — no real RPC traffic.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api/_lib/solana/sdk-bridge.js', () => ({
	getBondingCurveState: vi.fn(),
	getTokenPrice: vi.fn(),
	getGraduationProgress: vi.fn(),
	getBuyQuote: vi.fn(),
	getSellQuote: vi.fn(),
}));

vi.mock('../../api/_lib/solana/rpc-fallback.js', () => ({
	rpcFallbackFromEnv: vi.fn(() => ({
		withFallback: async (fn) => fn({}),
	})),
	createRpcFallback: vi.fn(),
	deriveWsUrl: vi.fn(),
	RpcFallback: class {},
}));

vi.mock('../../api/_lib/zauth.js', () => ({
	instrument: () => {},
	drain: async () => {},
}));

vi.mock('../../api/_lib/sentry.js', () => ({
	captureException: () => {},
}));

import {
	getBondingCurveState, getTokenPrice, getGraduationProgress,
	getBuyQuote, getSellQuote,
} from '../../api/_lib/solana/sdk-bridge.js';

import curveHandler from '../../api/pump/curve.js';
import quoteSdkHandler from '../../api/pump/quote-sdk.js';

const VALID_MINT = 'So11111111111111111111111111111111111111112';
// A pump.fun mint (vanity-ground to end in "pump") — required to pass curve.js's
// non-pump short-circuit and reach the (mocked) RPC layer. Uses the $THREE mint.
const CURVE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

function makeReq({ url = '/', method = 'GET', headers = {} } = {}) {
	return { url, method, headers };
}
function makeRes() {
	const res = {
		statusCode: 200,
		_headers: {},
		_body: null,
		setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
		getHeader(k) { return this._headers[k.toLowerCase()]; },
		end(body) { this._body = body; },
	};
	return res;
}
function getJson(res) { return JSON.parse(res._body); }

describe('GET /api/pump/curve', () => {
	beforeEach(() => { vi.clearAllMocks(); });
	afterEach(() => { vi.restoreAllMocks(); });

	// Stub the Jupiter price fallback the handler reaches for when a curve is
	// absent. usd == null => Jupiter has no price (dead/never-launched mint);
	// a number => a graduated coin still trading on a DEX.
	function stubJupiter(usd) {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => (usd == null ? {} : { [CURVE_MINT]: { usdPrice: usd } }),
		});
	}

	it('400 when mint missing', async () => {
		const res = makeRes();
		await curveHandler(makeReq({ url: '/api/pump/curve' }), res);
		expect(res.statusCode).toBe(400);
		expect(getJson(res).error).toBe('bad_mint');
	});

	it('400 when mint not base58', async () => {
		const res = makeRes();
		await curveHandler(makeReq({ url: '/api/pump/curve?mint=NOT_VALID!!!' }), res);
		expect(res.statusCode).toBe(400);
	});

	it('404 not_a_pump_mint for a non-pump mint, without touching RPC', async () => {
		const res = makeRes();
		await curveHandler(makeReq({ url: `/api/pump/curve?mint=${VALID_MINT}` }), res);
		expect(res.statusCode).toBe(404);
		expect(getJson(res).error).toBe('not_a_pump_mint');
		// Short-circuit must happen before any bonding-curve RPC read.
		expect(getBondingCurveState).not.toHaveBeenCalled();
		// Negative-cacheable so repeat probes are served from the edge.
		expect(res.getHeader('cache-control')).toMatch(/s-maxage=300/);
	});

	it('404 when no bonding curve and no DEX price (dead/never-launched mint)', async () => {
		getBondingCurveState.mockResolvedValueOnce(null);
		getTokenPrice.mockResolvedValueOnce(null);
		getGraduationProgress.mockResolvedValueOnce(null);
		stubJupiter(null); // Jupiter has nothing either
		const res = makeRes();
		await curveHandler(makeReq({ url: `/api/pump/curve?mint=${CURVE_MINT}` }), res);
		expect(res.statusCode).toBe(404);
		expect(getJson(res).error).toBe('no_curve');
	});

	it('200 graduated view when the curve is gone but a DEX price exists', async () => {
		// Graduated coin: the on-chain curve account is closed, but the token still
		// trades on its AMM — surface the live price instead of a dead 404.
		getBondingCurveState.mockResolvedValueOnce(null);
		getTokenPrice.mockResolvedValueOnce(null);
		getGraduationProgress.mockResolvedValueOnce(null);
		stubJupiter(0.0033878);
		const res = makeRes();
		await curveHandler(makeReq({ url: `/api/pump/curve?mint=${CURVE_MINT}` }), res);
		expect(res.statusCode).toBe(200);
		const body = getJson(res);
		expect(body.curve).toBeNull();
		expect(body.graduated).toBe(true);
		expect(body.graduation.isGraduated).toBe(true);
		expect(body.graduation.progressBps).toBe(10_000);
		expect(body.graduatedPrice.priceUsd).toBe(0.0033878);
		// Fixed 1B supply => market cap == FDV.
		expect(body.graduatedPrice.marketCapUsd).toBeCloseTo(0.0033878 * 1_000_000_000, 3);
	});

	it('200 with curve, price, graduation', async () => {
		getBondingCurveState.mockResolvedValueOnce({
			virtualSolReserves: '1', virtualTokenReserves: '2',
			realSolReserves: '3', realTokenReserves: '4',
			tokenTotalSupply: '5', complete: false,
			creator: 'CRE', isMayhemMode: false,
		});
		getTokenPrice.mockResolvedValueOnce({ priceSol: '0.0001', marketCapSol: '1000' });
		getGraduationProgress.mockResolvedValueOnce({ progressBps: 4500 });
		const res = makeRes();
		await curveHandler(makeReq({ url: `/api/pump/curve?mint=${CURVE_MINT}` }), res);
		expect(res.statusCode).toBe(200);
		const body = getJson(res);
		expect(body.mint).toBe(CURVE_MINT);
		expect(body.curve.creator).toBe('CRE');
		expect(body.price.priceSol).toBe('0.0001');
		expect(body.graduation.progressBps).toBe(4500);
		expect(res.getHeader('cache-control')).toMatch(/s-maxage=10/);
	});

	it('honors network=devnet', async () => {
		getBondingCurveState.mockResolvedValueOnce({ creator: 'X' });
		getTokenPrice.mockResolvedValueOnce(null);
		getGraduationProgress.mockResolvedValueOnce(null);
		const res = makeRes();
		await curveHandler(makeReq({ url: `/api/pump/curve?mint=${CURVE_MINT}&network=devnet` }), res);
		expect(getJson(res).network).toBe('devnet');
	});
});

describe('GET /api/pump/quote-sdk', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('400 when mint invalid', async () => {
		const res = makeRes();
		await quoteSdkHandler(makeReq({ url: '/api/pump/quote-sdk?side=buy&amount=1' }), res);
		expect(res.statusCode).toBe(400);
		expect(getJson(res).error).toBe('bad_mint');
	});

	it('400 when side invalid', async () => {
		const res = makeRes();
		await quoteSdkHandler(makeReq({ url: `/api/pump/quote-sdk?mint=${VALID_MINT}&side=foo&amount=1` }), res);
		expect(res.statusCode).toBe(400);
		expect(getJson(res).error).toBe('bad_side');
	});

	it('400 when amount missing or non-positive', async () => {
		const res = makeRes();
		await quoteSdkHandler(makeReq({ url: `/api/pump/quote-sdk?mint=${VALID_MINT}&side=buy&amount=0` }), res);
		expect(res.statusCode).toBe(400);
		expect(getJson(res).error).toBe('bad_amount');
	});

	it('404 when bonding curve missing', async () => {
		getBuyQuote.mockResolvedValueOnce(null);
		getTokenPrice.mockResolvedValueOnce(null);
		const res = makeRes();
		await quoteSdkHandler(makeReq({ url: `/api/pump/quote-sdk?mint=${VALID_MINT}&side=buy&amount=1` }), res);
		expect(res.statusCode).toBe(404);
	});

	it('200 buy returns tokens out + impact + market context', async () => {
		getBuyQuote.mockResolvedValueOnce({ tokens: { toString: () => '123456789' }, priceImpact: 1.25 });
		getTokenPrice.mockResolvedValueOnce({ priceSol: '0.0002', marketCapSol: '500' });
		const res = makeRes();
		await quoteSdkHandler(makeReq({ url: `/api/pump/quote-sdk?mint=${VALID_MINT}&side=buy&amount=0.5` }), res);
		expect(res.statusCode).toBe(200);
		const body = getJson(res);
		expect(body.side).toBe('buy');
		expect(body.input.sol).toBe(0.5);
		expect(body.input.lamports).toBe('500000000');
		expect(body.output.tokens).toBe('123456789');
		expect(body.output.tokensUi).toBeCloseTo(123.456789, 5);
		expect(body.priceImpactPct).toBe(1.25);
		expect(body.marketContext.priceSol).toBe('0.0002');
	});

	it('200 sell returns sol out + impact', async () => {
		getSellQuote.mockResolvedValueOnce({ sol: { toString: () => '750000000' }, priceImpact: 0.5 });
		getTokenPrice.mockResolvedValueOnce(null);
		const res = makeRes();
		await quoteSdkHandler(makeReq({ url: `/api/pump/quote-sdk?mint=${VALID_MINT}&side=sell&amount=100` }), res);
		expect(res.statusCode).toBe(200);
		const body = getJson(res);
		expect(body.side).toBe('sell');
		expect(body.input.tokens).toBe(100);
		expect(body.input.baseUnits).toBe('100000000');
		expect(body.output.sol).toBe(0.75);
		expect(body.output.lamports).toBe('750000000');
		expect(body.priceImpactPct).toBe(0.5);
	});
});
