/**
 * env.js Upstash credential hygiene — unit test.
 *
 * A trailing newline or stray space on UPSTASH_REDIS_REST_TOKEN (the classic
 * Vercel/Upstash dashboard paste artifact) lands verbatim in the
 * `Authorization: Bearer <token>` header the @upstash/redis client sends, which
 * Upstash rejects as "WRONGPASS invalid or missing auth token" — while the URL
 * still resolves, so every limiter fails closed and the usage buffer + caches go
 * silently dark. The getters trim at the source so no consumer ever sees the
 * whitespace. This pins that, plus the whitespace-only-primary fall-through to the
 * Vercel-KV marketplace aliases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env } from '../api/_lib/env.js';

const KEYS = [
	'UPSTASH_REDIS_REST_URL',
	'UPSTASH_REDIS_REST_TOKEN',
	'three_KV_REST_API_URL',
	'three_KV_REST_API_TOKEN',
	'KV_REST_API_URL',
	'KV_REST_API_TOKEN',
	'UPSTASH_CACHE_REST_URL',
	'UPSTASH_CACHE_REST_TOKEN',
	'cache_KV_REST_API_URL',
	'cache_KV_REST_API_TOKEN',
];
let saved;

beforeEach(() => {
	saved = {};
	for (const k of KEYS) {
		saved[k] = process.env[k];
		delete process.env[k];
	}
});

afterEach(() => {
	for (const k of KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
});

describe('env Upstash credential trimming', () => {
	it('strips a trailing newline from the REST token (the WRONGPASS cause)', () => {
		process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
		process.env.UPSTASH_REDIS_REST_TOKEN = 'AX1ssecret-token\n';
		expect(env.UPSTASH_REDIS_REST_TOKEN).toBe('AX1ssecret-token');
	});

	it('strips surrounding whitespace from the REST url', () => {
		process.env.UPSTASH_REDIS_REST_URL = '  https://example.upstash.io \n';
		process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
		expect(env.UPSTASH_REDIS_REST_URL).toBe('https://example.upstash.io');
	});

	it('returns undefined for a blank/whitespace-only value', () => {
		process.env.UPSTASH_REDIS_REST_TOKEN = '   \n';
		expect(env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
	});

	it('falls through to the Vercel-KV alias when the primary is whitespace-only', () => {
		process.env.UPSTASH_REDIS_REST_TOKEN = '   ';
		process.env.KV_REST_API_TOKEN = 'alias-token\n';
		expect(env.UPSTASH_REDIS_REST_TOKEN).toBe('alias-token');
	});

	it('trims the dedicated cache store credentials and their aliases', () => {
		process.env.UPSTASH_CACHE_REST_URL = ' ';
		process.env.cache_KV_REST_API_URL = 'https://cache.upstash.io\n';
		process.env.cache_KV_REST_API_TOKEN = '  cache-tok  ';
		expect(env.UPSTASH_CACHE_REST_URL).toBe('https://cache.upstash.io');
		expect(env.UPSTASH_CACHE_REST_TOKEN).toBe('cache-tok');
	});

	it('leaves a clean token untouched', () => {
		process.env.UPSTASH_REDIS_REST_TOKEN = 'AX1sclean';
		expect(env.UPSTASH_REDIS_REST_TOKEN).toBe('AX1sclean');
	});
});
