import { describe, it, expect, vi, beforeEach } from 'vitest';
import BN from 'bn.js';

// ── Mocks ──────────────────────────────────────────────────────────────────
// amm-exit.js reaches the chain through api/_lib/pump.js (getAmmPoolState +
// getConnection) and @pump-fun/pump-swap-sdk. Mock both so the module's pure
// routing + pricing-shape logic is exercised without RPC. Resolved-module-id
// matching means the path here (relative to this test) intercepts the worker
// module's own '../../api/_lib/pump.js' import.

const mockGetAmmPoolState = vi.fn();
const mockSellBaseInput = vi.fn();
const mockSwapSolanaState = vi.fn();
const mockOfflineSellBaseInput = vi.fn();
const MOCK_POOL = '9WZDXbs5da3XuBTOBiGHqKkqFGC4j2HJvBQKzXAMsRg';

vi.mock('../api/_lib/pump.js', () => ({
	getAmmPoolState: (...a) => mockGetAmmPoolState(...a),
	getConnection: () => ({}),
}));

vi.mock('@pump-fun/pump-swap-sdk', () => ({
	sellBaseInput: (...a) => mockSellBaseInput(...a),
	PumpAmmSdk: class {
		sellBaseInput(...a) {
			return mockOfflineSellBaseInput(...a);
		}
	},
	OnlinePumpAmmSdk: class {
		swapSolanaState(...a) {
			return mockSwapSolanaState(...a);
		}
	},
}));

// Import AFTER mocks are registered.
const { isGraduated, quoteAmmSell, buildAmmSellInstructions } = await import(
	'../workers/agent-sniper/amm-exit.js'
);

const WSOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT = 'THREEsynthetic1111111111111111111111111111111';

function poolState({ quoteMint = WSOL, baseReserve = 1_000_000_000, quoteReserve = 1_000_000_000 } = {}) {
	return {
		poolKey: { toString: () => MOCK_POOL },
		pool: {
			quoteMint: { toString: () => quoteMint },
			baseMint: { toString: () => MINT },
			coinCreator: { toString: () => '11111111111111111111111111111111' },
			creator: { toString: () => '11111111111111111111111111111111' },
		},
		baseReserve: new BN(baseReserve),
		quoteReserve: new BN(quoteReserve),
		baseMintAccount: { decimals: 6 },
		globalConfig: { mock: true },
		feeConfig: null,
	};
}

function poolNotFound() {
	const e = new Error('pump.fun AMM pool not found for mint');
	e.status = 404;
	e.code = 'pool_not_found';
	return e;
}

describe('isGraduated — deterministic graduation detection', () => {
	beforeEach(() => {
		mockGetAmmPoolState.mockReset();
	});

	it('returns true when a canonical AMM pool exists', async () => {
		mockGetAmmPoolState.mockResolvedValueOnce(poolState());
		expect(await isGraduated({ network: 'mainnet', mint: MINT })).toBe(true);
	});

	it('returns false when no pool exists (still on the bonding curve)', async () => {
		mockGetAmmPoolState.mockRejectedValueOnce(poolNotFound());
		expect(await isGraduated({ network: 'mainnet', mint: MINT })).toBe(false);
	});

	it('rethrows a transient RPC error rather than reporting "not graduated"', async () => {
		mockGetAmmPoolState.mockRejectedValueOnce(
			Object.assign(new Error('rpc 502'), { code: 'pool_accounts_missing', status: 502 }),
		);
		await expect(isGraduated({ network: 'mainnet', mint: MINT })).rejects.toThrow('rpc 502');
	});
});

