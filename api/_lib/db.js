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

// Resolve the Neon client without letting a construction failure escape as a
// SYNCHRONOUS throw. A missing/empty/malformed DATABASE_URL makes the env
// accessor (`Missing required env var: DATABASE_URL`) or neon() throw the first
// time the lazy client is built — and that throw fires inside a fragment's
// `.then`/`.catch`/`.finally`, i.e. while a caller is *attaching* a handler.
// `.catch(fn)` only runs `fn` on a REJECTION, never on a throw from `.catch()`
// itself, so a sync throw there bypasses a per-query guard entirely and 500s an
// endpoint that explicitly degraded the query (e.g. oracle/stats' `.catch(() =>
// [{}])`). Funnelling the failure into the rejection channel makes every
// thenable consumer — `await`, `.then`, `.catch`, `Promise.all` — observe a
// normal rejection, which `isDbUnavailableError` then classifies as a graceful
// 503 instead of a 500 storm.
function getSqlSafe() {
	try {
		return { sql: getSql(), err: null };
	} catch (err) {
		return { sql: null, err };
	}
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
			const { sql: client, err } = getSqlSafe();
			if (err) throw err;
			native = client(query, params);
		}
		return native;
	};
	// Settle into a thenable for the consumer paths. If the Neon client can't be
	// built (DB unconfigured) we hand back a rejected promise rather than throwing
	// synchronously, so a caller's `.catch()`/`.then(_, onRejected)` actually runs
	// and `Promise.all` rejects normally instead of throwing during array build.
	// The `parameterizedQuery`/`opts` getters keep throwing synchronously — they
	// are inspection-only seams (transaction prep, tests) where a sync throw is the
	// expected contract, not a dropped guard.
	const settle = () => {
		try {
			return toNative();
		} catch (err) {
			return Promise.reject(err);
		}
	};
	return {
		[FRAGMENT]: true,
		[Symbol.toStringTag]: 'NeonQueryPromise',
		strings,
		values,
		get parameterizedQuery() { return toNative().parameterizedQuery; },
		get opts() { return toNative().opts; },
		then(onFulfilled, onRejected) { return settle().then(onFulfilled, onRejected); },
		catch(onRejected) { return settle().catch(onRejected); },
		finally(onFinally) { return settle().finally(onFinally); },
	};
}

// Build a composable multi-row `VALUES` fragment for bulk INSERTs:
//   sql`INSERT INTO t (a, b) VALUES ${sqlValues(rows)} ON CONFLICT …`
// where `rows` is an array of equal-length value arrays. Every value becomes a
// `$N` placeholder, renumbered against the parent query by composeFragment, so
// dates/strings/jsonb are bound as parameters — never stringified into the SQL
// text. This replaces the postgres.js-style `SELECT * FROM ${sql(rows)}` idiom,
// which the Neon wrapper does NOT support: it would stringify each row array
// inline (a Date's ISO `:` then triggering `syntax error at or near ":"`).
export function sqlValues(rows) {
	if (!Array.isArray(rows) || rows.length === 0) {
		throw new Error('sqlValues requires a non-empty array of row arrays');
	}
	const width = rows[0].length;
	if (width === 0) throw new Error('sqlValues rows must have at least one column');
	const strings = [];
	const values = [];
	let pending = '';
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r];
		if (!Array.isArray(row) || row.length !== width) {
			throw new Error('sqlValues: every row must be an array of the same width');
		}
		pending += r === 0 ? '(' : '), (';
		for (let c = 0; c < width; c++) {
			strings.push(pending);
			pending = c < width - 1 ? ', ' : '';
			values.push(row[c]);
		}
	}
	pending += ')';
	strings.push(pending);
	return makeFragment(strings, values);
}

// Returns true when the error is a Neon connectivity failure that is
// transient and credential-level — password auth failures, TCP connection
// refused, SSL handshake errors. These map to HTTP 503 (not 500): the server
// is temporarily unable to service the request, not broken internally.
// Callers should not emit per-endpoint ops alerts on these; a single
// DB-unavailable alert per hour is enough.
export function isDbUnavailableError(err) {
	if (!err) return false;
	// esbuild minifies class names (e.g. NeonDbError → Pt in the bundle), so
	// err.constructor.name is unreliable in production. Use err.name instead —
	// NeonDbError explicitly sets `this.name = 'NeonDbError'` via a class field,
	// which survives minification. Fall back to constructor.name for dev builds.
	const name = String(err.name || err.constructor?.name || '');
	const msg = String(err.message ?? '');
	// Construction/configuration failures: a missing, empty, or malformed
	// DATABASE_URL makes the env accessor (`Missing required env var:
	// DATABASE_URL`) or neon() (`No database connection string was provided…`,
	// `Database connection string provided to \`neon()\` is not a valid URL`) throw
	// a PLAIN Error the first time the lazy client is built — no NeonDbError name to
	// match on. Operationally this is "DB unavailable", not an internal bug: without
	// this branch every DB-backed read 500s (internal_error) and fires a per-endpoint
	// ops alert instead of degrading to a single shared 503 + Retry-After. Matched by
	// message since the thrown error carries the generic `Error` name.
	if (
		msg.includes('Missing required env var: DATABASE_URL') ||
		msg.includes('No database connection string was provided') ||
		msg.includes('Database connection string provided to')
	) {
		return true;
	}
	if (name === 'NeonDbError' || name === 'DatabaseError') {
		return (
			msg.includes('password authentication failed') ||
			msg.includes('connection refused') ||
			msg.includes('ECONNREFUSED') ||
			msg.includes('SSL connection') ||
			// Neon phrases a suspended compute as "The endpoint has been disabled.
			// Enable it using Neon API and retry." Keep the older 'is disabled'
			// variant too so either phrasing classifies as unavailable.
			msg.includes('endpoint has been disabled') ||
			msg.includes('endpoint is disabled') ||
			msg.includes('Control plane request failed')
		);
	}
	// Network-level fetch failure wrapping a Neon request (rare but happens when
	// the Neon HTTP gateway is unreachable).
	if (name === 'FetchError' || name === 'TypeError') {
		return msg.includes('ECONNREFUSED') || msg.includes('fetch failed');
	}
	// Upstash Redis auth failure — WRONGPASS means the token is wrong or rotated.
	// Same "infra misconfigured" class as a DB auth failure: a single bad env var
	// would otherwise produce an unhandled-500 storm on every cron tick.
	if (name === 'UpstashError') {
		return msg.includes('WRONGPASS') || msg.includes('invalid or missing auth token') || msg.includes('Unauthorized');
	}
	return false;
}

export const sql = new Proxy(function () {}, {
	apply(_t, _this, args) {
		// Neon dispatches on the first argument: a string is the ordinary
		// function form `sql(queryText, params, opts)`; anything else is a
		// tagged-template call where the first arg is the strings array.
		if (typeof args[0] === 'string') {
			const [queryText, params, opts] = args;
			const safeParams = Array.isArray(params) ? params.map(stripNul) : params;
			// Surface a construction failure as a rejection, not a sync throw, so
			// `sql(q, p).catch(...)` (handler attached before the first await) degrades
			// the same way the tagged-template fragment path does.
			const { sql: client, err } = getSqlSafe();
			if (err) return Promise.reject(err);
			return client(queryText, safeParams, opts);
		}
		return makeFragment(args[0], args.slice(1));
	},
	get(_t, prop) {
		return getSql()[prop];
	},
});
