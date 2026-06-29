// Shared Upstash Redis singleton. Import this instead of constructing a new
// Redis() in each module — every module constructing its own client is a
// separate HTTP connection pool entry and burns quota independently, which
// caused the June 2026 500k/mo blowout. One instance, shared across all callers
// within a single Vercel function invocation.
//
// Callers that need fail-closed / fail-open behavior on absence should check
// the returned value: `getRedis()` returns null when Upstash is not configured.
//
// Usage:
//   import { getRedis } from './redis.js';
//   const r = getRedis();
//   if (!r) { /* fallback */ }
//
// Auth-failure fast-fail breaker
// ------------------------------
// A WRONGPASS / "invalid or missing auth token" / NOPERM / NOAUTH response is a
// PERMANENT, config-level failure (a rotated or stale UPSTASH_REDIS_REST_TOKEN),
// not the transient outage the per-consumer fallbacks were written for. Without a
// breaker, every limiter, the usage buffer, the x402 feed and ~50 other consumers
// keep issuing doomed commands on EVERY request: each pays a full Upstash REST
// round-trip (latency + the request-quota the whole module exists to conserve)
// only to fail identically, and each re-logs — the 24k-warning / "operation
// aborted due to timeout" flood seen in production (prod log export 2026-06-28).
//
// So we wrap the client: the first auth failure OPENS a per-instance breaker, and
// for AUTH_BREAKER_COOLDOWN_MS every command short-circuits straight to its
// caller's existing fallback — no fetch, no quota spend, no per-request stall.
// The short-circuit rejection is tagged `circuitOpen` so consumers (cache.js
// already honors this flag; rate-limit / usage / x402-pay now do too) skip their
// own per-request warning. Once the cooldown elapses the breaker goes half-open
// and admits exactly one trial command: its success CLOSES the breaker the instant
// the token is rotated back (self-heal, no redeploy); its failure re-arms the
// cooldown. Net cost of a bad token: one log line + one trial per minute per
// instance, instead of a doomed round-trip on every request.
//
// Only auth failures trip the breaker. Transient errors (timeouts, 5xx) keep the
// existing per-consumer degrade behavior untouched — they are genuinely worth
// retrying, an auth failure never is.

import { Redis } from '@upstash/redis';
import { env } from './env.js';

let _instance = undefined; // undefined = not yet resolved; null = checked, absent

// --- Auth-failure breaker state (per serverless instance) ---
const AUTH_BREAKER_COOLDOWN_MS = Math.max(
	5_000,
	Number(process.env.REDIS_AUTH_BREAKER_COOLDOWN_MS) || 60_000,
);
let authOpenUntil = 0; // epoch ms; 0 = closed (commands flow normally)
let authTrialInFlight = false;

// Auth/permission failures are permanent until the credential changes; only these
// trip the breaker. Upstash surfaces them in the error message body it returns.
function isAuthError(err) {
	const m = String(err?.message || err || '');
	return /WRONGPASS|NOAUTH|NOPERM|invalid or missing auth token|\b401\b|\b403\b/i.test(m);
}

// Thrown when the breaker is open. Tagged `circuitOpen` so consumers treat it as a
// normal "Redis unavailable" fallback WITHOUT emitting a per-request warning (the
// open/recovered transitions each log exactly once). Mirrors the convention the
// cache layer (api/_lib/cache.js) already uses for its own breaker.
class RedisAuthBreakerOpenError extends Error {
	constructor() {
		super('redis auth breaker open (invalid/stale UPSTASH_REDIS_REST_TOKEN)');
		this.name = 'RedisAuthBreakerOpenError';
		this.circuitOpen = true;
		this.authBreakerOpen = true;
	}
}

// Returns true if a command may be issued. Open → false, except once per cooldown
// it admits a single half-open trial to detect a restored credential.
function breakerAllows() {
	if (authOpenUntil === 0) return true;
	if (Date.now() < authOpenUntil) return false;
	if (authTrialInFlight) return false; // a trial is already probing; hold the rest
	authTrialInFlight = true;
	return true;
}

function breakerRecordSuccess() {
	if (authOpenUntil !== 0) {
		console.warn('[redis] auth recovered — UPSTASH_REDIS_REST_TOKEN valid again, commands resumed');
	}
	authOpenUntil = 0;
	authTrialInFlight = false;
}

