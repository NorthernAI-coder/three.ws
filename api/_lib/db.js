// Neon serverless Postgres. HTTP-based, works in edge + node runtimes.
// Use `sql` as a tagged template for queries: sql`SELECT … WHERE id = ${id}`.

import { neon } from '@neondatabase/serverless';
import { env } from './env.js';

// Lazy Neon client — instantiating requires DATABASE_URL. Keeping it lazy lets
// this module be imported (transitively) by endpoints that don't touch the DB
// even when DATABASE_URL isn't configured.
let _sql;
function getSql() {
	if (!_sql) _sql = neon(env.DATABASE_URL);
	return _sql;
}

// Postgres text/varchar/jsonb columns cannot store a NUL byte (U+0000) — any
// parameter containing one makes the driver throw
// `invalid byte sequence for encoding "UTF8": 0x00` (SQLSTATE 22021) and 500s
// the request (seen on /api/explore's search param). NULs only ever reach us
// from corrupt/garbage input, never legitimately, so we strip them from every
// string-typed query parameter at this single boundary rather than dotting
// per-endpoint sanitizers around the codebase. Non-string params (numbers,
// booleans, Buffers/bytea, null, jsonb objects) pass through untouched; the
// template-strings array (args[0]) is never modified.
function stripNulParams(args) {
	if (args.length < 2) return args;
	let mutated = false;
	const out = args.map((v, i) => {
		if (i === 0) return v; // template strings array — leave intact
		if (typeof v === 'string' && v.includes('\u0000')) {
			mutated = true;
			return v.replace(/\u0000/g, '');
		}
		return v;
	});
	return mutated ? out : args;
}

export const sql = new Proxy(function () {}, {
	apply(_t, _this, args) {
		return getSql()(...stripNulParams(args));
	},
	get(_t, prop) {
		return getSql()[prop];
	},
});
