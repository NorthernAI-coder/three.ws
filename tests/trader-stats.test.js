/**
 * Trader track-record truth layer — pure-metric tests.
 *
 * Every assertion is hand-computed from the fixture below so the math can never
 * silently drift. computeTraderMetrics is pure (no DB, no network), so these run
 * fast and deterministically.
 */

import { describe, it, expect } from 'vitest';
import { computeTraderMetrics, windowStartIso, WINDOWS } from '../api/_lib/trader-stats.js';

const SOL = 1e9; // lamports per SOL

// Four closed positions + one open. Ordered so the equity curve has a clear,
// hand-checkable drawdown: +2 → +1.5 (−0.5 from peak 2 = 25%) → +2.0 → +2.01.
const FIXTURE = [
	// closed: A +2 SOL (+200%), 120s hold
	{
		status: 'closed', mint: 'AAAA', symbol: 'A', realized_pnl_lamports: String(2 * SOL),
		realized_pnl_pct: 200, entry_quote_lamports: String(1 * SOL), exit_quote_lamports: String(3 * SOL),
		opened_at: '2026-01-01T00:00:00.000Z', closed_at: '2026-01-01T00:02:00.000Z', buy_sig: 'b1', sell_sig: 's1',
	},
	// closed: B −0.5 SOL (−50%), 300s hold (the loser — never hidden)
	{
		status: 'closed', mint: 'BBBB', symbol: 'B', realized_pnl_lamports: String(-0.5 * SOL),
		realized_pnl_pct: -50, entry_quote_lamports: String(1 * SOL), exit_quote_lamports: String(0.5 * SOL),
		opened_at: '2026-01-01T00:03:00.000Z', closed_at: '2026-01-01T00:08:00.000Z', buy_sig: 'b2', sell_sig: 's2',
	},
	// closed: C +0.5 SOL (+50%), 60s hold
	{
		status: 'closed', mint: 'CCCC', symbol: 'C', realized_pnl_lamports: String(0.5 * SOL),
		realized_pnl_pct: 50, entry_quote_lamports: String(1 * SOL), exit_quote_lamports: String(1.5 * SOL),
		opened_at: '2026-01-01T00:09:00.000Z', closed_at: '2026-01-01T00:10:00.000Z', buy_sig: 'b3', sell_sig: 's3',
	},
	// closed: D +0.01 SOL (+1%), 10s hold → churn (fast in-and-out, near-flat)
	{
		status: 'closed', mint: 'DDDD', symbol: 'D', realized_pnl_lamports: String(0.01 * SOL),
		realized_pnl_pct: 1, entry_quote_lamports: String(1 * SOL), exit_quote_lamports: String(1.01 * SOL),
		opened_at: '2026-01-01T00:11:00.000Z', closed_at: '2026-01-01T00:11:10.000Z', buy_sig: 'b4', sell_sig: 's4',
	},
	// open: E, entry 1 SOL, now worth 1.5 SOL → +0.5 SOL unrealized
	{
		status: 'open', mint: 'EEEE', symbol: 'E', entry_quote_lamports: String(1 * SOL),
		last_value_lamports: String(1.5 * SOL), opened_at: '2026-01-01T00:15:00.000Z', buy_sig: 'b5',
	},
];

