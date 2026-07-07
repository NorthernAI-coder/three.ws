// Per-IP daily free-image quota for POST /api/v1/ai/image.
//
// The image endpoint is a free-tier funnel: the first N generations per IP per
// UTC day are served for free (payment bypassed), and callers past the quota
// fall through to the x402 pay-per-image lane. This module owns that counter.
//
// Semantics:
//   • peekFreeQuota(ip)    — READ ONLY. Answers "is this IP still under quota?"
//                            without spending a slot. Called at the access-control
//                            hook, before the image is generated.
//   • consumeFreeQuota(ip) — spend one slot. Called ONLY after an image is
//                            actually delivered, so a validation error, a safety
//                            refusal, or an upstream outage never burns a free
//                            generation the caller didn't receive.
//
// The peek/consume split means the counter fails OPEN: under a burst two
// instances can both peek "allowed" before either consumes, letting a caller
// slip one or two extra free images. That is the correct bias for a free funnel
// (generous, never wrongly charges) — the paid lane and the x402 rail carry the
// money-critical guarantees, not this counter.
//
// Storage: an atomic Redis INCR on a day-stamped key (natural daily reset). When
// Redis is absent (local dev / tests) it degrades to a per-instance in-memory
// map — fine, because without Redis there is no cross-instance state to protect
// and the free tier is not a spend gate.

import { getRedis } from './redis.js';

const redis = getRedis();

// Default free allowance per IP per day. Env-overridable so ops can tune the
// funnel width without a redeploy.
const DEFAULT_FREE_PER_DAY = 5;

export function freePerDay() {
	const raw = process.env.X402_AI_IMAGE_FREE_PER_DAY;
	if (raw == null || String(raw).trim() === '') return DEFAULT_FREE_PER_DAY;
	const n = Number.parseInt(String(raw).trim(), 10);
	return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FREE_PER_DAY;
}

// UTC day stamp (YYYY-MM-DD). Baking it into the key makes the quota reset at
// 00:00 UTC on its own — a new day is a new key, so the count starts at zero
// even before the old key's TTL lapses.
function utcDay(now = new Date()) {
	return now.toISOString().slice(0, 10);
}

function keyFor(ip, day = utcDay()) {
	return `aiimg:free:${ip || 'unknown'}:${day}`;
}

// Seconds until the next UTC midnight, floored to a minute so a key always
// outlives its own day. A generous +1h buffer covers clock skew between the
// counter write and the day rollover.
function ttlSeconds(now = new Date()) {
	const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
	return Math.max(60, Math.ceil((next.getTime() - now.getTime()) / 1000) + 3600);
}

function resetAtIso(now = new Date()) {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)).toISOString();
}

// ── In-memory fallback (no Redis) ────────────────────────────────────────────
// Keyed by the same day-stamped key so it also resets at the UTC boundary.
const memory = new Map();

function memGet(key) {
	const hit = memory.get(key);
	return hit ? hit.count : 0;
}

function memIncr(key, ttlMs) {
	const hit = memory.get(key);
	if (hit && hit.expiresAt > Date.now()) {
		hit.count += 1;
		return hit.count;
	}
	memory.set(key, { count: 1, expiresAt: Date.now() + ttlMs });
	return 1;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Read-only view of an IP's free-image standing for today. Never mutates the
 * counter. Fails open (allowed: true) on any storage error — a Redis hiccup must
 * never wrongly demand payment for a call the free tier should have served.
 *
 * @param {string} ip
 * @returns {Promise<{allowed: boolean, used: number, limit: number, remaining: number, resetAt: string}>}
 */
export async function peekFreeQuota(ip) {
	const limit = freePerDay();
	const key = keyFor(ip);
	let used = 0;
	try {
		used = redis ? Number(await redis.get(key)) || 0 : memGet(key);
	} catch {
		used = 0; // storage unreachable → treat as fresh, fail open
	}
	const remaining = Math.max(0, limit - used);
	return { allowed: used < limit, used, limit, remaining, resetAt: resetAtIso() };
}

/**
 * Spend one free-image slot for an IP and return the post-increment view. Call
 * this only after an image was actually delivered. Atomic under Redis (INCR +
 * first-write EXPIRE); best-effort in-memory otherwise. Never throws — a failed
 * count must not fail an image the caller already received.
 *
 * @param {string} ip
 * @returns {Promise<{used: number, limit: number, remaining: number, resetAt: string}>}
 */
export async function consumeFreeQuota(ip) {
	const limit = freePerDay();
	const key = keyFor(ip);
	let used = 1;
	try {
		if (redis) {
			used = Number(await redis.incr(key));
			// Set the daily TTL exactly once, on the key's first write, so a busy IP
			// doesn't keep pushing the expiry out and never resetting.
			if (used === 1) await redis.expire(key, ttlSeconds());
		} else {
			used = memIncr(key, ttlSeconds() * 1000);
		}
	} catch {
		// Count lost — the image already shipped, so swallow and report a best guess.
	}
	const remaining = Math.max(0, limit - used);
	return { used, limit, remaining, resetAt: resetAtIso() };
}

// Test hook — the in-memory fallback persists across a module's lifetime; tests
// that exercise the no-Redis path need a clean slate.
export function __resetFreeQuota() {
	memory.clear();
}
