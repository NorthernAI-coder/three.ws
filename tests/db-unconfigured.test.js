// Regression: a missing/empty/malformed DATABASE_URL must degrade GRACEFULLY,
// not 500-storm every DB-backed read.
//
// The lazy Neon client is built on first query use, so a bad/absent
// DATABASE_URL throws there — and that throw used to fire SYNCHRONOUSLY inside a
// fragment's `.catch()`/`.then()`, bypassing per-query guards (a `.catch(fn)`
// only runs `fn` on a rejection, never on a throw from `.catch()` itself) and
// landing as an unclassified 500 instead of the intended 503. These tests pin
// the two contracts that keep the platform degrading cleanly:
//   1. `sql\`…\`.catch(fallback)` recovers instead of throwing synchronously.
//   2. The resulting error classifies as db-unavailable → wrap() returns 503.

import { describe, it, expect, beforeAll } from 'vitest';

// Force the unconfigured path BEFORE db.js is imported. `req('DATABASE_URL')`
// throws `Missing required env var: DATABASE_URL` on an empty/unset value.
let sql, sqlValues, isDbUnavailableError;
beforeAll(async () => {
	// env.js now resolves the connection string from DATABASE_URL OR any standard
	// Vercel-Postgres/Neon integration alias, so clearing the bare name alone no
	// longer guarantees the unconfigured path — a developer's .env.local may set
	// POSTGRES_URL etc. Clear every source so this regression is honest everywhere.
	for (const name of [
		'DATABASE_URL',
		'POSTGRES_URL',
		'DATABASE_URL_UNPOOLED',
		'POSTGRES_URL_NON_POOLING',
		'NEON_DATABASE_URL',
		'POSTGRES_PRISMA_URL',
	]) {
		delete process.env[name];
	}
	// Fresh module instance so the lazy client starts uninitialized.
	const mod = await import('../api/_lib/db.js?unconfigured');
	({ sql, sqlValues, isDbUnavailableError } = mod);
});

describe('db.js with an unconfigured DATABASE_URL', () => {
	it('routes a tagged-template construction failure through .catch() instead of throwing synchronously', async () => {
		// The exact oracle/stats shape: a guarded query (whose fallback is a row
		// array) inside Promise.all. The key assertion is that we REACH the fallback
		// at all — a sync throw from `.catch()` would have rejected the Promise.all.
		const [rows] = await Promise.all([
			sql`select count(*) as n from anything`.catch(() => [{ n: 0 }]),
		]);
		expect(rows).toEqual([{ n: 0 }]);
		expect(rows[0].n).toBe(0);
	});

	it('rejects (not throws) from await, so an outer try/catch can handle it', async () => {
		let caught = null;
		try {
			await sql`select 1`;
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(Error);
		expect(isDbUnavailableError(caught)).toBe(true);
	});

	it('routes the function-form sql(query, params) failure through .catch() too', async () => {
		const recovered = await sql('select 1', []).catch(() => 'fallback');
		expect(recovered).toBe('fallback');
	});

	it('classifies the construction failure as db-unavailable (→ graceful 503, not 500)', async () => {
		const err = await sql`select 1`.then(
			() => null,
			(e) => e,
		);
		expect(err).toBeTruthy();
		expect(isDbUnavailableError(err)).toBe(true);
	});

	it('classifies a suspended-Neon-endpoint message (both phrasings)', () => {
		const disabled = Object.assign(new Error('The endpoint has been disabled. Enable it using Neon API and retry.'), {
			name: 'NeonDbError',
		});
		expect(isDbUnavailableError(disabled)).toBe(true);
		const legacy = Object.assign(new Error('endpoint is disabled'), { name: 'NeonDbError' });
		expect(isDbUnavailableError(legacy)).toBe(true);
	});

	it('still surfaces sqlValues build-time validation as a real throw (not masked)', () => {
		expect(() => sqlValues([])).toThrow();
	});
});
