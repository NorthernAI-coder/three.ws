import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
	ringTickConfig,
	planTick,
	minUsdcForTick,
	dailyRemaining,
	tickBudget,
	assessBackpressure,
	gateOnRingConfig,
} from '../api/_lib/x402/ring-tick-plan.js';
import { CHEAP_ENDPOINTS, RING_SETTLE_ENDPOINT } from '../api/_lib/x402/pipelines/volume-shared.js';
import { warnCapExceeded } from '../api/_lib/x402/pay.js';
import { validateRingConfig } from '../api/_lib/x402/ring-config.js';

// ── Cadence: weighted rotation ─────────────────────────────────────────────────
describe('ring-tick planTick — cadence', () => {
	const CHEAP = CHEAP_ENDPOINTS.length; // 11 in the stock catalog

	// Reproduce the cron's Redis reservation in memory: each tick reserves
	// cheapNeeded indices, advancing a shared cursor.
	function simulate(ticks, { calls = 3, settleEveryN = 5 } = {}) {
		let cursor = 0;
		const out = [];
		for (let seq = 1; seq <= ticks; seq++) {
			const isSettle = settleEveryN > 0 && seq % settleEveryN === 0;
			const cheapNeeded = Math.max(0, calls - (isSettle ? 1 : 0));
			const cheapStart = cursor;
			cursor += cheapNeeded;
			const plan = planTick({ tickSeq: seq, calls, settleEveryN, cheapCount: CHEAP, cheapStart });
			out.push({ seq, ...plan });
		}
		return out;
	}

	it('fires ring-settle on exactly every Nth tick', () => {
		const plans = simulate(20, { settleEveryN: 5 });
		const settleTicks = plans.filter((p) => p.isSettleTick).map((p) => p.seq);
		expect(settleTicks).toEqual([5, 10, 15, 20]);
	});

	it('cheap tips dominate the per-minute count', () => {
		const plans = simulate(10, { calls: 3, settleEveryN: 5 });
		const totalCalls = plans.reduce((n, p) => n + p.cheapIndices.length + (p.isSettleTick ? 1 : 0), 0);
		const settleCalls = plans.filter((p) => p.isSettleTick).length;
		const cheapCalls = totalCalls - settleCalls;
		expect(totalCalls).toBe(30); // 10 ticks × 3 calls
		expect(settleCalls).toBe(2); // ticks 5 and 10
		expect(cheapCalls).toBe(28); // the overwhelming majority
	});

	it('every cheap index is within the catalog and rotates for variety', () => {
		const plans = simulate(12, { calls: 3, settleEveryN: 5 });
		const all = plans.flatMap((p) => p.cheapIndices);
		for (const i of all) {
			expect(Number.isInteger(i)).toBe(true);
			expect(i).toBeGreaterThanOrEqual(0);
			expect(i).toBeLessThan(CHEAP);
		}
		expect(new Set(all).size).toBeGreaterThan(1);
	});

	it('a non-settle tick pays only cheap endpoints', () => {
		const plan = planTick({ tickSeq: 1, calls: 3, settleEveryN: 5, cheapCount: CHEAP, cheapStart: 0 });
		expect(plan.isSettleTick).toBe(false);
		expect(plan.cheapIndices).toHaveLength(3);
	});

	it('a settle tick reserves one slot for ring-settle', () => {
		const plan = planTick({ tickSeq: 5, calls: 3, settleEveryN: 5, cheapCount: CHEAP, cheapStart: 0 });
		expect(plan.isSettleTick).toBe(true);
		expect(plan.cheapIndices).toHaveLength(2);
		expect(RING_SETTLE_ENDPOINT?.key).toBe('ring-settle');
	});

	it('settleEveryN=0 disables the ring-settle carrier', () => {
		const plans = simulate(10, { settleEveryN: 0 });
		expect(plans.every((p) => !p.isSettleTick)).toBe(true);
	});
});