describe('computeTraderMetrics', () => {
	const m = computeTraderMetrics(FIXTURE, { solUsd: 200 });

	it('counts closed and open positions separately', () => {
		expect(m.closed_count).toBe(4);
		expect(m.open_count).toBe(1);
	});

	it('computes wins, losses, and win rate', () => {
		expect(m.wins).toBe(3);
		expect(m.losses).toBe(1);
		expect(m.win_rate).toBe(0.75);
	});

	it('sums realized P&L exactly in SOL and prices it to USD', () => {
		// 2 − 0.5 + 0.5 + 0.01 = 2.01 SOL
		expect(m.realized_pnl_sol).toBeCloseTo(2.01, 6);
		expect(m.realized_pnl_usd).toBeCloseTo(402, 2); // 2.01 × 200
	});

	it('tracks open exposure and unrealized P&L', () => {
		expect(m.open_exposure_sol).toBeCloseTo(1, 6);
		expect(m.unrealized_pnl_sol).toBeCloseTo(0.5, 6);
		expect(m.unrealized_pnl_usd).toBeCloseTo(100, 2);
	});

	it('computes profit factor (gross profit / gross loss)', () => {
		// (2 + 0.5 + 0.01) / 0.5 = 5.02
		expect(m.profit_factor).toBeCloseTo(5.02, 2);
	});

	it('computes ROI against invested capital', () => {
		// 2.01 / 4 × 100 = 50.25%
		expect(m.roi_pct).toBeCloseTo(50.25, 1);
	});

	it('reports best/worst/avg trade pct', () => {
		expect(m.best_pnl_pct).toBe(200);
		expect(m.worst_pnl_pct).toBe(-50);
		expect(m.avg_pnl_pct).toBeCloseTo(50.25, 1); // (200 − 50 + 50 + 1) / 4
	});

	it('computes max drawdown from the realized equity curve', () => {
		// peak +2, trough +1.5 → 0.5 SOL drop = 25% of peak
		expect(m.max_drawdown_sol).toBeCloseTo(0.5, 6);
		expect(m.max_drawdown_pct).toBeCloseTo(25, 5);
	});

	it('computes hold-time stats', () => {
		expect(m.avg_hold_seconds).toBe(123); // (120+300+60+10)/4 = 122.5 → 123
		expect(m.median_hold_seconds).toBe(90); // sorted [10,60,120,300] → (60+120)/2
	});

	it('counts unique coins and flags churn heuristically', () => {
		expect(m.unique_coins).toBe(4);
		expect(m.churn_pct).toBeCloseTo(25, 5); // 1 of 4 closed is churn
	});

	it('does NOT grant the verified badge below the trade threshold', () => {
		expect(m.verified).toBe(false); // only 4 closed, badge needs >= 12
	});

	it('produces a bounded composite score', () => {
		expect(m.score).toBeGreaterThan(0);
		expect(m.score).toBeLessThanOrEqual(100);
	});

	it('records first/last active timestamps', () => {
		expect(m.first_active_at).toBe('2026-01-01T00:00:00.000Z');
		expect(m.last_active_at).toBe('2026-01-01T00:15:00.000Z'); // open E opened latest
	});
});

describe('computeTraderMetrics — degenerate inputs', () => {
	it('handles an empty book without throwing and regresses score to neutral', () => {
		const m = computeTraderMetrics([], { solUsd: 200 });
		expect(m.closed_count).toBe(0);
		expect(m.open_count).toBe(0);
		expect(m.win_rate).toBe(0);
		expect(m.realized_pnl_sol).toBe(0);
		expect(m.realized_pnl_usd).toBe(0);
		expect(m.verified).toBe(false);
		expect(m.score).toBe(42); // confidence 0 → fully regressed to NEUTRAL_RAW
	});

	it('omits USD fields when no SOL price is available', () => {
		const m = computeTraderMetrics(FIXTURE, { solUsd: null });
		expect(m.realized_pnl_sol).toBeCloseTo(2.01, 6); // SOL stays exact
		expect(m.realized_pnl_usd).toBeNull();
		expect(m.unrealized_pnl_usd).toBeNull();
	});

	it('handles an all-losses book (zero gross profit → profit factor 0)', () => {
		const losses = [
			{ status: 'closed', mint: 'X', realized_pnl_lamports: String(-1 * SOL), realized_pnl_pct: -40,
			  entry_quote_lamports: String(1 * SOL), opened_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-01T00:05:00Z' },
		];
		const m = computeTraderMetrics(losses, { solUsd: 200 });
		expect(m.wins).toBe(0);
		expect(m.win_rate).toBe(0);
		expect(m.profit_factor).toBe(0);
		expect(m.realized_pnl_sol).toBeCloseTo(-1, 6);
	});
});

describe('windowStartIso', () => {
	const NOW = Date.parse('2026-06-15T12:00:00.000Z');

	it('returns null for the all-time window', () => {
		expect(windowStartIso('all', NOW)).toBeNull();
	});

	it('computes the lower bound for 24h / 7d / 30d', () => {
		expect(windowStartIso('24h', NOW)).toBe(new Date(NOW - 86_400_000).toISOString());
		expect(windowStartIso('7d', NOW)).toBe(new Date(NOW - 604_800_000).toISOString());
		expect(windowStartIso('30d', NOW)).toBe(new Date(NOW - 2_592_000_000).toISOString());
	});

	it('exposes the supported window set', () => {
		expect([...WINDOWS].sort()).toEqual(['24h', '30d', '7d', 'all']);
	});
});
