// Neon serverless Postgres. HTTP-based, works in edge + node runtimes.
// Use `sql` as a tagged template for queries: sql`SELECT … WHERE id = ${id}`.
//
// Fragment composition
// --------------------
// The raw `@neondatabase/serverless` tagged template does NOT compose: if you
// interpolate the result of another `sql`…`` call into a query it binds that
// object as a positional parameter, emitting invalid SQL like `… 2) $3 $4 …`
// (Postgres: `syntax error at or near "$3"`). Several endpoints rely on the
// natural pattern of building conditional `sql`…`` fragments and splicing them
// into a parent query (dynamic WHERE clauses, `reduce`-built UPDATE SET lists),
// so this wrapper makes that pattern correct: an interpolated fragment is
// flattened inline and its placeholders are renumbered against the parent. A
// fragment stays fully compatible with `sql.transaction([...])` (it carries the
// `NeonQueryPromise` tag plus a prepared `parameterizedQuery`/`opts`) and is a
// thenable, so `await`, `.catch`, `.finally`, and `Promise.all` all behave
// exactly as before for non-fragment queries.

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
// booleans, Buffers/bytea, null, jsonb objects) pass through untouched.
function stripNul(v) {
	return typeof v === 'string' && v.includes('\u0000') ? v.replace(/\u0000/g, '') : v;
}

// Brand identifying a composable fragment produced by this wrapper.
const FRAGMENT = Symbol('neonSqlFragment');

function isFragment(v) {
	return v != null && typeof v === 'object' && v[FRAGMENT] === true;
}

// Flatten a tagged-template (strings + interpolated values) into a single
// parameterized query. Nested fragments are spliced inline — their own values
// are recursively appended and every placeholder is renumbered against the
// flattened param list. Non-fragment values become `$N` placeholders. NULs are
// stripped from string params here, before Neon's `prepareValue` runs.
function composeFragment(strings, values) {
	let query = '';
	const params = [];
	const walk = (strs, vals) => {
		for (let i = 0; i < strs.length; i++) {
			query += strs[i];
			if (i < vals.length) {
				const v = vals[i];
				if (isFragment(v)) {
					walk(v.strings, v.values);
				} else {
					params.push(stripNul(v));
					query += '$' + params.length;
				}
			}
		}
	};
	walk(strings, values);
	return { query, params };
}

// A fragment is a lazy, composable stand-in for a NeonQueryPromise. It holds the
// raw template pieces so a parent query can splice it, and only builds the
// underlying Neon query (via the function form, which prepares params and stays
// lazy until awaited) the first time it is executed, inspected for its
// `parameterizedQuery`, or read for `opts` — i.e. when used standalone or inside
// `sql.transaction([...])`.
function makeFragment(strings, values) {
	let native;
	const toNative = () => {
		if (!native) {
			const { query, params } = composeFragment(strings, values);
			native = getSql()(query, params);
		}
		return native;
	};
	return {
		[FRAGMENT]: true,
		[Symbol.toStringTag]: 'NeonQueryPromise',
		strings,
		values,
		get parameterizedQuery() { return toNative().parameterizedQuery; },
		get opts() { return toNative().opts; },
		then(onFulfilled, onRejected) { return toNative().then(onFulfilled, onRejected); },
		catch(onRejected) { return toNative().catch(onRejected); },
		finally(onFinally) { return toNative().finally(onFinally); },
	};
}

export const sql = new Proxy(function () {}, {
	apply(_t, _this, args) {
		// Neon dispatches on the first argument: a string is the ordinary
		// function form `sql(queryText, params, opts)`; anything else is a
		// tagged-template call where the first arg is the strings array.
		if (typeof args[0] === 'string') {
			const [queryText, params, opts] = args;
			const safeParams = Array.isArray(params) ? params.map(stripNul) : params;
			return getSql()(queryText, safeParams, opts);
		}
		return makeFragment(args[0], args.slice(1));
	},
	get(_t, prop) {
		return getSql()[prop];
	},
});
