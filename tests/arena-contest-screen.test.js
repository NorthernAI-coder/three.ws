// Contest screen + poller — unit tests for the pure logic (CONTRACTS §2.2).
//
// The canvas rendering needs a real 2D context (not available headless), so these
// pin the parts that carry the contract risk: the countdown formatting + drift
// colouring, the ticker de-dup/cap, the shared poller's cadence, round-flip
// fast-repoll, visibility pausing, and error backoff.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
	formatCountdown,
	countdownColor,
	mergeTicker,
} from '../src/game/arena/contest-screen.js';
import {
	createContestPoller,
	backoffDelay,
} from '../src/game/arena/contest-screens.js';

describe('formatCountdown()', () => {
	it('formats M:SS and floors at 0:00', () => {
		expect(formatCountdown(88000)).toBe('1:28');
		expect(formatCountdown(8000)).toBe('0:08');
		expect(formatCountdown(0)).toBe('0:00');
		expect(formatCountdown(-2000)).toBe('0:00');
	});
	it('handles null / non-finite', () => {
		expect(formatCountdown(null)).toBe('—:—');
		expect(formatCountdown(NaN)).toBe('—:—');
	});
});

describe('countdownColor()', () => {
	it('shifts calm → amber → red as the round closes', () => {
		const calm = countdownColor(60000);
		const warn = countdownColor(15000);
		const danger = countdownColor(5000);
		expect(calm).not.toBe(warn);
		expect(warn).not.toBe(danger);
		expect(countdownColor(60000)).toBe(calm);   // stable above thresholds
		expect(countdownColor(5000)).toBe(danger);
	});
});

describe('mergeTicker()', () => {
	it('dedupes by entryId, newest-first, capped', () => {
		const existing = [
			{ entryId: 'b', agent: 'b', submittedMs: 200 },
			{ entryId: 'a', agent: 'a', submittedMs: 100 },
		];
		const incoming = [
			{ entryId: 'c', agent: 'c', submittedMs: 300 },
			{ entryId: 'b', agent: 'b', submittedMs: 200 }, // dup — ignored
		];
		const out = mergeTicker(existing, incoming, 10);
		expect(out.map((e) => e.entryId)).toEqual(['c', 'b', 'a']);
	});
	it('caps to the requested length', () => {
		const many = Array.from({ length: 30 }, (_, i) => ({ entryId: 's' + i, submittedMs: i }));
		expect(mergeTicker([], many, 5)).toHaveLength(5);
	});
	it('collapses an optimistic entry once the feed confirms it (no double-count)', () => {
		// applyFeed merges feed entries (incoming) over the existing buffer that
		// holds the optimistic push — same entryId folds to a single, now-confirmed row.
		const existing = [{ entryId: 'x1', agent: 'you', submittedMs: 500, optimistic: true }];
		const incoming = [{ entryId: 'x1', agent: 'you', submittedMs: 500 }];
		const out = mergeTicker(existing, incoming, 10);
		expect(out).toHaveLength(1);
		expect(out[0].optimistic).toBeUndefined(); // confirmed copy supersedes the optimistic one
	});

	it('lists a fresh optimistic push ahead of older entries', () => {
		const existing = [{ entryId: 'old', agent: 'a', submittedMs: 100 }];
		const pushed = [{ entryId: 'new', agent: 'you', submittedMs: 900, optimistic: true }];
		const out = mergeTicker(existing, pushed, 10);
		expect(out[0].entryId).toBe('new');
		expect(out[0].optimistic).toBe(true);
	});
});

describe('backoffDelay()', () => {
	it('grows exponentially and caps', () => {
		expect(backoffDelay(1, 5000, 30000)).toBe(5000);
		expect(backoffDelay(2, 5000, 30000)).toBe(10000);
		expect(backoffDelay(3, 5000, 30000)).toBe(20000);
		expect(backoffDelay(4, 5000, 30000)).toBe(30000);
		expect(backoffDelay(10, 5000, 30000)).toBe(30000);
	});
});

describe('createContestPoller()', () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => {
		vi.useRealTimers();
		delete globalThis.document;
	});

	function feedClosingIn(ms) {
		const now = Date.now();
		return {
			ok: true, serverNowMs: now,
			current: { id: 'c', round: 1, opensMs: now - 80000, closesMs: now + ms },
			next: null, leaderboard: [], recentEntries: [], recentWinners: [],
		};
	}

	it('polls immediately on start, then at the steady cadence', async () => {
		const fetchFeed = vi.fn(async () => feedClosingIn(60000));
		const onFeed = vi.fn();
		const poller = createContestPoller({ fetchFeed, onFeed, onError: () => {}, pollMs: 5000 });
		poller.start();
		await vi.advanceTimersByTimeAsync(1);
		expect(fetchFeed).toHaveBeenCalledTimes(1);
		expect(onFeed).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5000);
		expect(fetchFeed).toHaveBeenCalledTimes(2);
		poller.dispose();
	});

	it('fast-repolls right after a round closes to catch the flip', async () => {
		// First feed closes in 1s; after the 1s steady? no — within FLIP grace, so
		// the next delay is the fast 1.5s, not 5s.
		const fetchFeed = vi.fn(async () => feedClosingIn(1000));
		const poller = createContestPoller({ fetchFeed, onFeed: () => {}, onError: () => {}, pollMs: 5000 });
		poller.start();
		await vi.advanceTimersByTimeAsync(1);
		expect(fetchFeed).toHaveBeenCalledTimes(1);
		// fast repoll fires at 1.5s, before the 5s steady cadence would
		await vi.advanceTimersByTimeAsync(1500);
		expect(fetchFeed).toHaveBeenCalledTimes(2);
		poller.dispose();
	});

	it('backs off and keeps retrying on error', async () => {
		const fetchFeed = vi.fn(async () => { throw new Error('down'); });
		const onError = vi.fn();
		const poller = createContestPoller({ fetchFeed, onFeed: () => {}, onError, pollMs: 5000 });
		poller.start();
		await vi.advanceTimersByTimeAsync(1);
		expect(onError).toHaveBeenCalledTimes(1);
		// first backoff step is 5s; nothing before then
		await vi.advanceTimersByTimeAsync(4000);
		expect(fetchFeed).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(fetchFeed).toHaveBeenCalledTimes(2);
		poller.dispose();
	});

	it('stops polling after dispose', async () => {
		const fetchFeed = vi.fn(async () => feedClosingIn(60000));
		const poller = createContestPoller({ fetchFeed, onFeed: () => {}, onError: () => {}, pollMs: 5000 });
		poller.start();
		await vi.advanceTimersByTimeAsync(1);
		poller.dispose();
		await vi.advanceTimersByTimeAsync(20000);
		expect(fetchFeed).toHaveBeenCalledTimes(1);
	});

	it('pauses while the tab is hidden', async () => {
		let hidden = false;
		globalThis.document = {
			get hidden() { return hidden; },
			addEventListener: () => {},
			removeEventListener: () => {},
		};
		const fetchFeed = vi.fn(async () => feedClosingIn(60000));
		const poller = createContestPoller({ fetchFeed, onFeed: () => {}, onError: () => {}, pollMs: 5000 });
		poller.start();
		await vi.advanceTimersByTimeAsync(1);
		expect(fetchFeed).toHaveBeenCalledTimes(1);
		hidden = true;
		await vi.advanceTimersByTimeAsync(20000); // scheduled ticks no-op while hidden
		expect(fetchFeed).toHaveBeenCalledTimes(1);
		poller.dispose();
	});
});
