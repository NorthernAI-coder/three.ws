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

import { Redis } from '@upstash/redis';
import { env } from './env.js';

let _instance = undefined; // undefined = not yet resolved; null = checked, absent

export function getRedis() {
	if (_instance !== undefined) return _instance;
	if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
		_instance = new Redis({
			url: env.UPSTASH_REDIS_REST_URL,
			token: env.UPSTASH_REDIS_REST_TOKEN,
		});
	} else {
		_instance = null;
	}
	return _instance;
}
