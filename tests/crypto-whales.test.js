import { describe, it, expect } from 'vitest';
import {
	normalizeTrade,
	computeSignal,
	buildWhaleResult,
} from '../api/_lib/pump-whale-scan.js';

// Synthetic pump.fun trades — no real third-party mints/wallets (CLAUDE.md).
// Wallets are placeholder base58-ish strings; the aggregation only keys on them.
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

function buy(wallet, sol, extra = {}) {
	return { type: 'buy', amountSol: sol, userAddress: wallet, signature: `sig-${wallet}-${sol}`, timestamp: 1783382400, ...extra };
}
function sell(wallet, sol, extra = {}) {
	return { type: 'sell', amountSol: sol, userAddress: wallet, signature: `sig-${wallet}-${sol}`, timestamp: 1783382400, ...extra };
}

describe('normalizeTrade', () => {
	it('parses a buy with defensive field names', () => {
		const t = normalizeTrade({ txType: 'BUY', sol_amount: '3.5', user: 'WalletA', tx: 'abc', createdAt: 1783382400 });
		expect(t).toEqual({ side: 'buy', sol: 3.5, wallet: 'WalletA', txHash: 'abc', ts: '2026-07-07T00:00:00.000Z' });
	});

	it('normalizes millisecond timestamps and ISO strings', () => {
		expect(normalizeTrade(buy('W', 5, { timestamp: 1783382400000 })).ts).toBe('2026-07-07T00:00:00.000Z');
		expect(normalizeTrade(buy('W', 5, { timestamp: '2026-07-07T00:00:00Z' })).ts).toBe('2026-07-07T00:00:00.000Z');
	});

	it('rejects non-buy/sell, zero-amount, and wallet-less trades', () => {
		expect(normalizeTrade({ type: 'transfer', amountSol: 5, userAddress: 'W' })).toBeNull();
		expect(normalizeTrade({ type: 'buy', amountSol: 0, userAddress: 'W' })).toBeNull();
		expect(normalizeTrade({ type: 'buy', amountSol: 5 })).toBeNull();
		expect(normalizeTrade(null)).toBeNull();
	});
});

describe('computeSignal — deterministic net-whale-flow rule', () => {
	const minSol = 5;
	it('neutral when there is no whale activity at all', () => {
		expect(computeSignal({ whaleBuySol: 0, whaleSellSol: 0, buyCount: 0, sellCount: 0 }, minSol)).toBe('neutral');
	});
	it('bullish when net whale flow ≥ +minSol (accumulation)', () => {
		expect(computeSignal({ whaleBuySol: 30, whaleSellSol: 10, buyCount: 4, sellCount: 1 }, minSol)).toBe('bullish');
	});
	it('bearish when net whale flow ≤ −minSol (distribution)', () => {
		expect(computeSignal({ whaleBuySol: 6, whaleSellSol: 20, buyCount: 1, sellCount: 3 }, minSol)).toBe('bearish');
	});
	it('neutral when net flow is within ±minSol (balanced)', () => {
		expect(computeSignal({ whaleBuySol: 12, whaleSellSol: 10, buyCount: 2, sellCount: 2 }, minSol)).toBe('neutral');
	});
	it('scales with minSol — same net flow flips as threshold changes', () => {
		const flow = { whaleBuySol: 12, whaleSellSol: 4, buyCount: 2, sellCount: 1 }; // net +8
		expect(computeSignal(flow, 5)).toBe('bullish'); // 8 ≥ 5
		expect(computeSignal(flow, 10)).toBe('neutral'); // 8 < 10
	});
});

describe('buildWhaleResult — threshold filter', () => {
	it('keeps only buys at/above minSol', () => {
		const trades = [buy('W1', 10), buy('W2', 4.9), buy('W3', 5)];
		const r = buildWhaleResult({ trades, scope: 'token', mint: THREE_MINT, minSol: 5, limit: 10 });
		expect(r.whaleCount).toBe(2);
		expect(r.whales.map((w) => w.solMoved).sort()).toEqual([5, 10]);
		expect(r.totalSolMoved).toBe(15);
	});
});

describe('buildWhaleResult — token scope (per-buy rows)', () => {
	it('returns one row per qualifying buy, largest first, carrying tx + ts', () => {
		const trades = [buy('W1', 6), buy('W1', 20), buy('W2', 8)];
		const r = buildWhaleResult({ trades, scope: 'token', mint: THREE_MINT, minSol: 5, limit: 10 });
		expect(r.scope).toBe('token');
		expect(r.mint).toBe(THREE_MINT);
		expect(r.whales.map((w) => w.solMoved)).toEqual([20, 8, 6]); // per-buy, not aggregated
		expect(r.whaleCount).toBe(3);
		expect(r.whales[0].txHash).toBeTruthy();
		expect(r.whales[0].ts).toBe('2026-07-07T00:00:00.000Z');
	});

	it('respects the limit', () => {
		const trades = [buy('W1', 6), buy('W2', 7), buy('W3', 8)];
		const r = buildWhaleResult({ trades, scope: 'token', mint: THREE_MINT, minSol: 5, limit: 2 });
		expect(r.whales).toHaveLength(2);
		expect(r.whaleCount).toBe(3); // count reflects all qualifiers, list is capped
	});
});

describe('buildWhaleResult — market scope (per-wallet aggregation)', () => {
	it('aggregates a wallet across coins; solMoved sums, txHash = largest buy', () => {
		const trades = [buy('Whale', 6), buy('Whale', 20), buy('Other', 8)];
		const r = buildWhaleResult({ trades, scope: 'market', mint: null, minSol: 5, limit: 10 });
		expect(r.scope).toBe('market');
		expect(r.mint).toBeNull();
		const whale = r.whales.find((w) => w.wallet === 'Whale');
		expect(whale.solMoved).toBe(26); // 6 + 20 summed
		expect(whale.txHash).toBe('sig-Whale-20'); // representative = largest buy
		expect(r.whaleCount).toBe(2); // distinct wallets, not buys
	});
});

describe('buildWhaleResult — empty case', () => {
	it('no whales over threshold → empty + neutral, not an error', () => {
		const trades = [buy('W1', 1), sell('W2', 2)];
		const r = buildWhaleResult({ trades, scope: 'market', mint: null, minSol: 5, limit: 10 });
		expect(r.whales).toEqual([]);
		expect(r.whaleCount).toBe(0);
		expect(r.totalSolMoved).toBe(0);
		expect(r.signal).toBe('neutral');
		expect(r.source).toBe('pump.fun');
	});

	it('empty trade list → empty + neutral', () => {
		const r = buildWhaleResult({ trades: [], scope: 'token', mint: THREE_MINT, minSol: 5, limit: 10 });
		expect(r.whales).toEqual([]);
		expect(r.signal).toBe('neutral');
	});
});
