// Retry helper for standalone, idempotent DB writes.
//
// Neon's HTTP driver does a `fetch` per query. On Vercel, cold connections and
// momentary network blips surface as `NeonDbError: Error connecting to database:
// fetch failed` — a connection-level failure where the request never reached
// Postgres, so no statement ran. These are transient and safe to retry (the
// query is never half-applied: a failed connect can't have committed a write).
// SQL errors (constraint violations, syntax, 22021 NUL, etc.) are deterministic
// and surface unchanged.
//
// This lives apart from db.js on purpose: the bare `sql` tagged template must
// keep returning Neon's lazy query object so callers can still batch them with
// `sql.transaction([...])`, and most tests mock `db.js` directly — keeping the
// retry wrapper here means it loads its real implementation regardless. Use it
// around standalone, idempotent statements where a transient blip otherwise
// drops data — e.g. the fire-and-forget audit/usage writes.

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
