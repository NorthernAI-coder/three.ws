// Shared resilience helpers — thin, reusable wrappers over `cockatiel` so every
// external call (pump.fun, Birdeye, Solana RPC, LLM proxies, …) can get a
// battle-tested circuit breaker + timeout without each endpoint hand-rolling its
// own cooldown flag. ADDITIVE: existing guards stay; this just gives new/raw call
// sites a one-liner to fail fast and degrade gracefully during an upstream outage.
//
// Serverless note: breaker + timeout state is PER-LAMBDA-INSTANCE (cockatiel
// holds it in memory), exactly like the hand-rolled cooldowns it replaces. That
// is the right model for "fail fast on a sick upstream" — it does not need to be
// distributed. Truly shared state (rate limits, holder snapshot lock) stays on
// Redis, untouched.

import {
	circuitBreaker,
	ConsecutiveBreaker,
	handleAll,
	BrokenCircuitError,
	TaskCancelledError,
} from 'cockatiel';

// One breaker per logical upstream name, memoized for the life of the instance so
// repeated failures to the same service accumulate toward the open threshold.
const _breakers = new Map();

function getBreaker(name, { threshold, halfOpenAfterMs }) {
	const key = `${name}:${threshold}:${halfOpenAfterMs}`;
	let b = _breakers.get(key);
	if (!b) {
		b = circuitBreaker(handleAll, {
			halfOpenAfter: halfOpenAfterMs,
			breaker: new ConsecutiveBreaker(threshold),
		});
		_breakers.set(key, b);
	}
	return b;
}

/**
 * Run `fn` behind a named circuit breaker. On success, returns its value. When
 * the breaker is OPEN (recent consecutive failures) the call is rejected
 * instantly without invoking `fn` — so an influx during an upstream outage stops
 * paying the per-request timeout. On an open circuit OR an `fn` failure, resolves
 * to `fallback` (a value, or a function of the error) instead of throwing, so
 * callers degrade gracefully exactly where they already expected a soft failure.
 *
 * @template T
 * @param {string} name                       logical upstream id, e.g. 'pumpfun:creator-fees'
 * @param {() => Promise<T>} fn               the async operation (already timeout-bounded if it does I/O)
 * @param {object} [opts]
 * @param {T | ((err: unknown) => T)} [opts.fallback=null]  value/factory returned on open-circuit or failure
 * @param {number} [opts.threshold=5]         consecutive failures before the circuit opens
 * @param {number} [opts.halfOpenAfterMs=30000] cooldown before a single trial request is allowed through
 * @returns {Promise<T>}
 */
export async function withBreaker(name, fn, opts = {}) {
	const { fallback = null, threshold = 5, halfOpenAfterMs = 30_000 } = opts;
	const breaker = getBreaker(name, { threshold, halfOpenAfterMs });
	try {
		return await breaker.execute(fn);
	} catch (err) {
		// BrokenCircuitError (open), TaskCancelledError (timeout), or the operation's
		// own error — all degrade to the fallback so the caller never hard-fails on
		// a non-critical upstream.
		return typeof fallback === 'function' ? fallback(err) : fallback;
	}
}

/**
 * Whether an error came from the resilience layer short-circuiting (open circuit
 * or a cancelled/timed-out task) rather than the operation itself — useful when a
 * caller wants to log "skipped, upstream cooling down" distinctly from a real error.
 */
export function isCircuitError(err) {
	return err instanceof BrokenCircuitError || err instanceof TaskCancelledError;
}

// Test/ops hook — drop all memoized breakers so a fresh state can be asserted.
export function _resetBreakers() {
	_breakers.clear();
}
