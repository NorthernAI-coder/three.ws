import { describe, it, expect } from 'vitest';

import { getSelfRegistry } from '../api/_lib/x402/autonomous-registry.js';

// A realistic /api/x402/analytics { report: 'x402_volume' } response — the shape
// produced from getPaymentStats (settled x402_audit_log payments).
const SAMPLE = {
	ok: true,
	report: 'x402_volume',
	period: '24h',
	generated_at: '2026-06-28T10:00:00Z',
	total_calls: 1284,
	total_usdc_paid: '12.840000',
	unique_payers: 37,
	total_failed: 6,
	avg_payment_usdc: '0.010000',
	endpoint_count: 4,
	by_endpoint: [
		{ route: '/api/x402/dance-tip', count: 612, volume: '0.612000' },
		{ route: '/api/x402/crypto-intel', count: 240, volume: '2.400000' },
		{ route: '/api/x402/model-check', count: 30, volume: '0.030000' },
		{ route: '/api/x402/did', count: 1, volume: '0.001000' },
	],
	by_network: [{ network: 'solana:mainnet', count: 1284 }],
	underused_endpoints: [
		{ route: '/api/x402/did', count: 1, volume: '0.001000' },
		{ route: '/api/x402/model-check', count: 30, volume: '0.030000' },
	],
};

describe('autonomous registry — analytics-x402-volume entry', () => {
	const entry = getSelfRegistry().find((e) => e.id === 'analytics-x402-volume');

	it('exists, enabled, POST, volume pipeline, 30-min cooldown', () => {
		expect(entry).toBeTruthy();
		expect(entry.enabled).toBe(true);
		expect(entry.method).toBe('POST');
		expect(entry.pipeline).toBe('volume');
		expect(entry.cooldown_s).toBe(1800);
		expect(entry.path).toBe('/api/x402/analytics');
		expect(entry.priority).toBeGreaterThanOrEqual(65);
		expect(entry.priority).toBeLessThanOrEqual(75);
	});

	it('requests the x402_volume report over a 24h window', () => {
		expect(entry.body).toEqual({ report: 'x402_volume', period: '24h' });
	});

	it('extractSignal lifts the headline volume metrics', () => {
		const sig = entry.extractSignal(SAMPLE);
		expect(sig.report).toBe('x402_volume');
		expect(sig.period).toBe('24h');
		expect(sig.total_calls).toBe(1284);
		expect(sig.total_usdc_paid).toBe('12.840000');
		expect(sig.unique_payers).toBe(37);
		expect(sig.total_failed).toBe(6);
		expect(sig.endpoint_count).toBe(4);
	});

	it('extractSignal surfaces the busiest + underused endpoints (actionable signal)', () => {
		const sig = entry.extractSignal(SAMPLE);
		expect(sig.top_endpoint).toBe('/api/x402/dance-tip');
		expect(sig.underused_endpoints).toEqual([
			'/api/x402/did',
			'/api/x402/model-check',
		]);
	});

	it('extractSignal never throws on an empty / failed-call payload', () => {
		const sig = entry.extractSignal({});
		expect(sig.total_calls).toBe(0);
		expect(sig.unique_payers).toBe(0);
		expect(sig.top_endpoint).toBeNull();
		expect(sig.underused_endpoints).toEqual([]);
	});
});
