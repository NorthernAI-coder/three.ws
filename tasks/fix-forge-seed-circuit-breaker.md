# Task: Forge Seed Cron — Circuit Breaker for Provider Outages

## Problem

`api/cron/forge-seed-cron.js` fires every 60 seconds and calls `/api/forge` to start a new
draft-tier 3D generation. When the free NVIDIA lane is broken (wrong artifact schema, network
blip, etc.) AND Replicate is rate-limited, every tick:

1. Creates a synthetic user in the `users` table
2. POSTs to `/api/forge` and gets a 429 back
3. Deletes the user (`delete from users where id = ${user.id}`)
4. Returns `{ ok: false, reason: "forge submit 429: ..." }`

This burns DB writes, usernames from the OG pool, and fills logs with failure noise every
minute for the entire duration of any provider outage — which can last hours (Replicate) or
days (NVIDIA API change).

## What needs to change

Add a lightweight consecutive-failure circuit breaker to `startNextJob()` in
`api/cron/forge-seed-cron.js`. When N consecutive ticks have returned `ok: false`, skip
submitting a new job for a cooldown window, then probe once before resuming.

### Implementation plan

**Option A — DB-side counter (preferred, survives lambda restarts)**

Add a `forge_seed_state` table (or use `app_config` / `kv_store` if one exists):

```sql
create table if not exists forge_seed_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

In `startNextJob()`, before creating the user:

```js
// Read current failure streak
const [state] = await sql`
  select value from forge_seed_state where key = 'circuit'
`;
const circuit = state?.value ?? { consecutive_failures: 0, open_until: null };

if (circuit.open_until && new Date(circuit.open_until) > new Date()) {
  return { skipped: true, reason: `circuit open until ${circuit.open_until}` };
}
```

After a failure (when `submit.status !== 200`):

```js
const failures = (circuit.consecutive_failures || 0) + 1;
const openUntil = failures >= 3
  ? new Date(Date.now() + failures * 10 * 60_000).toISOString()  // 30m, 40m, 50m …
  : null;
await sql`
  insert into forge_seed_state (key, value, updated_at)
  values ('circuit', ${JSON.stringify({ consecutive_failures: failures, open_until: openUntil })}::jsonb, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
`;
```

After a success (inside the `submit.body?.status === 'done'` branch and the `submit.body?.job_id`
branch), reset the counter:

```js
await sql`
  insert into forge_seed_state (key, value, updated_at)
  values ('circuit', '{"consecutive_failures":0,"open_until":null}'::jsonb, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
`.catch(() => {}); // non-critical
```

**Option B — process-wide Map (simpler, lost on cold start)**

If you don't want a migration, a module-level `let _seedCircuit = { failures: 0, openUntil: 0 }` 
works within a warm lambda but resets on every cold start. Acceptable for a background cron
since it self-heals on redeploy.

```js
// top of forge-seed-cron.js, outside the handler:
const _circuit = { failures: 0, openUntil: 0 };
```

In `startNextJob()` before creating the user:
```js
if (_circuit.openUntil > Date.now()) {
  return { skipped: true, reason: `circuit open for ${Math.ceil((_circuit.openUntil - Date.now()) / 60_000)}m more` };
}
```

After failure:
```js
_circuit.failures++;
if (_circuit.failures >= 3) {
  _circuit.openUntil = Date.now() + _circuit.failures * 10 * 60_000;
}
```

After success:
```js
_circuit.failures = 0;
_circuit.openUntil = 0;
```

## Relevant files

- `api/cron/forge-seed-cron.js` — the cron handler; `startNextJob()` is at line ~158
- `api/_lib/db.js` — `sql` tagged-template import for DB queries
- `api/forge.js` — the `/api/forge` endpoint the cron calls; `isUpstreamUnavailable()` at ~line 400 defines what counts as a provider failure

## Acceptance criteria

- When forge returns non-200 three times in a row, the circuit opens for ≥30 minutes
- During an open circuit, `startNextJob()` returns `{ skipped: true, reason: "circuit open …" }`
- No synthetic user is created or deleted during circuit-open ticks
- First successful generation resets the counter and closes the circuit immediately
- The `new_job` field in the cron response JSON shows the circuit state when open
- No new DB migrations needed if you take Option B (process-level Map)

## Notes

- If you take Option A, run the migration as a one-time SQL statement in the Vercel console
  or via `psql $DATABASE_URL -c "..."` — no migration framework in this project.
- The threshold (3 failures → open) and window (10m × failures) are suggestions; tune to taste.
- Do NOT add a circuit breaker to `pollPending()` — polling already-submitted jobs is cheap
  and should keep running even when new submissions are blocked.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/fix-forge-seed-circuit-breaker.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
