// Behavioral tests for the Omniology read + write tools.
//
// Network calls hit a REAL injected fetch (dependency-injected into the
// OmniologyClient), not a global monkeypatch — so the actual request building,
// response parsing, normalization, and error sanitization run end to end with
// no live-network dependency in CI. Fixtures are synthetic (Omniology contest
// shapes per CONTRACTS §1); the only token referenced is USDC as a payment
// asset.
//
// Run: node --test packages/omniology-mcp/test/tools.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OmniologyClient } from '../src/omniology.js';
import { buildListContestsTool } from '../src/tools/list-contests.js';
import { buildGetContestTool } from '../src/tools/get-contest.js';
import { buildGetLeaderboardTool } from '../src/tools/get-leaderboard.js';
import { submitEntryCore } from '../src/tools/submit-entry.js';

const BASE = 'https://sandbox.omniology.test';

// Minimal Response stand-in matching what OmniologyClient consumes.
function jsonResponse(body, { status = 200 } = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
	};
}

// A recording fake fetch: returns the queued response and records the call.
function fakeFetch(responder) {
	const calls = [];
	const fn = async (url, init) => {
		calls.push({ url, init });
		return responder(url, init);
	};
	fn.calls = calls;
	return fn;
}

const LIVE_FEED = {
	now_unix: 1719259200,
	current: {
		id: 'rnd_1421',
		title: 'Neon Koi',
		round: 1421,
		opened_unix: 1719259112,
		closes_unix: 1719259200,
		entries_count: 37,
		prize_usdc: 12.5,
		prize_asset: 'USDC',
	},
	next: { opens_unix: 1719259288 },
	leaderboard: [
		{ rank: 1, entry_id: 'ent_a', agent: 'Reef', score: 0.92, thumb_url: 'https://cdn.test/a.png' },
		{ rank: 2, entry_id: 'ent_b', agent: 'Coral', score: 0.81, thumb_url: null },
	],
	recent_entries: [{ entry_id: 'ent_c', agent: 'Tide', submitted_unix: 1719259190 }],
	recent_winners: [{ round: 1420, agent: 'Marlin', prize_usdc: 11.0, tx: 'sig_xyz' }],
};

function clientReturning(responder) {
	const fetchImpl = fakeFetch(responder);
	const client = new OmniologyClient({ baseUrl: BASE, fetchImpl, apiKey: 'secret-token' });
	return { client, fetchImpl };
}

test('list_contests normalizes the live feed (ms timestamps, camelCase)', async () => {
	const { client, fetchImpl } = clientReturning(() => jsonResponse(LIVE_FEED));
	const tool = buildListContestsTool(client);
	const res = await tool.handler({});
	const out = res.structuredContent;

	assert.equal(fetchImpl.calls[0].url, `${BASE}/v1/contests/live`);
	assert.equal(out.ok, true);
	assert.equal(out.serverNowMs, 1719259200000);
	assert.equal(out.count, 2); // live + upcoming
	const live = out.contests.find((c) => c.status === 'live');
	assert.equal(live.id, 'rnd_1421');
	assert.equal(live.closesMs, 1719259200000);
	assert.equal(live.prizeUsdc, 12.5);
	const upcoming = out.contests.find((c) => c.status === 'upcoming');
	assert.equal(upcoming.round, 1422);
	assert.equal(upcoming.opensMs, 1719259288000);
	assert.equal(out.recentWinners[0].agent, 'Marlin');
});

test('list_contests status="live" returns only the running round', async () => {
	const { client } = clientReturning(() => jsonResponse(LIVE_FEED));
	const tool = buildListContestsTool(client);
	const out = (await tool.handler({ status: 'live' })).structuredContent;
	assert.equal(out.count, 1);
	assert.equal(out.contests[0].status, 'live');
});

test('get_contest resolves the running round and exposes its leaderboard', async () => {
	const { client } = clientReturning(() => jsonResponse(LIVE_FEED));
	const tool = buildGetContestTool(client);
	const out = (await tool.handler({ contestId: 'rnd_1421' })).structuredContent;
	assert.equal(out.ok, true);
	assert.equal(out.contest.title, 'Neon Koi');
	assert.equal(out.leaderboard.length, 2);
	assert.equal(out.recentEntries[0].agent, 'Tide');
});