describe('quoteAmmSell — re-quote a graduated position off the AMM', () => {
	beforeEach(() => {
		mockGetAmmPoolState.mockReset();
		mockSellBaseInput.mockReset();
	});

	it('returns expected + min SOL out and the pool key', async () => {
		mockGetAmmPoolState.mockResolvedValueOnce(poolState());
		mockSellBaseInput.mockReturnValueOnce({
			uiQuote: new BN(9_800),
			minQuote: new BN(9_700),
		});

		const r = await quoteAmmSell({
			network: 'mainnet',
			mint: MINT,
			baseAmount: new BN(10_000),
			slippagePct: 5,
		});

		expect(r.expectedQuoteOut).toBe(9_800n);
		expect(r.minQuoteOut).toBe(9_700n);
		expect(r.poolKey).toBe(MOCK_POOL);
		expect(typeof r.priceImpactPct).toBe('number');
		expect(r.priceImpactPct).toBeGreaterThanOrEqual(0);
	});

	it('forwards the base amount, slippage, and live reserves to the SDK', async () => {
		mockGetAmmPoolState.mockResolvedValueOnce(poolState());
		mockSellBaseInput.mockReturnValueOnce({ uiQuote: new BN(50), minQuote: new BN(45) });

		await quoteAmmSell({ network: 'mainnet', mint: MINT, baseAmount: new BN(10_000), slippagePct: 5 });

		expect(mockSellBaseInput).toHaveBeenCalledOnce();
		const call = mockSellBaseInput.mock.calls[0][0];
		expect(call.base.toString()).toBe('10000');
		expect(call.slippage).toBe(5);
		expect(call.baseReserve.toString()).toBe('1000000000');
		expect(call.quoteReserve.toString()).toBe('1000000000');
		expect(call.globalConfig).toEqual({ mock: true });
	});

	it('computes a non-trivial price impact for a sale that moves the pool', async () => {
		// baseReserve=1e6, quoteReserve=1e6, sell 100_000 base, net 90_000 quote.
		// spot value = 100_000 * (1e6/1e6) = 100_000; impact = (100k-90k)/100k = 10%.
		mockGetAmmPoolState.mockResolvedValueOnce(
			poolState({ baseReserve: 1_000_000, quoteReserve: 1_000_000 }),
		);
		mockSellBaseInput.mockReturnValueOnce({ uiQuote: new BN(90_000), minQuote: new BN(85_000) });

		const r = await quoteAmmSell({
			network: 'mainnet',
			mint: MINT,
			baseAmount: new BN(100_000),
			slippagePct: 5,
		});
		expect(r.priceImpactPct).toBeCloseTo(10, 5);
	});

	it('propagates pool_not_found so callers know the coin is still on the curve', async () => {
		mockGetAmmPoolState.mockRejectedValueOnce(poolNotFound());
		await expect(
			quoteAmmSell({ network: 'mainnet', mint: MINT, baseAmount: new BN(1), slippagePct: 5 }),
		).rejects.toMatchObject({ code: 'pool_not_found' });
	});

	it('refuses a non-SOL-quoted pool (sniper PnL is lamports-denominated)', async () => {
		mockGetAmmPoolState.mockResolvedValueOnce(poolState({ quoteMint: USDC }));
		await expect(
			quoteAmmSell({ network: 'mainnet', mint: MINT, baseAmount: new BN(1), slippagePct: 5 }),
		).rejects.toMatchObject({ code: 'amm_quote_not_sol' });
	});
});

describe('buildAmmSellInstructions — build the on-chain AMM exit', () => {
	beforeEach(() => {
		mockGetAmmPoolState.mockReset();
		mockSellBaseInput.mockReset();
		mockSwapSolanaState.mockReset();
		mockOfflineSellBaseInput.mockReset();
	});

	it('builds instructions via swapSolanaState + offline sellBaseInput and surfaces the quote', async () => {
		mockGetAmmPoolState.mockResolvedValue(poolState());
		mockSellBaseInput.mockReturnValue({ uiQuote: new BN(9_800), minQuote: new BN(9_700) });
		mockSwapSolanaState.mockResolvedValueOnce({ pool: {} });
		const fakeIxs = [{ programId: 'ix1' }, { programId: 'ix2' }];
		mockOfflineSellBaseInput.mockResolvedValueOnce(fakeIxs);

		const r = await buildAmmSellInstructions({
			network: 'mainnet',
			mint: MINT,
			user: { toBase58: () => 'user' },
			baseAmount: new BN(10_000),
			slippagePct: 5,
		});

		expect(r.instructions).toBe(fakeIxs);
		expect(r.expectedQuoteOut).toBe(9_800n);
		expect(r.minQuoteOut).toBe(9_700n);
		expect(r.poolKey).toBe(MOCK_POOL);
		expect(mockOfflineSellBaseInput).toHaveBeenCalledOnce();
		const offCall = mockOfflineSellBaseInput.mock.calls[0];
		expect(offCall[1].toString()).toBe('10000');
		expect(offCall[2]).toBe(5);
	});

	it('propagates pool_not_found (cannot build against a curve that has not graduated)', async () => {
		mockGetAmmPoolState.mockRejectedValueOnce(poolNotFound());
		await expect(
			buildAmmSellInstructions({
				network: 'mainnet',
				mint: MINT,
				user: { toBase58: () => 'user' },
				baseAmount: new BN(1),
				slippagePct: 5,
			}),
		).rejects.toMatchObject({ code: 'pool_not_found' });
	});
});
