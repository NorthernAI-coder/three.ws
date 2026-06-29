/**
 * env.js Postgres connection-string resolution — unit test.
 *
 * The Vercel Postgres / Neon Marketplace integration injects the live
 * connection string under names OTHER than the bare DATABASE_URL the code reads
 * (POSTGRES_URL, DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING,
 * NEON_DATABASE_URL, POSTGRES_PRISMA_URL). When the integration is attached but
 * DATABASE_URL was never mirrored by hand, every DB-backed read threw
 * "Missing required env var: DATABASE_URL" and the whole data plane degraded to
 * empty (the June 2026 incident). env.DATABASE_URL now resolves from any of
 * those aliases — in priority order, trimming dashboard paste artifacts and
 * requiring a postgres(ql):// scheme — and databaseConfigured() mirrors it for
 * the store-module gates. This pins that contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, databaseConfigured } from '../api/_lib/env.js';

const KEYS = [
	'DATABASE_URL',
	'POSTGRES_URL',
	'DATABASE_URL_UNPOOLED',
	'POSTGRES_URL_NON_POOLING',
	'NEON_DATABASE_URL',
	'POSTGRES_PRISMA_URL',
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

describe('env.DATABASE_URL connection-string resolution', () => {
	it('uses the bare DATABASE_URL when set', () => {
		process.env.DATABASE_URL = 'postgresql://u:p@db.neon.tech/main';
		expect(env.DATABASE_URL).toBe('postgresql://u:p@db.neon.tech/main');
		expect(databaseConfigured()).toBe(true);
	});

	it('resolves from POSTGRES_URL when DATABASE_URL is absent (Vercel Postgres integration)', () => {
		process.env.POSTGRES_URL = 'postgres://u:p@pooler.neon.tech/main';
		expect(env.DATABASE_URL).toBe('postgres://u:p@pooler.neon.tech/main');
		expect(databaseConfigured()).toBe(true);
	});

	it('resolves from DATABASE_URL_UNPOOLED / NEON_DATABASE_URL aliases', () => {
		process.env.NEON_DATABASE_URL = 'postgresql://u:p@db.neon.tech/main';
		expect(env.DATABASE_URL).toBe('postgresql://u:p@db.neon.tech/main');
	});

	it('prefers the canonical name over a lower-priority alias', () => {
		process.env.DATABASE_URL = 'postgresql://primary@db/main';
		process.env.POSTGRES_URL = 'postgresql://alias@db/main';
		expect(env.DATABASE_URL).toBe('postgresql://primary@db/main');
	});

	it('trims a dashboard-pasted trailing newline (would otherwise break neon())', () => {
		process.env.DATABASE_URL = 'postgresql://u:p@db.neon.tech/main\n';
		expect(env.DATABASE_URL).toBe('postgresql://u:p@db.neon.tech/main');
	});

	it('ignores a non-postgres value on a higher-priority name and falls through', () => {
		// A stray/garbage value on DATABASE_URL must not shadow a real URL on an alias.
		process.env.DATABASE_URL = 'not-a-connection-string';
		process.env.POSTGRES_URL = 'postgresql://u:p@db.neon.tech/main';
		expect(env.DATABASE_URL).toBe('postgresql://u:p@db.neon.tech/main');
	});

	it('throws the unchanged "Missing required env var" message when no source is set', () => {
		expect(() => env.DATABASE_URL).toThrow('Missing required env var: DATABASE_URL');
		expect(databaseConfigured()).toBe(false);
	});
});