test('get_contest returns a clean contest_not_found for an unknown id', async () => {
	const { client } = clientReturning(() => jsonResponse(LIVE_FEED));
	const tool = buildGetContestTool(client);
	const res = await tool.handler({ contestId: 'rnd_does_not_exist' });
	assert.equal(res.isError, true);
	assert.equal(res.structuredContent.error, 'contest_not_found');
	assert.equal(res.structuredContent.status, 404);
});

test('get_leaderboard returns ranked entries for the running round', async () => {
	const { client } = clientReturning(() => jsonResponse(LIVE_FEED));
	const tool = buildGetLeaderboardTool(client);
	const out = (await tool.handler({ contestId: 'rnd_1421' })).structuredContent;
	assert.equal(out.round, 1421);
	assert.equal(out.count, 2);
	assert.equal(out.leaderboard[0].rank, 1);
	assert.equal(out.leaderboard[0].thumbUrl, 'https://cdn.test/a.png');
	assert.equal(out.leaderboard[1].thumbUrl, null); // null preserved, never invented
});

test('upstream HTTP errors are sanitized into a stable envelope', async () => {
	const { client } = clientReturning(() =>
		jsonResponse({ error: 'feed temporarily unavailable' }, { status: 503 }),
	);
	const tool = buildListContestsTool(client);
	const res = await tool.handler({});
	assert.equal(res.isError, true);
	assert.equal(res.structuredContent.error, 'upstream_error');
	assert.equal(res.structuredContent.status, 503);
	assert.match(res.structuredContent.message, /feed temporarily unavailable/);
});

test('network failures are sanitized and never leak internals', async () => {
	const { client } = clientReturning(() => {
		throw new Error('ECONNREFUSED 10.0.0.1:443 internal stack');
	});
	const tool = buildGetLeaderboardTool(client);
	const res = await tool.handler({ contestId: 'rnd_1421' });
	assert.equal(res.isError, true);
	assert.equal(res.structuredContent.error, 'network_error');
	assert.doesNotMatch(res.structuredContent.message, /ECONNREFUSED|10\.0\.0\.1|stack/);
});

test('an unconfigured base URL fails closed, not with fabricated data', async () => {
	const client = new OmniologyClient({ baseUrl: '', fetchImpl: fakeFetch(() => jsonResponse(LIVE_FEED)) });
	const tool = buildListContestsTool(client);
	const res = await tool.handler({});
	assert.equal(res.isError, true);
	assert.equal(res.structuredContent.error, 'not_configured');
});

test('submit_entry forwards an authenticated POST and shapes the acceptance', async () => {
	const { client, fetchImpl } = clientReturning(() =>
		jsonResponse({ entry_id: 'ent_new', status: 'accepted', round: 1421, position: 38 }),
	);
	const out = await submitEntryCore(client, {
		contestId: 'rnd_1421',
		entry: { prompt: 'a neon koi' },
		agent: 'Reef',
	});
	assert.equal(out.ok, true);
	assert.equal(out.entryId, 'ent_new');
	assert.equal(out.position, 38);

	const call = fetchImpl.calls[0];
	assert.equal(call.url, `${BASE}/v1/contests/rnd_1421/entries`);
	assert.equal(call.init.method, 'POST');
	assert.equal(call.init.headers.authorization, 'Bearer secret-token');
	assert.deepEqual(JSON.parse(call.init.body), {
		entry: { prompt: 'a neon koi' },
		agent: 'Reef',
	});
});

test('submit_entry rejects a non-object entry before any network call', async () => {
	const { client, fetchImpl } = clientReturning(() => jsonResponse({}));
	const res = await submitEntryCore(client, { contestId: 'rnd_1421', entry: 'not-an-object' });
	assert.equal(res.ok, false);
	assert.equal(res.error, 'bad_input');
	assert.equal(fetchImpl.calls.length, 0);
});

test('submit_entry surfaces an Omniology rejection as ok:false (cancels payment)', async () => {
	const { client } = clientReturning(() =>
		jsonResponse({ message: 'round already closed' }, { status: 409 }),
	);
	const res = await submitEntryCore(client, { contestId: 'rnd_1421', entry: { prompt: 'x' } });
	assert.equal(res.ok, false);
	assert.equal(res.error, 'upstream_error');
	assert.equal(res.status, 409);
	assert.match(res.message, /round already closed/);
});
