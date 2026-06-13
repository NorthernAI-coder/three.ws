// Shared cache adapter — Upstash Redis (REST) primary, in-memory fallback.
//
// Why: Vercel serverless functions are stateless per-instance. Our previous
// in-memory Map cache was wiped on every cold start, which is *most* requests
// under low traffic. Upstash REST works on edge + node, no socket pooling,
// and the free tier (10k cmd/day) easily covers our portfolio/balances volume.
//
// Falls back to in-memory transparently when UPSTASH_REDIS_REST_URL is unset,
// so dev + tests need no extra config.
//
// Env:
//   UPSTASH_REDIS_REST_URL    — https://<region>.upstash.io
//   UPSTASH_REDIS_REST_TOKEN  — REST API token (read+write)
//   (resolved through _lib/env.js, which also accepts the Vercel-marketplace
//   names three_KV_REST_API_URL/TOKEN and KV_REST_API_URL/TOKEN)

import { env } from './env.js';

const memCache = new Map();
const MEM_DEFAULT_TTL_MS = 60_000;

// Short read-through memo, in front of Redis even when Redis is configured.
// A warm serverless instance often serves a burst of identical hot reads
// (trending, token config, marketplace listings) within a second or two; without
// this, each one spends a Redis GET and at platform scale that volume alone can
// exhaust the Upstash request quota. We hold the last value for MEMO_TTL_MS so
// repeated reads collapse to a single Redis round-trip per key per window. Writes
// (cacheSet/cacheDel) refresh/clear the memo so we never serve a value we just
// overwrote. Bounded: a few seconds of staleness on cache data is invisible.
const readMemo = new Map();
const MEMO_TTL_MS = 2_000;
const MEMO_MAX_ENTRIES = 5_000; // backstop against unbounded key cardinality

// In-flight GET coalescing. The read-memo above only collapses *sequential*
// reads; under a burst (the exact load that exhausts the Upstash request quota)
// N concurrent reads of the same hot key all miss the not-yet-populated memo and
// each fire their own Redis GET. Single-flight makes those N callers await one
// shared round-trip instead. Self-bounded: an entry lives only while its GET is
// in flight and is removed in `finally`.
const inflightGets = new Map();

function memoGet(key) {
	const hit = readMemo.get(key);
	if (!hit) return undefined; // undefined = no memo; null is a cached "miss"
	if (Date.now() > hit.expiresAt) {
		readMemo.delete(key);
		return undefined;
	}
	return hit.value;
}
function memoPut(key, value) {
	if (readMemo.size >= MEMO_MAX_ENTRIES) readMemo.clear();
	readMemo.set(key, { value, expiresAt: Date.now() + MEMO_TTL_MS });
}

function memSet(key, value, ttlSeconds) {
	const ttlMs = (ttlSeconds && ttlSeconds * 1000) || MEM_DEFAULT_TTL_MS;
	memCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}
function memGet(key) {
	const hit = memCache.get(key);
	if (!hit) return null;
	if (Date.now() > hit.expiresAt) {
		memCache.delete(key);
		return null;
	}
	return hit.value;
}
function memDel(key) {
	memCache.delete(key);
}

function redisConfigured() {
	return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisCmd(args) {
	const r = await fetch(env.UPSTASH_REDIS_REST_URL, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify(args),
	});
	if (!r.ok) throw new Error(`upstash ${r.status}: ${await r.text().catch(() => '')}`);
	const json = await r.json();
	if (json.error) throw new Error(`upstash error: ${json.error}`);
	return json.result;
}

export async function cacheGet(key) {
	if (!redisConfigured()) return memGet(key);
	const memo = memoGet(key);
	if (memo !== undefined) return memo;
	// Join an in-flight GET for this key rather than issuing a duplicate.
	const pending = inflightGets.get(key);
	if (pending) return pending;
	const p = (async () => {
		try {
			const raw = await redisCmd(['GET', key]);
			const value = raw == null ? null : JSON.parse(raw);
			memoPut(key, value);
			return value;
		} catch (err) {
			console.warn('[cache] redis GET failed, using memory fallback:', err?.message);
			return memGet(key);
		} finally {
			inflightGets.delete(key);
		}
	})();
	inflightGets.set(key, p);
	return p;
}

export async function cacheSet(key, value, ttlSeconds = 60) {
	if (!redisConfigured()) return memSet(key, value, ttlSeconds);
	try {
		const payload = JSON.stringify(value);
		await redisCmd(['SET', key, payload, 'EX', String(ttlSeconds)]);
		memoPut(key, value); // keep the memo coherent with what we just wrote
	} catch (err) {
		console.warn('[cache] redis SET failed, using memory fallback:', err?.message);
		readMemo.delete(key);
		memSet(key, value, ttlSeconds);
	}
}

export async function cacheDel(key) {
	readMemo.delete(key);
	if (!redisConfigured()) return memDel(key);
	try {
		await redisCmd(['DEL', key]);
	} catch {
		memDel(key);
	}
}

export function cacheBackend() {
	return redisConfigured() ? 'upstash' : 'memory';
}
