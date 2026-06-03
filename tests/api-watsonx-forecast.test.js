// Unit tests for the Granite Time Series forecast client (api/_lib/watsonx.js).
// Both the IAM token exchange and the /ml/v1/time_series/forecast call are
// mocked through global.fetch, so these run with no network and no credentials.
// They pin the request contract the watsonx.ai TS API expects and the response
// parsing the Granite Oracle endpoint depends on.

import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
	watsonxConfig,
	watsonxForecast,
	TS_MODELS,
	DEFAULT_TS_MODEL,
	tsModelSpec,
} from '../api/_lib/watsonx.js';

const realFetch = global.fetch;
afterAll(() => {
	global.fetch = realFetch;
});

let forecastCall = null;

function makeSeries(n) {
	const timestamps = [];
	const values = [];
	const base = Date.UTC(2025, 0, 1) / 1000;
	for (let i = 0; i < n; i++) {
		timestamps.push(new Date((base + i * 300) * 1000).toISOString());
		values.push(100 + Math.sin(i / 10) * 5);
	}
	return { timestamps, values };
}

beforeEach(() => {
	process.env.WATSONX_API_KEY = 'test-key';
	process.env.WATSONX_PROJECT_ID = 'proj-123';
	delete process.env.WATSONX_SPACE_ID;
	forecastCall = null;
	global.fetch = vi.fn(async (url, opts) => {
		const u = String(url);
		if (u.includes('iam.cloud.ibm.com')) {
			return { ok: true, json: async () => ({ access_token: 'iam-tok', expires_in: 3600 }) };
		}
		if (u.includes('/ml/v1/time_series/forecast')) {
			forecastCall = { url: u, body: JSON.parse(opts.body) };
			const horizon = forecastCall.body.parameters.prediction_length;
			const date = [];
			const value = [];
			for (let i = 0; i < horizon; i++) {
				date.push(new Date(Date.UTC(2025, 0, 2) + i * 300_000).toISOString());
				value.push(120 + i);
			}
			return { ok: true, text: async () => JSON.stringify({ results: [{ date, value }] }) };
		}
		throw new Error(`unexpected fetch: ${u}`);
	});
});

const cfg = () => watsonxConfig();

describe('TS model registry', () => {
	it('exposes the three Granite TTM models and a default', () => {
		expect(TS_MODELS.map((m) => m.id)).toContain('ibm/granite-ttm-512-96-r2');
		expect(tsModelSpec(DEFAULT_TS_MODEL)).toMatchObject({ context: 512, horizon: 96 });
		expect(tsModelSpec('nope')).toBeNull();
	});
});

describe('watsonxForecast', () => {
	it('builds the documented request body and parses the forecast', async () => {
		const { timestamps, values } = makeSeries(512);
		const out = await watsonxForecast(cfg(), {
			timestamps,
			values,
			freq: '5min',
			predictionLength: 24,
		});

		// Response parsing
		expect(out.model).toBe('ibm/granite-ttm-512-96-r2');
		expect(out.horizon).toBe(24);
		expect(out.values).toHaveLength(24);
		expect(out.timestamps).toHaveLength(24);
		expect(out.values[0]).toBe(120);

		// Request contract
		expect(forecastCall.url).toContain('/ml/v1/time_series/forecast');
		expect(forecastCall.url).toContain('version=2025-02-11'); // TS-specific API version
		const b = forecastCall.body;
		expect(b.model_id).toBe('ibm/granite-ttm-512-96-r2');
		expect(b.project_id).toBe('proj-123'); // scope injected by watsonxPost
		expect(b.schema).toEqual({
			timestamp_column: 'date',
			target_columns: ['value'],
			freq: '5min',
		});
		expect(b.parameters.prediction_length).toBe(24);
		expect(b.data.date).toHaveLength(512);
		expect(b.data.value).toHaveLength(512);
	});

	it('sends only the most recent context window when given extra history', async () => {
		const { timestamps, values } = makeSeries(600);
		await watsonxForecast(cfg(), { timestamps, values, freq: '5min', predictionLength: 12 });
		expect(forecastCall.body.data.date).toHaveLength(512); // sliced to context
		expect(forecastCall.body.data.date[511]).toBe(timestamps[599]); // last point preserved
	});

	it('clamps prediction length to the model horizon (96)', async () => {
		const { timestamps, values } = makeSeries(512);
		const out = await watsonxForecast(cfg(), {
			timestamps,
			values,
			freq: '5min',
			predictionLength: 999,
		});
		expect(forecastCall.body.parameters.prediction_length).toBe(96);
		expect(out.horizon).toBe(96);
	});

	it('throws insufficient_data below the context length', async () => {
		const { timestamps, values } = makeSeries(100);
		await expect(
			watsonxForecast(cfg(), { timestamps, values, freq: '5min' }),
		).rejects.toMatchObject({ code: 'insufficient_data', need: 512 });
		expect(global.fetch).not.toHaveBeenCalled(); // fails before any network call
	});

	it('rejects mismatched array lengths and a missing freq', async () => {
		const { timestamps, values } = makeSeries(512);
		await expect(
			watsonxForecast(cfg(), { timestamps, values: values.slice(1), freq: '5min' }),
		).rejects.toThrow(/equal-length/);
		await expect(watsonxForecast(cfg(), { timestamps, values })).rejects.toThrow(
			/freq is required/,
		);
	});

	it('rejects an unknown model', async () => {
		const { timestamps, values } = makeSeries(512);
		await expect(
			watsonxForecast(cfg(), { timestamps, values, freq: '5min', model: 'ibm/not-a-model' }),
		).rejects.toThrow(/unsupported time series model/);
	});

	it('throws when watsonx returns an empty forecast', async () => {
		global.fetch = vi.fn(async (url) => {
			if (String(url).includes('iam.cloud.ibm.com'))
				return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) };
			return {
				ok: true,
				text: async () => JSON.stringify({ results: [{ date: [], value: [] }] }),
			};
		});
		const { timestamps, values } = makeSeries(512);
		await expect(watsonxForecast(cfg(), { timestamps, values, freq: '5min' })).rejects.toThrow(
			/empty forecast/,
		);
	});
});
