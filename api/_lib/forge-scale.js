// Scaling-control primitives for the /forge generation pipeline. Three protections
// that keep an influx of concurrent generations from:
//   (a) exhausting serverless workers on the BLOCKING free lane,
//   (b) slamming a single provider's account quota in a burst, and
//   (c) paying GPU cost N times over for one identical, already-in-flight request.
//
// All are best-effort and FAIL OPEN: when Upstash Redis is absent (local/dev) or a
// command errors, every primitive degrades to "allow / no-op" so generation keeps
// working. They are protective throttles, not correctness gates — losing them costs
// efficiency under load, never a wrong result. (Contrast the cost/money limiters in
// rate-limit.js, which deliberately fail CLOSED.)
//
// One shared Redis client (redis.js) — never construct another here; per-module
// clients are what caused the June 2026 quota blowout.

import { createHash, randomUUID } from 'node:crypto';
import { getRedis } from './redis.js';

const redis = getRedis();

// ── In-flight request coalescing ─────────────────────────────────────────────
// A viral prompt, a double-click, or a retry storm can submit the identical
// (path, tier, backend, prompt, images) request many times within the same minute.
// Each would otherwise run the full FLUX→reconstruct GPU pipeline independently.
// Instead we map a request fingerprint → the first job handle for a short window;
// duplicate submits within the window return that handle and poll the same job.
// One generation, N viewers. High tier is never coalesced (it is paid/gated per
// caller — see the call site), so this only ever shares free/standard work.

const INFLIGHT_PREFIX = 'fc:inflight:';
const INFLIGHT_TTL_S = 360; // ~ the longest a generation stays pollable end-to-end

