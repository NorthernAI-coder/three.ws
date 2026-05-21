# SIWX prompt 06 — daily cron to prune nonces + expired grants

## Context

three.ws workspace at `/workspaces/three.ws`. Architecture in
[prompts/siwx/PLAN.md](PLAN.md). Prompts 01 + 02 set up
`siwx_nonces` (write-heavy, replay protection) and `siwx_payments`
(time-bound grants).

This prompt is **step 6 of 7** — a Vercel cron that runs hourly to keep
both tables bounded.

## Why this matters

- `siwx_nonces` grows by **one row per successful SIWX auth**. Without
  pruning, the table balloons and `hasUsedNonce` lookups slow down.
- `siwx_payments` rows with `expires_at` in the past stop granting access
  on read (the `SELECT` filters them), but they linger forever and pollute
  reporting on `/api/x402-status`.

The storage adapter from prompt 02 already exposes the two helpers
(`pruneOldNonces`, `pruneExpiredPayments`). All this prompt does is wire
them into the cron dispatcher and the Vercel schedule.

## Rails (CLAUDE.md, non-negotiable)

- No mocks, no fake data, no stubs.
- Real `sql` calls. Cron is auth-gated like the others.
- Done = `curl -H 'authorization: Bearer $CRON_SECRET' http://localhost:3000/api/cron/siwx-gc`
  returns a clean summary, both tables shrink as expected, `git diff` reviewed.

## Files to edit

### 1. `api/cron/[name].js` — add a new handler branch

Existing pattern: every cron lives as a handler in the dispatcher at
[api/cron/[name].js](../../api/cron/[name].js). Add to the `HANDLERS`
map and define the function. Match the existing style (`handle<X>` async,
returns `json(res, ...)` from `_lib/http.js`, reads its auth gate from
`env.CRON_SECRET` exactly like the other handlers do — re-read
`handleCleanupCsrfTokens` for the closest analogue).

```js
// Add to HANDLERS map:
'siwx-gc': handleSiwxGc,

// New handler:
async function handleSiwxGc(req, res) {
  // Reuse whatever auth gate the surrounding handlers use. Look at
  // handleCleanupCsrfTokens — it likely calls a shared `assertCron(req)`
  // or checks `req.headers.authorization === \`Bearer ${env.CRON_SECRET}\``.
  // Match that exactly; do not invent a new gate.

  const { pruneOldNonces, pruneExpiredPayments } = await import('../_lib/siwx-storage.js');

  // 10-minute nonce window — well over the 5-minute SIWX message maxAge.
  const noncesDeleted = await pruneOldNonces(10 * 60);

  // 7-day grace on expired payments so a slow client doesn't lose access
  // mid-session right at the boundary.
  const paymentsDeleted = await pruneExpiredPayments(7 * 24 * 3600);

  return json(res, 200, {
    ok: true,
    noncesDeleted,
    paymentsDeleted,
    ranAt: new Date().toISOString(),
  });
}
```

If `json` / `error` / `wrap` aren't already imported in the dispatcher, they
are — every other handler uses them. Reuse.

### 2. `vercel.json` — schedule the cron

Add to the existing `crons` array (don't reorder the others):

```json
{
  "path": "/api/cron/siwx-gc",
  "schedule": "23 * * * *"
}
```

Hourly at :23 to avoid clustering with the existing :17 csrf cleanup.
Vercel's free tier limits cron count — verify you're not at the cap with
`jq '.crons | length' vercel.json` before/after.

### 3. Tiny addition to `/api/x402-status` (optional but easy)

Re-open [api/x402-status.js](../../api/x402-status.js) and surface the most
recent GC run from the response headers / a `siwx.lastGc` field. If you'd
need a new table to track that, **skip it** — the cron already returns the
run timestamp, and operators can see it in Vercel cron logs. Don't build a
log table just for this.

## Verification you must perform

```bash
# 1. Local dispatch works.
CRON_SECRET=$CRON_SECRET npm run dev
curl -sS -H "authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/siwx-gc | jq .

# Expected:
# {
#   "ok": true,
#   "noncesDeleted": <int>,
#   "paymentsDeleted": <int>,
#   "ranAt": "2026-05-21T..."
# }

# 2. Auth gate works.
curl -sS -i http://localhost:3000/api/cron/siwx-gc | head -1
# Expected: 401 (or 403, matching the other crons exactly).

# 3. Insert two test rows then verify pruning.
DATABASE_URL=$DATABASE_URL node -e "
import('@neondatabase/serverless').then(async ({ neon }) => {
  const sql = neon(process.env.DATABASE_URL);
  await sql\`insert into siwx_nonces (nonce, resource, address, used_at) values
    ('gc-test-fresh', '/x', 'a', now()),
    ('gc-test-old',   '/x', 'a', now() - interval '20 minutes')\`;
  const before = await sql\`select count(*)::int as n from siwx_nonces where nonce like 'gc-test-%'\`;
  console.log('before:', before[0].n);
});
"
curl -sS -H "authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/siwx-gc | jq .
DATABASE_URL=$DATABASE_URL node -e "
import('@neondatabase/serverless').then(async ({ neon }) => {
  const sql = neon(process.env.DATABASE_URL);
  const after = await sql\`select nonce from siwx_nonces where nonce like 'gc-test-%'\`;
  console.log('after:', after);
  await sql\`delete from siwx_nonces where nonce like 'gc-test-%'\`;
});
"
# Expected: 'gc-test-fresh' remains, 'gc-test-old' gone.

# 4. vercel.json validates.
jq '.crons' vercel.json
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"
```

## Done means

- `api/cron/[name].js` has a `handleSiwxGc` handler registered in `HANDLERS`.
- `vercel.json` declares the hourly cron at `/api/cron/siwx-gc`.
- Local curl with `$CRON_SECRET` returns the summary JSON; without the
  secret returns the same error code the other crons return.
- Test rows are pruned correctly.
- `git diff` reviewed.

Do not commit or push.
