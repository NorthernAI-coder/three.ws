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
});
