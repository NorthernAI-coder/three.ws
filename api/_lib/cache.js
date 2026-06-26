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

// Resolve which Upstash store the cache talks to. Prefer a dedicated cache store
// (UPSTASH_CACHE_REST_*) so the large, best-effort cache writes never contend with —
// or burn the command quota of — the fail-closed rate limiter, which lives on
// UPSTASH_REDIS_REST_* (api/_lib/redis.js). Fall back to the shared store for
// back-compat, then to in-memory. Resolved per call: it's a couple of cheap env
// reads, and resolving fresh avoids pinning stale config across env changes in tests.
function cacheTarget() {
	if (env.UPSTASH_CACHE_REST_URL && env.UPSTASH_CACHE_REST_TOKEN) {
		return { url: env.UPSTASH_CACHE_REST_URL, token: env.UPSTASH_CACHE_REST_TOKEN, dedicated: true };
	}
	if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
		return { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, dedicated: false };
	}
	return null;
}

function redisConfigured() {
	return cacheTarget() !== null;
}

// A cache round-trip must be fast or not happen at all. Without a timeout a
// Upstash TCP stall (as opposed to a clean 5xx, which rejects promptly) would hang
// the fetch until the caller's function hits its hard maxDuration → a 504 on an
// endpoint whose whole point in calling us was to be fast. Cap every command so a
// degraded Redis fails fast into the in-memory fallback instead of stalling the
// request. 3s is far longer than a healthy REST GET/SET yet well under any caller's
// budget.
const REDIS_CMD_TIMEOUT_MS = 3_000;

// Circuit breaker around the Upstash REST call. A degraded store (commands
// timing out at REDIS_CMD_TIMEOUT_MS rather than rejecting promptly) otherwise
// makes EVERY request pay a full 3s stall before falling back to memory, and
// emits one identical "redis SET failed" warning per request — the exact flood
// seen in production on hot endpoints like /api/galaxy/flows. After
// CIRCUIT_FAIL_THRESHOLD consecutive command failures we OPEN the circuit: for
// CIRCUIT_COOLDOWN_MS every command short-circuits straight to the memory
// fallback (no fetch, no per-request warning). Once the cooldown elapses the
// circuit goes half-open and lets exactly one trial command through — its
// success closes the circuit (Redis restored), its failure re-arms the cooldown.
// Net cost of a Redis outage: one "opened" log + one trial per 30s, instead of a
// 3s-stall-plus-warning on every single request.
const CIRCUIT_FAIL_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 60_000;
let circuitFailures = 0;
let circuitOpenUntil = 0; // epoch ms; 0 = closed
let circuitTrialInFlight = false;

// Thrown when the circuit is open. Callers treat it as a normal cache miss but
// skip the per-request warning, since the open/close transitions log once each.
class CircuitOpenError extends Error {
	constructor() {
		super('cache redis circuit open');
		this.circuitOpen = true;
	}
}

function circuitAllows() {
	if (circuitOpenUntil === 0) return true; // closed — normal operation
	if (Date.now() < circuitOpenUntil) return false; // open — fail fast to memory
	// Cooldown elapsed → half-open: admit a single trial, hold everyone else back.
	if (circuitTrialInFlight) return false;
	circuitTrialInFlight = true;
	return true;
}

function circuitRecordSuccess() {
	if (circuitOpenUntil !== 0) console.warn('[cache] redis recovered — circuit closed');
	circuitFailures = 0;
	circuitOpenUntil = 0;
	circuitTrialInFlight = false;
}

function circuitRecordFailure() {
	circuitTrialInFlight = false;
	if (circuitOpenUntil !== 0) {
		// A half-open trial failed — Redis still down, re-arm the cooldown.
		circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
		return;
	}
	circuitFailures++;
	if (circuitFailures >= CIRCUIT_FAIL_THRESHOLD) {
		circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
		console.warn(
			`[cache] redis degraded — circuit opened for ${CIRCUIT_COOLDOWN_MS / 1000}s after ${circuitFailures} consecutive failures; serving from memory`,
		);
	}
}

// Throttled warning for the memory-fallback paths. When Upstash is sustainedly
// degraded in a way the circuit breaker does NOT trip — the production case is a
// slow SET path interleaved with fast, healthy GETs: each request's successful
// GET resets the consecutive-failure counter before the SET timeout can push it
// to the threshold, so the breaker stays (correctly) closed to keep serving cache
// hits, yet every SET still logs — the per-request "redis SET failed" line floods
// the logs (hundreds per export window for one hot endpoint). The breaker should
// not open here (GETs are healthy and worth keeping), so the fix is at the log:
// collapse repeats of the same category to one line per WARN_THROTTLE_MS, with a
// suppressed-count digest so a sustained outage stays visible without the flood.
const WARN_THROTTLE_MS = 60_000;
const warnState = new Map(); // category -> { lastAt, suppressed }