// ── Cap enforcement ─────────────────────────────────────────────────────────────
describe('ring-tick budgets', () => {
	it('tick budget is the smaller of tick cap and daily remaining', () => {
		expect(tickBudget(0, 50_000_000, 1_100_000)).toBe(1_100_000);
		expect(tickBudget(49_500_000, 50_000_000, 1_100_000)).toBe(500_000); // daily nearly spent
	});

	it('daily cap halts the tick (budget 0, never negative)', () => {
		expect(tickBudget(50_000_000, 50_000_000, 1_100_000)).toBe(0);
		expect(tickBudget(60_000_000, 50_000_000, 1_100_000)).toBe(0); // overshoot clamps to 0
		expect(dailyRemaining(60_000_000, 50_000_000)).toBe(0);
	});

	it('minimum payer USDC is the ring-settle price on a settle tick, headroom otherwise', () => {
		expect(minUsdcForTick({ isSettleTick: true, ringSettlePriceAtomic: 1_000_000 })).toBe(1_000_000);
		expect(minUsdcForTick({ isSettleTick: false, ringSettlePriceAtomic: 1_000_000 })).toBe(20_000);
	});
});

// ── Back-pressure ───────────────────────────────────────────────────────────────
describe('ring-tick back-pressure', () => {
	const FLOOR = 20_000_000; // 0.02 SOL
	const MIN_USDC = 1_000_000;

	it('below the SOL floor → clean no-op with sponsor_sol_floor', () => {
		const r = assessBackpressure({ solLamports: 10_000_000, usdcAtomic: 5_000_000, floorLamports: FLOOR, minUsdcAtomic: MIN_USDC });
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('sponsor_sol_floor');
	});

	it('insufficient payer USDC → insufficient_payer_usdc', () => {
		const r = assessBackpressure({ solLamports: 50_000_000, usdcAtomic: 100_000, floorLamports: FLOOR, minUsdcAtomic: MIN_USDC });
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('insufficient_payer_usdc');
	});

	it('an RPC read failure (NaN balance) → rpc_balance_unavailable', () => {
		expect(assessBackpressure({ solLamports: Number.NaN, usdcAtomic: 5_000_000, floorLamports: FLOOR, minUsdcAtomic: MIN_USDC }).reason).toBe('rpc_balance_unavailable');
		expect(assessBackpressure({ solLamports: 50_000_000, usdcAtomic: Number.NaN, floorLamports: FLOOR, minUsdcAtomic: MIN_USDC }).reason).toBe('rpc_balance_unavailable');
	});

	it('healthy balances → tick proceeds', () => {
		const r = assessBackpressure({ solLamports: 50_000_000, usdcAtomic: 5_000_000, floorLamports: FLOOR, minUsdcAtomic: MIN_USDC });
		expect(r.ok).toBe(true);
		expect(r.reason).toBeNull();
	});

	it('the floor is checked before USDC (settlement is paused, so USDC is moot)', () => {
		const r = assessBackpressure({ solLamports: 1, usdcAtomic: 0, floorLamports: FLOOR, minUsdcAtomic: MIN_USDC });
		expect(r.reason).toBe('sponsor_sol_floor');
	});
});

// ── Config gate: run only on a clean (no-error) envelope ────────────────────────
describe('ring-tick config gate', () => {
	it('blocks when any ERROR-severity finding exists', () => {
		const g = gateOnRingConfig([
			{ code: 'facilitator_url_external', severity: 'error' },
			{ code: 'ring_self_pay_off', severity: 'warn' },
		]);
		expect(g.blocked).toBe(true);
		expect(g.errors).toHaveLength(1);
		expect(g.warnings).toHaveLength(1);
	});

	it('does NOT block on warn-only findings (sponsor mode still settles in-house)', () => {
		const g = gateOnRingConfig([{ code: 'ring_self_pay_off', severity: 'warn' }]);
		expect(g.blocked).toBe(false);
		expect(g.warnings).toHaveLength(1);
	});

	it('a clean envelope is not blocked', () => {
		expect(gateOnRingConfig([]).blocked).toBe(false);
	});
});