// Stable fingerprint of what makes two generations interchangeable. Prompt is
// normalized (trim + lowercase) and image lists are order-independent so the same
// multi-view set in any order collapses to one key. Truncated to 32 hex chars —
// 128 bits of collision resistance is ample for a 6-minute dedup window.
export function forgeRequestHash({ path, tier, backend, prompt, images }) {
	const tierId = typeof tier === 'string' ? tier : tier?.id || '';
	const imgs = Array.isArray(images) ? images.filter(Boolean).slice().sort() : [];
	const basis = JSON.stringify([
		path || '',
		tierId,
		backend || '',
		String(prompt || '').trim().toLowerCase(),
		imgs,
	]);
	return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

// Existing in-flight job handle for this fingerprint, or null. The caller hands the
// returned handle straight back to the client (which polls it), skipping all GPU.
export async function coalesceInFlight(hash) {
	if (!redis || !hash) return null;
	try {
		const v = await redis.get(`${INFLIGHT_PREFIX}${hash}`);
		return typeof v === 'string' && v ? v : null;
	} catch {
		return null;
	}
}

// Record the job handle that now serves this fingerprint. NX so only the FIRST
// writer wins — a later, slower submitter of the same request can't clobber the
// live handle that other clients are already polling. TTL-bounded.
export async function registerInFlight(hash, jobHandle) {
	if (!redis || !hash || !jobHandle) return;
	try {
		await redis.set(`${INFLIGHT_PREFIX}${hash}`, String(jobHandle), {
			nx: true,
			ex: INFLIGHT_TTL_S,
		});
	} catch {
		/* best-effort */
	}
}

// Drop the mapping when a generation fails to start, so the next identical request
// isn't pinned to a dead job for the rest of the TTL window.
export async function clearInFlight(hash) {
	if (!redis || !hash) return;
	try {
		await redis.del(`${INFLIGHT_PREFIX}${hash}`);
	} catch {
		/* best-effort */
	}
}

// ── Bounded-concurrency lease (for the blocking free lane) ────────────────────
// The HuggingFace Spaces lane BLOCKS a serverless worker for up to ~280s per call
// (see huggingface.js HF_INFERENCE_TIMEOUT_MS). Past a few dozen concurrent holds,
// Vercel workers exhaust and the whole /forge function stalls for everyone. This is
// a counted lease implemented as a sorted set of {token → expiry}: expired tokens
// are evicted on every acquire, so a worker killed at the 300s wall (its release()
// never running) can never permanently pin a slot — the lease self-heals. A tiny
// over-admission under a race is acceptable; this is backpressure, not a mutex.

const SLOT_PREFIX = 'fc:slot:';

export async function acquireBlockingSlot(name, { max, ttlMs }) {
	const noop = { ok: true, release: async () => {} };
	if (!redis) return noop; // dev / no-redis: single instance, no fan-out to protect
	const key = `${SLOT_PREFIX}${name}`;
	const token = `${Date.now()}-${randomUUID()}`;
	const now = Date.now();
	try {
		// Evict expired leases, then count live holders.
		await redis.zremrangebyscore(key, 0, now);
		const live = await redis.zcard(key);
		if (live >= max) return { ok: false, release: async () => {} };
		await redis.zadd(key, { score: now + ttlMs, member: token });
		// Safety expiry on the whole set so an idle gate doesn't linger forever.
		await redis.expire(key, Math.ceil(ttlMs / 1000) + 10);
		let released = false;
		return {
			ok: true,
			release: async () => {
				if (released) return;
				released = true;
				try {
					await redis.zrem(key, token);
				} catch {
					/* the TTL will reclaim it */
				}
			},
		};
	} catch {
		// Redis hiccup → fail open. Under an outage we'd rather serve the lane than
		// block every free generation behind a blind gate.
		return noop;
	}
}

// ── Per-provider submit throttle ──────────────────────────────────────────────
// Caps how many generations we hand a single provider account per window, so a
// burst can't blow through (e.g.) the platform Replicate quota and turn into
// account-wide 429s across every user at once. Fixed-window counter — cheap (one
// INCR + occasional EXPIRE), which keeps the Upstash command budget intact. When
// the cap is hit the caller treats it as upstream-unavailable and degrades to the
// free lane, so over-cap traffic is shed gracefully rather than hard-failed.

const SUBMIT_PREFIX = 'fc:psub:';

export async function providerSubmitAllowed(provider, { limit, windowS }) {
	if (!redis) return true;
	const bucket = Math.floor(Date.now() / (windowS * 1000));
	const key = `${SUBMIT_PREFIX}${provider}:${bucket}`;
	try {
		const n = await redis.incr(key);
		if (n === 1) await redis.expire(key, windowS + 1);
		return n <= limit;
	} catch {
		return true;
	}
}

// Tunables, overridable per-deployment via env. Defaults are conservative ceilings
// chosen to protect the worker pool / provider quota without throttling normal use.
function intEnv(name, fallback) {
	const v = typeof process !== 'undefined' ? process.env?.[name] : null;
	const n = v == null || v === '' ? NaN : Number(v);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const SCALE_LIMITS = Object.freeze({
	// Max concurrent blocking HuggingFace Spaces holds across the whole fleet.
	hfConcurrent: intEnv('FORGE_HF_MAX_CONCURRENT', 12),
	// Lease TTL ≥ the function maxDuration so a killed worker's slot always reclaims.
	hfSlotTtlMs: 305_000,
	// Platform Replicate submits per 10s window before we shed to the free lane.
	replicateSubmitLimit: intEnv('FORGE_REPLICATE_SUBMIT_LIMIT', 40),
	replicateSubmitWindowS: 10,
});

// ── Shared circuit breaker ────────────────────────────────────────────────────
// A consecutive-failure breaker whose state lives in Redis so EVERY serverless
// instance sees the same open/closed decision. Without it each instance
// rediscovers a provider outage independently — e.g. the seed cron burns N× the
// retry latency before N instances each open their own in-memory breaker. Falls
// back to a per-instance object when Redis is absent (the behavior callers had
// before this was shared). Counters self-expire so a long-idle breaker clears.

const CIRCUIT_PREFIX = 'fc:circuit:';
const CIRCUIT_TTL_S = 24 * 3600;
const _circuitMem = new Map(); // name -> { failures, openUntil }

function memCircuit(name) {
	let c = _circuitMem.get(name);
	if (!c) {
		c = { failures: 0, openUntil: 0 };
		_circuitMem.set(name, c);
	}
	return c;
}

// Current breaker state: { open, failures, openUntil }.
export async function circuitState(name) {
	if (!redis) {
		const c = memCircuit(name);
		return { open: c.openUntil > Date.now(), failures: c.failures, openUntil: c.openUntil };
	}
	try {
		const [failures, openUntil] = await Promise.all([
			redis.get(`${CIRCUIT_PREFIX}${name}:failures`),
			redis.get(`${CIRCUIT_PREFIX}${name}:openUntil`),
		]);
		const o = Number(openUntil) || 0;
		return { open: o > Date.now(), failures: Number(failures) || 0, openUntil: o };
	} catch {
		// Blind breaker → fail open (treat as closed) so an outage of the limiter
		// store doesn't itself silence the cron.
		return { open: false, failures: 0, openUntil: 0 };
	}
}

// Record one failure; opens the breaker for (failures × baseMs) once threshold is
// reached. Returns the new consecutive-failure count.
export async function circuitRecordFailure(name, { threshold, baseMs }) {
	if (!redis) {
		const c = memCircuit(name);
		c.failures++;
		if (c.failures >= threshold) c.openUntil = Date.now() + c.failures * baseMs;
		return c.failures;
	}
	try {
		const failures = await redis.incr(`${CIRCUIT_PREFIX}${name}:failures`);
		await redis.expire(`${CIRCUIT_PREFIX}${name}:failures`, CIRCUIT_TTL_S);
		if (failures >= threshold) {
			await redis.set(`${CIRCUIT_PREFIX}${name}:openUntil`, String(Date.now() + failures * baseMs), {
				ex: CIRCUIT_TTL_S,
			});
		}
		return failures;
	} catch {
		return 0;
	}
}

// Clear the breaker on a success.
export async function circuitRecordSuccess(name) {
	if (!redis) {
		const c = memCircuit(name);
		c.failures = 0;
		c.openUntil = 0;
		return;
	}
	try {
		await redis.del(`${CIRCUIT_PREFIX}${name}:failures`, `${CIRCUIT_PREFIX}${name}:openUntil`);
	} catch {
		/* best-effort */
	}
}
