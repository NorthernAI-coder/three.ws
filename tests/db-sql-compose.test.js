// Unit tests for the composable `sql` wrapper in api/_lib/db.js.
//
// The raw @neondatabase/serverless tagged template does NOT compose nested
// fragments — interpolating one `sql`…`` result into another binds it as a
// positional parameter and emits invalid SQL (`… 2) $3 $4 …` → Postgres
// `syntax error at or near "$3"`). Our wrapper flattens fragments inline and
// renumbers placeholders. These tests assert the generated `parameterizedQuery`
// without touching a database — DATABASE_URL only needs to be a syntactically
// valid connection string so neon() can instantiate lazily.

import { describe, it, expect, beforeAll } from 'vitest';

let sql;
beforeAll(async () => {
	process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://u:p@localhost/db';
	({ sql } = await import('../api/_lib/db.js'));
});

describe('sql fragment composition', () => {
	it('builds a plain parameterized query with no fragments', () => {
		expect(sql`select * from t where id = ${5}`.parameterizedQuery).toEqual({
			query: 'select * from t where id = $1',
			params: ['5'],
		});
	});

	it('splices conditional WHERE fragments and renumbers placeholders (oracle/wins pattern)', () => {
		const tier = 'prime';
		const days = 30;
		const before = null;
		const tierFilter = tier !== 'all' ? sql`and c.tier = ${tier}` : sql``;
		const periodFilter =
			days != null ? sql`and c.scored_at >= now() - (${days} || ' days')::interval` : sql``;
		const beforeFilter = before ? sql`and c.scored_at < ${before}::timestamptz` : sql``;

		const { query, params } = sql`
			select * from oracle_conviction c
			where c.network = ${'mainnet'}
			  and o.ath_multiple >= ${2}
			  ${tierFilter}
			  ${periodFilter}
			  ${beforeFilter}
			limit ${50}
		`.parameterizedQuery;

		// Every placeholder is sequential and contiguous — no bare `$N` gaps.
		expect(params).toEqual(['mainnet', '2', 'prime', '30', '50']);
		expect(query).toContain('c.network = $1');
		expect(query).toContain('o.ath_multiple >= $2');
		expect(query).toContain('c.tier = $3');
		expect(query).toContain("($4 || ' days')::interval");
		expect(query).toContain('limit $5');
		// The empty `beforeFilter` contributes nothing.
		expect(query).not.toContain('$6');
	});

	it('drops empty fragments entirely', () => {
		expect(sql`select 1 ${sql``} ${sql``}`.parameterizedQuery).toEqual({
			query: 'select 1  ',
			params: [],
		});
	});

	it('composes a reduce-built SET clause with deep nesting (mocap/animations PATCH pattern)', () => {
		const sets = [
			sql`avatar_id = ${'av1'}`,
			sql`price_amount = ${100}`,
			sql`price_currency = ${'USDC'}`,
		];
		const setClause = sets.reduce(
			(acc, s, i) => (i === 0 ? sql`set ${s}` : sql`${acc}, ${s}`),
			sql``
		);
		expect(sql`update t ${setClause} where id = ${'x'} returning *`.parameterizedQuery).toEqual({
			query: 'update t set avatar_id = $1, price_amount = $2, price_currency = $3 where id = $4 returning *',
			params: ['av1', '100', 'USDC', 'x'],
		});
	});

	it('keeps fragments compatible with sql.transaction([...])', () => {
		const f = sql`insert into t(a) values (${1})`;
		// Neon's transaction() rejects anything whose toStringTag !== 'NeonQueryPromise'.
		expect(Object.prototype.toString.call(f)).toBe('[object NeonQueryPromise]');
		expect(f.parameterizedQuery).toEqual({ query: 'insert into t(a) values ($1)', params: ['1'] });
		expect(f.opts).toBeUndefined();
	});

	it('exposes thenable methods so await/.catch/.finally still work', () => {
		const f = sql`select 1`;
		expect(typeof f.then).toBe('function');
		expect(typeof f.catch).toBe('function');
		expect(typeof f.finally).toBe('function');
	});

	it('strips NUL bytes from string params at the boundary', () => {
		expect(sql`select ${'a\u0000b'}`.parameterizedQuery).toEqual({
			query: 'select $1',
			params: ['ab'],
		});
	});

	it('passes ordinary function-form calls straight through', () => {
		expect(sql('select $1::int', [7]).parameterizedQuery).toEqual({
			query: 'select $1::int',
			params: ['7'],
		});
	});
});
