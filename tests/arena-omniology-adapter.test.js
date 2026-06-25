// Omniology adapter — unit tests for the wire→normalized boundary (CONTRACTS §2.1).
//
// The adapter is the ONLY module that knows Omniology's wire shapes, so this is
// where the contract is pinned: base-URL resolution, the snake_case→camelCase /
// unix-seconds→ms normalization, the no-mocks "unconfigured" surface, throwing on
// HTTP error, and the frozen submitEntryRequest payload that prompt 04 depends on.

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	omniologyBase,
	normalizeFeed,
	fetchLiveFeed,
	submitEntryRequest,
} from '../src/game/arena/omniology-adapter.js';

// A realistic feed straight from CONTRACTS §1.1.
const WIRE = {
	now_unix: 1719259200,
	current: {
		id: 'c_abc',
		title: 'Best landscape',
		round: 1421,
		opened_unix: 1719259112,
		closes_unix: 1719259200,
		entries_count: 37,
		prize_usdc: 12.5,
		prize_asset: 'USDC',
	},
	next: { opens_unix: 1719259260 },
	leaderboard: [
		{ rank: 1, entry_id: 'e1', agent: 'nova', score: 0.92, thumb_url: 'https://cdn.omniology.ai/e1.png' },
		{ rank: 2, entry_id: 'e2', agent: 'atlas', score: 0.81, thumb_url: null },
	],
	recent_entries: [
		{ entry_id: 'e9', agent: 'zephyr', submitted_unix: 1719259190 },
	],
	recent_winners: [
		{ round: 1420, agent: 'orion', prize_usdc: 11.0, tx: '5xSig' },
	],
};

describe('omniologyBase()', () => {
	afterEach(() => {
		delete globalThis.window;
		delete globalThis.document;
	});

	it('returns empty string when nothing is configured', () => {
		expect(omniologyBase()).toBe('');
	});

	it('reads window.OMNIOLOGY_BASE and strips trailing slashes', () => {
		globalThis.window = { OMNIOLOGY_BASE: 'https://api.omniology.ai/' };
		expect(omniologyBase()).toBe('https://api.omniology.ai');
	});

	it('reads the <meta name="omniology-base"> tag', () => {
		globalThis.document = {
			querySelector: (sel) =>
				sel === 'meta[name="omniology-base"]'
					? { getAttribute: () => '  https://feed.omniology.ai/  ' }
					: null,
		};
		expect(omniologyBase()).toBe('https://feed.omniology.ai');
	});
});

describe('normalizeFeed()', () => {
	it('maps the wire feed to camelCase / ms', () => {
		const f = normalizeFeed(WIRE);
		expect(f.ok).toBe(true);
		expect(f.serverNowMs).toBe(1719259200 * 1000);
		expect(f.current).toMatchObject({
			id: 'c_abc',
			title: 'Best landscape',
			round: 1421,
			opensMs: 1719259112000,
			closesMs: 1719259200000,
			entriesCount: 37,
			prizeUsdc: 12.5,
			prizeAsset: 'USDC',
		});
		expect(f.next).toEqual({ opensMs: 1719259260000 });
		expect(f.leaderboard[0]).toMatchObject({ rank: 1, entryId: 'e1', agent: 'nova', score: 0.92 });
		expect(f.leaderboard[0].thumbUrl).toBe('https://cdn.omniology.ai/e1.png');
		expect(f.recentEntries[0]).toMatchObject({ entryId: 'e9', agent: 'zephyr', submittedMs: 1719259190000 });
		expect(f.recentWinners[0]).toMatchObject({ round: 1420, agent: 'orion', prizeUsdc: 11, tx: '5xSig' });
	});

	it('tolerates nulls and missing fields without inventing data', () => {
		const f = normalizeFeed({ now_unix: 1719259200, current: null, next: null });
		expect(f.current).toBeNull();
		expect(f.next).toBeNull();
		expect(f.leaderboard).toEqual([]);
		expect(f.recentEntries).toEqual([]);
		expect(f.recentWinners).toEqual([]);
	});

	it('drops non-HTTPS thumbnails to null (designed monogram fallback)', () => {
		const f = normalizeFeed({
			...WIRE,
			leaderboard: [{ rank: 1, entry_id: 'e1', agent: 'nova', score: 0.5, thumb_url: 'http://insecure/x.png' }],
		});
		expect(f.leaderboard[0].thumbUrl).toBeNull();
	});
});

describe('fetchLiveFeed()', () => {
	afterEach(() => {
		delete globalThis.window;
		delete globalThis.document;
		vi.unstubAllGlobals();
	});

	it('surfaces an unconfigured status (never fabricated data) when no base is set', async () => {
		const f = await fetchLiveFeed();
		expect(f.ok).toBe(false);
		expect(f.reason).toBe('unconfigured');
		expect(f.current).toBeNull();
		expect(f.leaderboard).toEqual([]);
	});

	it('fetches and normalizes against a configured base', async () => {
		globalThis.window = { OMNIOLOGY_BASE: 'https://api.omniology.ai' };
		const fetchMock = vi.fn(async (url) => {
			expect(url).toBe('https://api.omniology.ai/v1/contests/live');
			return { ok: true, json: async () => WIRE };
		});
		vi.stubGlobal('fetch', fetchMock);
		const f = await fetchLiveFeed();
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(f.ok).toBe(true);
		expect(f.current.round).toBe(1421);
	});

	it('throws on an HTTP error so the poller can drive the retry state', async () => {
		globalThis.window = { OMNIOLOGY_BASE: 'https://api.omniology.ai' };
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
		await expect(fetchLiveFeed()).rejects.toThrow(/503/);
	});
});

describe('submitEntryRequest()', () => {
	afterEach(() => { delete globalThis.window; });

	it('builds the frozen POST payload for the x402 desk flow', () => {
		globalThis.window = { OMNIOLOGY_BASE: 'https://api.omniology.ai' };
		const req = submitEntryRequest('c abc/1', { prompt: 'a cat' }, 'nova');
		expect(req.method).toBe('POST');
		expect(req.url).toBe('https://api.omniology.ai/v1/contests/c%20abc%2F1/entries');
		expect(req.body).toEqual({ entry: { prompt: 'a cat' }, agent: 'nova' });
	});

	it('defaults a null agent and empty entry', () => {
		const req = submitEntryRequest('c1');
		expect(req.body).toEqual({ entry: {}, agent: null });
	});
});
