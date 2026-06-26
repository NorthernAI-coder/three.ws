/**
 * cache.js circuit breaker — unit test.
 *
 * A degraded Upstash store (commands timing out at REDIS_CMD_TIMEOUT_MS rather
 * than rejecting promptly) otherwise makes EVERY request pay a full 3s stall
 * before falling back to memory, and emits one identical warning per request —
 * the flood seen in production on hot endpoints like /api/galaxy/flows. After a
 * run of consecutive failures the cache OPENS a circuit and serves straight from
 * memory without touching the network. This pins that behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cacheSet, cacheGet } from '../api/_lib/cache.js';

const SHARED = 'https://ratelimit-store.upstash.io';
const ENV_KEYS = ['UPSTASH_CACHE_REST_URL', 'UPSTASH_CACHE_REST_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
let saved;

beforeEach(() => {
	saved = {};
	for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
	process.env.UPSTASH_REDIS_REST_URL = SHARED;
	process.env.UPSTASH_REDIS_REST_TOKEN = 'shared-token';
});

afterEach(() => {
	for (const k of ENV_KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
	vi.restoreAllMocks();
});

describe('cache circuit breaker', () => {
	it('opens after consecutive failures and then serves from memory without calling fetch', async () => {
		// Every command times out (the production failure mode).
		const fetchMock = vi.fn(async () => { throw new Error('The operation was aborted due to timeout'); });
		globalThis.fetch = fetchMock;
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		// Drive enough consecutive failures to trip the breaker (threshold is 5).
		for (let i = 0; i < 5; i++) {
			await cacheSet(`circuit:open:${i}`, { v: i }, 30);
		}
		const callsAtOpen = fetchMock.mock.calls.length;
		expect(callsAtOpen).toBe(5); // each attempt hit the network while the circuit was closed

		// Circuit is now open — further commands must short-circuit to memory and
		// NOT touch the network at all.
		await cacheSet('circuit:after', { v: 'x' }, 30);
		await cacheGet('circuit:after-get');
		expect(fetchMock).toHaveBeenCalledTimes(callsAtOpen); // no new fetches

		// The value written while open is still readable from the in-memory fallback.
		expect(await cacheGet('circuit:after')).toEqual({ v: 'x' });

		// Exactly one "circuit opened" notice is logged — not one warning per request.
		const openWarnings = warn.mock.calls.filter((c) => String(c[0]).includes('circuit opened'));
		expect(openWarnings).toHaveLength(1);
	});

	it('suppresses SET writes when SETs fail but GETs stay healthy (shared breaker stays closed)', async () => {
		// Production failure mode: a degraded Upstash fails the large best-effort
		// SETs while GETs stay fast. Each healthy GET resets the shared breaker's
		// consecutive-failure counter, so it never opens — yet without a SET-path
		// gate every SET keeps paying a stall and logging. The SET gate must trip on
		// its own streak and then stop touching the network for writes.
		//
		// Fresh module instance so the previous test's tripped breaker/suppression
		// (module-level state) doesn't leak in and pre-arm this scenario.
		vi.resetModules();
		const { cacheGet, cacheSet } = await import('../api/_lib/cache.js');
		const isSet = (init) => {
			try { return JSON.parse(init.body)[0] === 'SET'; } catch { return false; }
		};
		const fetchMock = vi.fn(async (_url, init) => {
			if (isSet(init)) throw new Error('The operation was aborted due to timeout');
			// GET succeeds (Upstash returns { result: <raw> }); null result = miss.
			return { ok: true, json: async () => ({ result: null }) };
		});
		globalThis.fetch = fetchMock;
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		// Interleave a healthy GET before each failing SET so the SHARED breaker's
		// consecutive counter is reset every iteration and never reaches its
		// threshold — isolating the SET-path gate.
		for (let i = 0; i < 5; i++) {
			await cacheGet(`setgate:get:${i}`);
			await cacheSet(`setgate:set:${i}`, { v: i }, 30);
		}
		// The shared breaker never opened (GETs kept it closed).
		const noOpen = warn.mock.calls.filter((c) => String(c[0]).includes('circuit opened'));
		expect(noOpen).toHaveLength(0);
		// The SET gate tripped exactly once after its 5 consecutive failures.
		const suppress = warn.mock.calls.filter((c) => String(c[0]).includes('suppressing cache writes'));
		expect(suppress).toHaveLength(1);

		// Writes are now suppressed: a further SET must NOT hit the network, but a
		// GET still must (reads stay live throughout a write outage).
		const callsBefore = fetchMock.mock.calls.length;
		await cacheSet('setgate:after', { v: 'x' }, 30);
		expect(fetchMock).toHaveBeenCalledTimes(callsBefore); // SET skipped the network
		await cacheGet('setgate:after-get');
		expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore); // GET still went out
	});
});
