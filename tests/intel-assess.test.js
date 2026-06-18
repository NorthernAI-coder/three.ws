// Unit tests for the $THREE Intel signal-assessment core — the transparent,
// deterministic model that turns raw on-chain signals into a risk/organic read.
import { describe, it, expect } from 'vitest';
import { assessCoin } from '../api/_lib/intel/assess.js';

describe('assessCoin', () => {
	it('flags a clearly adversarial launch as high risk', () => {
		const a = assessCoin({
			quality_score: 20,
			bundle_score: 0.9,
			organic_score: 0.1,
			snipe_ratio: 0.8,
			concentration_top10: 0.85,
			fresh_wallet_ratio: 0.9,
			risk_flags: ['bundle_launch', 'sniper_cluster'],
			dev_sold: true,
		});
		expect(a.verdict).toBe('high_risk');
		expect(a.risk).toBeGreaterThanOrEqual(70);
		expect(a.reasons.some((r) => /bundle/i.test(r))).toBe(true);
		expect(a.reasons.some((r) => /dev wallet/i.test(r))).toBe(true);
	});

	it('reads a clean, demand-driven launch as organic', () => {
		const a = assessCoin({
			quality_score: 85,
			bundle_score: 0.05,
			organic_score: 0.8,
			snipe_ratio: 0.05,
			concentration_top10: 0.15,
			fresh_wallet_ratio: 0.1,
			risk_flags: [],
			unique_buyers: 60,
			buy_count: 120,
			sell_count: 20,
		});
		expect(a.verdict).toBe('organic');
		expect(a.organic).toBeGreaterThanOrEqual(55);
		expect(a.risk).toBeLessThan(45);
	});

	it('accepts both 0–1 ratios and 0–100 scores (normalization)', () => {
		const ratio = assessCoin({ bundle_score: 0.6, concentration_top10: 0.6 });
		const score = assessCoin({ bundle_score: 60, concentration_top10: 60 });
		expect(ratio.risk).toBe(score.risk);
	});

	it('never throws and clamps scores to 0–100 on empty/garbage input', () => {
		for (const input of [undefined, {}, { bundle_score: 9999, risk_flags: 'nope' }]) {
			const a = assessCoin(input);
			expect(a.risk).toBeGreaterThanOrEqual(0);
			expect(a.risk).toBeLessThanOrEqual(100);
			expect(a.organic).toBeGreaterThanOrEqual(0);
			expect(a.organic).toBeLessThanOrEqual(100);
			expect(['organic', 'mixed', 'caution', 'high_risk']).toContain(a.verdict);
			expect(Array.isArray(a.reasons)).toBe(true);
			expect(a.reasons.length).toBeGreaterThan(0);
		}
	});

	it('always returns a non-empty, holder-readable reason list', () => {
		const a = assessCoin({ quality_score: 50, organic_score: 0.5, bundle_score: 0.2 });
		expect(a.reasons.every((r) => typeof r === 'string' && r.length > 0)).toBe(true);
	});
});
