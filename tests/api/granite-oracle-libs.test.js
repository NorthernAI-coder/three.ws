// Unit tests for the Granite Oracle's data + IBM libs, with a URL-routing fetch
// mock so no network is touched: GeckoTerminal OHLCV parsing/sorting, and the
// watsonx Granite TimeSeries forecast + Guardian request shaping & response
// parsing.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// watsonx-forecast.js imports watsonxToken from watsonx.js — stub it.
vi.mock('../../api/_lib/watsonx.js', () => ({ watsonxToken: vi.fn(async () => 'tok') }));

import {
	fetchOhlcv,
	trendingPools,
	topPoolForToken,
	freqFor,
} from '../../api/_lib/market/ohlcv.js';
import {
	watsonxForecast,
	watsonxGuardian,
	forecastModelFor,
	FORECAST_MODELS,
} from '../../api/_lib/watsonx-forecast.js';

function mres(obj, ok = true, status = 200) {
	return { ok, status, text: async () => JSON.stringify(obj) };
}

let lastBody;
beforeEach(() => {
	lastBody = null;
	global.fetch = vi.fn(async (url, init) => {
		if (init?.body) {
			try {
				lastBody = JSON.parse(init.body);
			} catch {
				lastBody = init.body;
			}
		}
		if (url.includes('/trending_pools'))
			return mres({
				data: [
					{
						id: 'solana_POOLX',
						attributes: {
							name: 'A / SOL',
							address: 'POOLX',
							base_token_price_usd: '1.5',
							price_change_percentage: { h24: '3.2' },
						},
						relationships: { base_token: { data: { id: 'solana_MINTX' } } },
					},
				],
			});
		if (url.includes('/tokens/') && url.includes('/pools'))
			return mres({ data: [{ id: 'solana_TOPPOOL', attributes: { address: 'TOPPOOL' } }] });
		if (url.includes('/ohlcv/'))
			return mres({
				data: {
					attributes: {
						ohlcv_list: [
							[200, 2, 2, 2, 2, 5],
							[100, 1, 1, 1, 1, 9],
							[150, 0, 0, 0, 0, 0], // c=0 → filtered out
						],
					},
				},
				meta: {
					base: { name: 'Base', symbol: 'BSY', address: 'a' },
					quote: { name: 'Sol', symbol: 'SOL', address: 'q' },
				},
			});
		if (url.includes('/time_series/forecast'))
			return mres({
				model_id: 'ibm/granite-ttm-512-96-r2',
				results: [
					{ date: ['2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z'], price: [10, 11] },
				],
			});
		if (url.includes('/text/chat')) return mres({ choices: [{ message: { content: 'No' } }] });
		return mres({}, false, 404);
	});
});

describe('GeckoTerminal OHLCV lib', () => {
	it('maps freq strings', () => {
		expect(freqFor('hour', 1)).toBe('1h');
		expect(freqFor('minute', 15)).toBe('15min');
		expect(freqFor('day', 1)).toBe('1D');
	});

	it('parses, filters and sorts candles oldest→newest', async () => {
		const { candles, base, quote, freq } = await fetchOhlcv({ pool: 'P1' });
		expect(candles).toHaveLength(2); // the zero-price row is dropped
		expect(candles[0].t).toBe(100);
		expect(candles[1].t).toBe(200);
		expect(base.symbol).toBe('BSY');
		expect(quote.symbol).toBe('SOL');
		expect(freq).toBe('1h');
	});

	it('normalises trending pools', async () => {
		const pools = await trendingPools('solana', 8);
		expect(pools[0]).toMatchObject({
			pool: 'POOLX',
			name: 'A / SOL',
			baseMint: 'MINTX',
			priceUsd: 1.5,
			change24h: 3.2,
		});
	});

	it('resolves a token to its top pool', async () => {
		expect(await topPoolForToken('MINTX')).toBe('TOPPOOL');
	});
});

describe('watsonx Granite TimeSeries + Guardian', () => {
	const cfg = {
		url: 'https://wx',
		projectId: 'proj',
		tsApiVersion: '2025-02-11',
		apiVersion: '2024-05-31',
	};

	it('picks the right model for the history length', () => {
		expect(forecastModelFor(300)).toBe(FORECAST_MODELS[512]);
		expect(forecastModelFor(512)).toBe(FORECAST_MODELS[512]);
		expect(forecastModelFor(1024)).toBe(FORECAST_MODELS[1024]);
		expect(forecastModelFor(2000)).toBe(FORECAST_MODELS[1536]);
	});

	it('rejects mismatched / empty series', async () => {
		await expect(
			watsonxForecast(cfg, { timestamps: ['a', 'b'], values: [1], freq: '1h' }),
		).rejects.toThrow();
		await expect(
			watsonxForecast(cfg, { timestamps: [], values: [], freq: '1h' }),
		).rejects.toThrow();
	});

	it('shapes the forecast request and parses the result', async () => {
		const r = await watsonxForecast(cfg, {
			timestamps: ['2025-01-01T00:00:00Z', '2025-01-01T01:00:00Z'],
			values: [1, 2],
			freq: '1h',
			targetColumn: 'price',
		});
		const url = global.fetch.mock.calls[0][0];
		expect(url).toContain('/ml/v1/time_series/forecast?version=2025-02-11');
		expect(lastBody.project_id).toBe('proj');
		expect(lastBody.schema).toMatchObject({
			timestamp_column: 'date',
			freq: '1h',
			target_columns: ['price'],
		});
		expect(lastBody.data.price).toEqual([1, 2]);
		expect(r.values).toEqual([10, 11]);
		expect(r.timestamps).toHaveLength(2);
		expect(r.inputWindow).toBe(2);
	});

	it('runs a Guardian check and parses the Yes/No verdict', async () => {
		const g = await watsonxGuardian(cfg, { text: 'all good', risk: 'harm' });
		expect(g.flagged).toBe(false);
		expect(g.label).toBe('no');
		expect(g.risk).toBe('harm');
	});
});
