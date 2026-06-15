// Unit tests for the shared coin-status formatters. These are the formatting
// primitives copied from the three pre-refactor implementations; locking them
// down here keeps all three surfaces rendering identically.

import { describe, it, expect } from 'vitest';
import { formatMcap, formatPrice, formatPct } from './coin-status-card.js';

describe('formatMcap', () => {
	it('renders billions, millions, and thousands compactly', () => {
		expect(formatMcap(2_400_000_000)).toBe('$2.40B');
		expect(formatMcap(1_200_000)).toBe('$1.20M');
		expect(formatMcap(340_000)).toBe('$340.0K');
	});

	it('renders sub-thousand values as whole dollars', () => {
		expect(formatMcap(420)).toBe('$420');
		expect(formatMcap(0)).toBe('$0');
	});

	it('returns an em dash for non-finite input', () => {
		expect(formatMcap(NaN)).toBe('—');
		expect(formatMcap(Infinity)).toBe('—');
		expect(formatMcap(undefined)).toBe('—');
	});
});

describe('formatPct', () => {
	it('rounds to whole numbers at or above 10%', () => {
		expect(formatPct(34)).toBe('34%');
		expect(formatPct(100)).toBe('100%');
	});

	it('keeps one decimal below 10% (but not at zero)', () => {
		expect(formatPct(7.5)).toBe('7.5%');
		expect(formatPct(0)).toBe('0%');
	});

	it('clamps out-of-range input to 0–100', () => {
		expect(formatPct(-5)).toBe('0%');
		expect(formatPct(140)).toBe('100%');
	});

	it('returns an em dash for non-finite input', () => {
		expect(formatPct(NaN)).toBe('—');
	});
});

describe('formatPrice', () => {
	it('shows small per-token prices with two significant figures', () => {
		expect(formatPrice(0.00012)).toBe('$0.00012');
	});

	it('formats whole-dollar prices to cents', () => {
		expect(formatPrice(1.2)).toBe('$1.20');
	});

	it('rejects zero and non-finite input', () => {
		expect(formatPrice(0)).toBe('—');
		expect(formatPrice(NaN)).toBe('—');
	});
});
