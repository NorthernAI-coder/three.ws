// Handler tests for GET /api/three-token/leaderboard. Helius holder data and
// market data are mocked at the module boundary, so these exercise the ranking,
// pagination, percentage math, and the empty-board degrade — no real RPC.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/coin/holders.js', () => ({ fetchHolderBalances: vi.fn() }));
vi.mock('../../api/_lib/market/token-market.js', () => ({ fetchTokenMarketData: vi.fn() }));
vi.mock('../../api/_lib/token/config.js', () => ({
	TOKEN_MINT: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump',
}));
vi.mock('../../api/_lib/zauth.js', () => ({ instrument: () => {}, drain: async () => {} }));
vi.mock('../../api/_lib/sentry.js', () => ({ captureException: () => {} }));

import { fetchHolderBalances } from '../../api/_lib/coin/holders.js';
import { fetchTokenMarketData } from '../../api/_lib/market/token-market.js';
import handler from '../../api/three-token/[action].js';

function makeReq({ url, method = 'GET', headers = {} } = {}) {
	return { url, method, headers };
}
function makeRes() {
	return {
		statusCode: 200,
		_headers: {},
		_body: null,
		setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
		getHeader(k) { return this._headers[k.toLowerCase()]; },
		end(body) { this._body = body; },
	};
}
const getJson = (res) => JSON.parse(res._body);

// decimals:0 keeps the atomic→display math trivial (amount === atomic units).
function market({ supply = 1000, decimals = 0 } = {}) {
	return { supply, decimals, price_usd: 2 };
}

describe('GET /api/three-token/leaderboard', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('ranks holders descending with rank, short wallet, and % of supply', async () => {
		fetchHolderBalances.mockResolvedValueOnce(new Map([
			['walletA', 300n],
			['walletB', 100n],
			['walletC', 200n],
		]));
		fetchTokenMarketData.mockResolvedValueOnce(market());
		const res = makeRes();
		await handler(makeReq({ url: '/api/three-token/leaderboard' }), res);

		expect(res.statusCode).toBe(200);
		const body = getJson(res);
		expect(body.total).toBe(3);
		expect(body.holders.map((h) => h.wallet)).toEqual(['walletA', 'walletC', 'walletB']);
		expect(body.holders[0]).toMatchObject({ rank: 1, amount: 300, pct_of_supply: 0.3 });
		expect(body.holders[2]).toMatchObject({ rank: 3, amount: 100, pct_of_supply: 0.1 });
		expect(body.holders[0].wallet_short).toBeTruthy();
		expect(res.getHeader('cache-control')).toMatch(/s-maxage=60/);
	});

	it('paginates with limit + offset and keeps absolute ranks', async () => {
		fetchHolderBalances.mockResolvedValueOnce(new Map([
			['walletA', 300n],
			['walletB', 100n],
			['walletC', 200n],
		]));
		fetchTokenMarketData.mockResolvedValueOnce(market());
		const res = makeRes();
		await handler(makeReq({ url: '/api/three-token/leaderboard?limit=2&offset=1' }), res);

		const body = getJson(res);
		expect(body.total).toBe(3);
		expect(body.holders).toHaveLength(2);
		expect(body.holders.map((h) => h.rank)).toEqual([2, 3]); // ranks stay absolute
		expect(body.holders.map((h) => h.wallet)).toEqual(['walletC', 'walletB']);
	});

	it('excludes zero-balance wallets', async () => {
		fetchHolderBalances.mockResolvedValueOnce(new Map([
			['walletA', 300n],
			['walletZero', 0n],
		]));
		fetchTokenMarketData.mockResolvedValueOnce(market());
		const res = makeRes();
		await handler(makeReq({ url: '/api/three-token/leaderboard' }), res);
		const body = getJson(res);
		expect(body.total).toBe(1);
		expect(body.holders.map((h) => h.wallet)).toEqual(['walletA']);
	});

	it('nulls percentages when market supply is unavailable', async () => {
		fetchHolderBalances.mockResolvedValueOnce(new Map([['walletA', 300n]]));
		fetchTokenMarketData.mockResolvedValueOnce(null);
		const res = makeRes();
		await handler(makeReq({ url: '/api/three-token/leaderboard' }), res);
		const body = getJson(res);
		expect(body.holders[0].pct_of_supply).toBeNull();
	});

	it('degrades to an empty board (200, not 500) when Helius fails', async () => {
		fetchHolderBalances.mockRejectedValueOnce(new Error('helius unconfigured'));
		const res = makeRes();
		await handler(makeReq({ url: '/api/three-token/leaderboard' }), res);
		expect(res.statusCode).toBe(200);
		const body = getJson(res);
		expect(body.holders).toEqual([]);
		expect(body.total).toBe(0);
	});
});
