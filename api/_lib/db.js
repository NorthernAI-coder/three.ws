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

// Neon's HTTP driver does a `fetch` per query. On Vercel, cold connections and
// momentary network blips surface as `NeonDbError: Error connecting to database:
// fetch failed` — a connection-level failure where the request never reached
// Postgres, so no statement ran. These are transient and safe to retry (the
// query is never half-applied: a failed connect can't have committed a write).
// SQL errors (constraint violations, syntax, 22021 NUL, etc.) are deterministic
// and surface unchanged.
//
// This is a per-call opt-in (not baked into `sql`) on purpose: the bare `sql`
// tagged template must keep returning Neon's lazy query object so callers can
// still batch them with `sql.transaction([...])`. Use it around standalone,
// idempotent statements where a transient blip otherwise drops data — e.g. the
// fire-and-forget audit/usage writes.
const MAX_DB_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [150, 400];

function isTransientConnError(err) {
	const msg = `${err?.message || ''} ${err?.sourceError?.message || ''} ${err?.cause?.message || ''}`;
	return /fetch failed|connecting to database|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|terminat/i.test(
		msg,
	);
}

export async function withDbRetry(run) {
	let lastErr;
	for (let attempt = 0; attempt < MAX_DB_ATTEMPTS; attempt++) {
		try {
			return await run();
		} catch (err) {
			lastErr = err;
			if (attempt === MAX_DB_ATTEMPTS - 1 || !isTransientConnError(err)) throw err;
			await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt] ?? 400));
		}
	}
	throw lastErr;
}