function warnThrottled(category, message) {
	const now = Date.now();
	const st = warnState.get(category) || { lastAt: 0, suppressed: 0 };
	if (now - st.lastAt < WARN_THROTTLE_MS) {
		st.suppressed++;
		warnState.set(category, st);
		return;
	}
	const tail = st.suppressed > 0 ? ` (+${st.suppressed} more in last ${Math.round((now - st.lastAt) / 1000)}s)` : '';
	console.warn(message + tail);
	warnState.set(category, { lastAt: now, suppressed: 0 });
}

async function redisCmd(args) {
	const target = cacheTarget();
	if (!target) throw new Error('cache redis not configured');
	if (!circuitAllows()) throw new CircuitOpenError();
	try {
		const r = await fetch(target.url, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${target.token}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify(args),
			signal: AbortSignal.timeout(REDIS_CMD_TIMEOUT_MS),
		});
		if (!r.ok) throw new Error(`upstash ${r.status}: ${await r.text().catch(() => '')}`);
		const json = await r.json();
		if (json.error) throw new Error(`upstash error: ${json.error}`);
		circuitRecordSuccess();
		return json.result;
	} catch (err) {
		circuitRecordFailure();
		throw err;
	}
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
			if (!err?.circuitOpen) warnThrottled('GET', `[cache] redis GET failed, using memory fallback: ${err?.message}`);
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
		if (!err?.circuitOpen) warnThrottled('SET', `[cache] redis SET failed, using memory fallback: ${err?.message}`);
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

/**
 * Best-effort cross-instance lock built on Redis `SET key val NX EX`. Returns
 * true if THIS caller acquired the lock, false if someone else holds it. Use to
 * coordinate an expensive recompute (a full on-chain scan, a snapshot rebuild)
 * across serverless instances so a traffic spike against a cold cache fans out
 * into ONE recompute platform-wide instead of N.
 *
 * The TTL is a safety valve: if the lock holder's lambda dies mid-work, the lock
 * auto-expires so the work isn't wedged forever — size it longer than the work
 * takes. When Redis is unavailable we return true (degrade to "no cross-instance
 * coordination"); pair with an in-process single-flight for the common case.
 *
 * @param {string} key
 * @param {number} ttlSeconds
 * @returns {Promise<boolean>}
 */
export async function acquireLock(key, ttlSeconds) {
	if (!redisConfigured()) return true;
	try {
		const res = await redisCmd(['SET', key, '1', 'NX', 'EX', String(ttlSeconds)]);
		return res === 'OK';
	} catch (err) {
		if (!err?.circuitOpen) warnThrottled('acquireLock', `[cache] acquireLock failed, proceeding without lock: ${err?.message}`);
		return true;
	}
}

/**
 * Release a lock taken with acquireLock. Best-effort — a failed release just
 * leaves the lock to expire on its TTL.
 * @param {string} key
 */
export async function releaseLock(key) {
	if (!redisConfigured()) return;
	try {
		await redisCmd(['DEL', key]);
	} catch {
		/* lock will expire on its own TTL */
	}
}

/**
 * Read-through cache: return the cached value for `key`, or compute it with
 * `fn()`, store it for `ttlSeconds`, and return it. Use to shield expensive but
 * staleness-tolerant work (full-table COUNT(*) aggregates, leaderboards) from
 * every request — at 100x traffic these are the queries that fall over.
 *
 * `null`/`undefined` results are NOT cached (so a transient failure isn't pinned
 * as "no data"); a thrown `fn` propagates and caches nothing.
 *
 * @template T
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function cacheWrap(key, ttlSeconds, fn) {
	const hit = await cacheGet(key);
	if (hit !== null && hit !== undefined) return hit;
	const value = await fn();
	if (value !== null && value !== undefined) {
		// Don't block the response on the write-back. The value is already in hand;
		// the cache is an optimization, not part of the result. Awaiting here put a
		// degraded Upstash (writes timing out at REDIS_CMD_TIMEOUT_MS) directly on
		// the request's critical path — up to 3s of dead latency per miss for a SET
		// that then falls back to memory anyway. cacheSet swallows its own errors
		// (never rejects), so fire-and-forget is safe; the .catch is belt-and-braces.
		cacheSet(key, value, ttlSeconds).catch(() => {});
	}
	return value;
}
