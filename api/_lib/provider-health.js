// Provider-health circuit breaker for the LLM fallback chains.
//
// When an upstream LLM provider rate-limits (429) or errors (5xx / "Provider
// returned error"), one throttle window otherwise turns into dozens of failed
// requests: every incoming request re-picks the same throttled provider as its
// primary, fails, fails over, and re-hits it again on the next request. This
// records a short per-provider cooldown in the shared cache (Upstash Redis when
// configured, in-memory otherwise) so subsequent requests skip a provider that
// is currently throttling and go straight to a healthy one.
//
// Best-effort by design: a cache read/write failure never blocks a chat — the
// helpers swallow errors and degrade to "no cooldown known", which is exactly
// the pre-breaker behaviour.

import { cacheGet, cacheSet } from './cache.js';

const COOLDOWN_PREFIX = 'llm-cooldown:';
// Long enough to ride out a typical per-minute rate-limit window, short enough
// that a provider that has recovered is retried promptly.
const DEFAULT_COOLDOWN_SECONDS = 45;

/**
 * Record that `provider` is unhealthy, so it is skipped for `seconds`. The
 * cache TTL is the cooldown — presence of the key means "in cooldown", and it
 * expires on its own. Fire-and-forget friendly; never throws.
 */
export async function markProviderCooldown(provider, seconds = DEFAULT_COOLDOWN_SECONDS) {
	if (!provider) return;
	try {
		await cacheSet(`${COOLDOWN_PREFIX}${provider}`, { until: Date.now() + seconds * 1000 }, seconds);
	} catch {
		// Cache unavailable — degrade silently to no-cooldown.
	}
}

/**
 * Given a list of provider names, return the Set of those currently in a
 * cooldown window. Reads are coalesced/memoized by the cache layer, so the
 * handful of GETs collapse to roughly one cache round-trip. Never throws.
 */
export async function providersInCooldown(providers) {
	const cooling = new Set();
	await Promise.all(
		providers.map(async (name) => {
			try {
				const hit = await cacheGet(`${COOLDOWN_PREFIX}${name}`);
				if (hit) cooling.add(name);
			} catch {
				// Treat an unreadable key as "not in cooldown".
			}
		}),
	);
	return cooling;
}