function breakerRecordFailure(err) {
	const wasTrial = authTrialInFlight;
	authTrialInFlight = false;
	const opening = authOpenUntil === 0;
	authOpenUntil = Date.now() + AUTH_BREAKER_COOLDOWN_MS;
	if (opening && !wasTrial) {
		console.error(
			'[redis] AUTH FAILURE — UPSTASH_REDIS_REST_TOKEN is invalid or stale; ' +
				`fast-failing all Redis commands to in-memory fallbacks for ${AUTH_BREAKER_COOLDOWN_MS / 1000}s ` +
				'(rotate the token in the prod env to restore distributed limiters/cache). Cause:',
			err?.message || err,
		);
	}
}

// Wrap one client method so it participates in the breaker: short-circuit while
// open, record success/auth-failure on settle. Non-auth errors pass through
// untouched (the caller's existing transient-error fallback handles them) and do
// NOT trip or reset the breaker.
function wrapCommand(fn, target) {
	return function (...args) {
		if (!breakerAllows()) return Promise.reject(new RedisAuthBreakerOpenError());
		let out;
		try {
			out = fn.apply(target, args);
		} catch (err) {
			// Synchronous throw (bad args, etc.) — not a transport/auth signal.
			return Promise.reject(err);
		}
		if (!out || typeof out.then !== 'function') return out; // non-promise: pass through
		return Promise.resolve(out).then(
			(res) => {
				breakerRecordSuccess();
				return res;
			},
			(err) => {
				if (isAuthError(err)) breakerRecordFailure(err);
				else if (authTrialInFlight) authTrialInFlight = false; // trial hit a transient error; release the probe slot
				throw err;
			},
		);
	};
}

// pipeline()/multi() return a chainable builder whose commands run on .exec(). We
// don't short-circuit these (low-volume write paths), but we DO let their exec()
// trip/heal the breaker so a bad token is still detected from those paths.
function wrapPipeline(pipe) {
	const exec = pipe.exec;
	if (typeof exec === 'function') {
		pipe.exec = function (...args) {
			return Promise.resolve(exec.apply(pipe, args)).then(
				(res) => {
					breakerRecordSuccess();
					return res;
				},
				(err) => {
					if (isAuthError(err)) breakerRecordFailure(err);
					throw err;
				},
			);
		};
	}
	return pipe;
}

// Methods that build a chain rather than issuing a command immediately.
const CHAIN_BUILDERS = new Set(['pipeline', 'multi']);

function wrapClient(client) {
	const cache = new Map();
	return new Proxy(client, {
		get(target, prop) {
			// Read with `target` as the receiver (not our outer Proxy): the upstash
			// client may itself be an auto-pipelining Proxy whose traps key off the
			// receiver, so handing it back our wrapper would confuse method resolution.
			const value = target[prop];
			if (typeof value !== 'function') return value;
			if (CHAIN_BUILDERS.has(prop)) {
				return function (...args) {
					return wrapPipeline(value.apply(target, args));
				};
			}
			let wrapped = cache.get(prop);
			if (!wrapped) {
				wrapped = wrapCommand(value, target);
				cache.set(prop, wrapped);
			}
			return wrapped;
		},
	});
}

export function getRedis() {
	if (_instance !== undefined) return _instance;
	if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
		_instance = wrapClient(
			new Redis({
				url: env.UPSTASH_REDIS_REST_URL,
				token: env.UPSTASH_REDIS_REST_TOKEN,
			}),
		);
	} else {
		_instance = null;
	}
	return _instance;
}

/**
 * Current auth-breaker state, for health/diagnostics endpoints
 * (api/admin/redis-health.js). `open` true means the shared token is failing and
 * commands are being short-circuited to fallbacks on this instance.
 */
export function redisAuthBreakerState() {
	return {
		open: authOpenUntil !== 0 && Date.now() < authOpenUntil,
		openUntil: authOpenUntil || null,
		cooldownMs: AUTH_BREAKER_COOLDOWN_MS,
	};
}

/** Test-only: reset the breaker between cases. */
export function __resetRedisAuthBreaker() {
	authOpenUntil = 0;
	authTrialInFlight = false;
	_instance = undefined;
}