// ── Config knobs + budget separation from the autonomous loop ───────────────────
describe('ringTickConfig', () => {
	const SAVED = {};
	const KEYS = [
		'X402_RING_TICK_ENABLED', 'X402_RING_TICK_CALLS', 'X402_RING_SETTLE_EVERY_N_TICKS',
		'X402_RING_TICK_CAP_ATOMIC', 'X402_RING_DAILY_CAP_ATOMIC', 'X402_AUTONOMOUS_DAILY_CAP_ATOMIC',
	];
	beforeEach(() => { for (const k of KEYS) { SAVED[k] = process.env[k]; delete process.env[k]; } });
	afterEach(() => { for (const k of KEYS) { if (SAVED[k] === undefined) delete process.env[k]; else process.env[k] = SAVED[k]; } });

	it('sensible defaults out of the box', () => {
		const c = ringTickConfig();
		expect(c.enabled).toBe(true);
		expect(c.calls).toBe(3);
		// settle every tick — the ~$50k/day throughput default (1440 ticks × $35 settle).
		expect(c.settleEveryN).toBe(1);
		expect(c.tickCapAtomic).toBe(40_000_000);
		expect(c.dailyCapAtomic).toBe(60_000_000_000);
	});

	it('X402_RING_TICK_ENABLED=false disables it; other values keep it on', () => {
		process.env.X402_RING_TICK_ENABLED = 'false';
		expect(ringTickConfig().enabled).toBe(false);
		process.env.X402_RING_TICK_ENABLED = 'true';
		expect(ringTickConfig().enabled).toBe(true);
	});

	it('the ring tick daily cap is SEPARATE from the autonomous loop cap', () => {
		process.env.X402_RING_DAILY_CAP_ATOMIC = '50000000';
		process.env.X402_AUTONOMOUS_DAILY_CAP_ATOMIC = '999';
		// Reading the ring tick config never picks up the autonomous loop's cap.
		expect(ringTickConfig().dailyCapAtomic).toBe(50_000_000);
	});

	it('rejects garbage numeric env, falling back to the default', () => {
		process.env.X402_RING_TICK_CALLS = 'not-a-number';
		expect(ringTickConfig().calls).toBe(3);
	});
});

// ── Price-vs-cap contradiction is impossible to hit silently ────────────────────
describe('price-vs-cap coherence', () => {
	const SAVED = {};
	const KEYS = ['X402_PRICE_RING_SETTLE', 'X402_VOLUME_PER_RUN_CAP_ATOMIC'];
	beforeEach(() => { for (const k of KEYS) { SAVED[k] = process.env[k]; delete process.env[k]; } });
	afterEach(() => { for (const k of KEYS) { if (SAVED[k] === undefined) delete process.env[k]; else process.env[k] = SAVED[k]; } });

	it('validateRingConfig flags ring_price_exceeds_run_cap when price > cap', () => {
		process.env.X402_PRICE_RING_SETTLE = '1000000'; // $1.00
		process.env.X402_VOLUME_PER_RUN_CAP_ATOMIC = '50000'; // $0.05 (the old, broken pairing)
		const codes = validateRingConfig().map((f) => f.code);
		expect(codes).toContain('ring_price_exceeds_run_cap');
	});

	it('no contradiction once the cap accommodates the price (stock defaults)', () => {
		process.env.X402_PRICE_RING_SETTLE = '1000000'; // $1.00
		process.env.X402_VOLUME_PER_RUN_CAP_ATOMIC = '1100000'; // $1.10 (the new default)
		const codes = validateRingConfig().map((f) => f.code);
		expect(codes).not.toContain('ring_price_exceeds_run_cap');
	});

	it('warnCapExceeded logs loudly and throttles per (url,cap) signature', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			warnCapExceeded('https://three.ws/api/x402/ring-settle', 1_000_000, 50_000);
			expect(spy).toHaveBeenCalledTimes(1);
			expect(spy.mock.calls[0][0]).toMatch(/SKIPPED/);
			expect(spy.mock.calls[0][0]).toMatch(/ring-settle/);
			// Same signature again within the hour is throttled.
			warnCapExceeded('https://three.ws/api/x402/ring-settle', 1_000_000, 50_000);
			expect(spy).toHaveBeenCalledTimes(1);
			// A different cap is a different signature — logs again.
			warnCapExceeded('https://three.ws/api/x402/ring-settle', 1_000_000, 60_000);
			expect(spy).toHaveBeenCalledTimes(2);
		} finally {
			spy.mockRestore();
		}
	});
});
