import { describe, it, expect } from 'vitest';
import { decideLadderedExit, moonbagFraction, ladderMultiple } from '../workers/agent-sniper/exit-logic.js';
import { mayhemVerdict } from '../workers/agent-sniper/mayhem-gate.js';

// The owner's rule, pinned in math:
//  - buy, and when up ~2x sell enough to recover the INITIAL cost basis;
//  - NEVER cut 100% of a position on the way up (always keep a moon bag);
//  - hold the rest, protected by the trailing stop; stop-loss still wins.

const ENTRY = 1_000_000_000; // 1 SOL cost basis (lamports)
const base = (over = {}) => ({
	entry_quote_lamports: String(ENTRY),
	stop_loss_pct: 30,
	trailing_stop_pct: 20,
	take_profit_pct: null,
	max_hold_seconds: null,
	opened_at: new Date('2026-07-03T00:00:00Z').toISOString(),
	initials_out_multiple: 2,
	moonbag_min_pct: 15,
	initials_recovered: false,
	...over,
});
const NOW = new Date('2026-07-03T00:10:00Z').getTime();

describe('ladder helpers', () => {
	it('ladderMultiple requires > 1, else null (ladder off)', () => {
		expect(ladderMultiple(2)).toBe(2);
		expect(ladderMultiple(1)).toBe(null);
		expect(ladderMultiple(null)).toBe(null);
		expect(ladderMultiple('')).toBe(null);
	});
	it('moonbagFraction defaults 15% and clamps to [0, 0.95]', () => {
		expect(moonbagFraction(null)).toBeCloseTo(0.15);
		expect(moonbagFraction(15)).toBeCloseTo(0.15);
		expect(moonbagFraction(200)).toBe(0.95);
		expect(moonbagFraction(-5)).toBe(0);
	});
});

describe('take-initials ladder', () => {
	it('does NOT take profit before the initials band (holds under 2x)', () => {
		expect(decideLadderedExit(base(), 1.8 * ENTRY, 1.8 * ENTRY, NOW)).toBe(null);
	});

	it('at 2x sells exactly the cost basis back (half) and keeps a moon bag', () => {
		const d = decideLadderedExit(base(), 2 * ENTRY, 2 * ENTRY, NOW);
		expect(d.reason).toBe('take_initials');
		expect(d.recoversInitials).toBe(true);
		expect(d.sellFraction).toBeCloseTo(0.5); // entry/value = 1/2
		expect(d.sellFraction).toBeLessThan(1); // NEVER a full exit on the way up
	});

	it('at 5x sells only ~20% (keeps 80% moon bag)', () => {
		const d = decideLadderedExit(base(), 5 * ENTRY, 5 * ENTRY, NOW);
		expect(d.reason).toBe('take_initials');
		expect(d.sellFraction).toBeCloseTo(0.2);
	});

	it('never sells into the moon-bag floor even at a huge multiple', () => {
		// A 1.05x band with a 90% moonbag: recover-fraction would be ~0.95, but the
		// floor caps the sell at 1 - 0.90 = 0.10.
		const d = decideLadderedExit(base({ initials_out_multiple: 1.05, moonbag_min_pct: 90 }), 1.05 * ENTRY, 1.05 * ENTRY, NOW);
		expect(d.reason).toBe('take_initials');
		expect(d.sellFraction).toBeCloseTo(0.1);
	});

	it('fires the ladder only once (recovered → no second take-initials)', () => {
		const d = decideLadderedExit(base({ initials_recovered: true }), 3 * ENTRY, 3 * ENTRY, NOW);
		expect(d).toBe(null); // moon bag rides; no take_profit set, trailing not hit
	});
});

describe('protective exits are always FULL and stop-loss wins', () => {
	it('stop-loss fires a full exit before initials', () => {
		const d = decideLadderedExit(base(), 0.6 * ENTRY, 1 * ENTRY, NOW);
		expect(d.reason).toBe('stop_loss');
		expect(d.sellFraction).toBe(1);
	});

	it('stop-loss beats a simultaneous initials band (stop-loss precedence)', () => {
		// Contrived: value both ≤ stop and ≥ 2x is impossible; assert stop wins when
		// price collapsed below stop even though initials were configured.
		const d = decideLadderedExit(base(), 0.5 * ENTRY, 2.5 * ENTRY, NOW);
		expect(d.reason).toBe('stop_loss');
	});

	it('trailing stop fully exits the moon bag after initials recovered', () => {
		// Recovered; peak 4x, now down 20%+ from peak → trailing.
		const d = decideLadderedExit(base({ initials_recovered: true }), 3.1 * ENTRY, 4 * ENTRY, NOW);
		expect(d.reason).toBe('trailing_stop');
		expect(d.sellFraction).toBe(1);
	});

	it('timeout fully exits the remainder', () => {
		const d = decideLadderedExit(
			base({ initials_recovered: true, max_hold_seconds: 60 }),
			1.5 * ENTRY, 1.6 * ENTRY,
			new Date('2026-07-03T02:00:00Z').getTime(),
		);
		expect(d.reason).toBe('timeout');
		expect(d.sellFraction).toBe(1);
	});
});

describe('ladder off = classic behavior (non-breaking)', () => {
	it('with no initials_out_multiple, take_profit is a normal full exit', () => {
		const d = decideLadderedExit(
			base({ initials_out_multiple: null, take_profit_pct: 80 }),
			2 * ENTRY, 2 * ENTRY, NOW,
		);
		expect(d.reason).toBe('take_profit');
		expect(d.sellFraction).toBe(1);
	});
});

describe('mayhem verdict (owner rule)', () => {
	it('excludes a mayhem mint', () => {
		expect(mayhemVerdict(true)).toEqual({ pass: false, reason: 'mayhem_excluded' });
	});
	it('allows a regular mint', () => {
		expect(mayhemVerdict(false)).toEqual({ pass: true });
	});
	it('allows on unknown by default, skips on strict', () => {
		expect(mayhemVerdict(null).pass).toBe(true);
		expect(mayhemVerdict(null, { strict: true })).toEqual({ pass: false, reason: 'mayhem_unknown', unknown: true });
	});
});
