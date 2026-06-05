# Fix 04 — Production DB missing tables (`forge_creations`, `usage_events`) (P1, ~25 lines)

## The errors (verbatim)

```
[forge-store] listCreations failed: relation "forge_creations" does not exist
[api] unhandled NeonDbError: relation "usage_events" does not exist  (code 42P01)
```

- `forge_creations`: breaks `/api/forge-gallery` (19 lines).
- `usage_events`: breaks `/api/agents/[id]` (`handleGetOne`, 2 lines) and is referenced by
  ~15 other files (`billing/summary`, `usage/summary`, `cron/[name]`, `agent-wallet`, etc.) —
  so this will surface wider than the export shows.

## Root cause

The migrations that create these tables exist in the repo but were **never applied to the
production Neon database**:
- `api/_lib/migrations/20260604000000_forge_creations.sql` (dated 2026-06-04 — one day before
  this log window; clearly never ran in prod).
- `usage_events` is defined in `api/_lib/schema.sql` (lines ~310-326, plus additive ALTERs at
  ~707-709) — the base schema/those ALTERs aren't applied either.

Migration runner: `scripts/run-migrations.mjs` applies `api/_lib/migrations/*.sql` in
alphabetical order, tracked in a `schema_migrations` table. The base `schema.sql` bootstrap
and the newest migration both need to be applied to prod.

## Required fix (proper, no shortcuts)

1. **Reconcile schema vs migrations.** Confirm whether `usage_events` lives only in
   `schema.sql` or also has a dedicated migration. If the migration runner is the source of
   truth for prod, ensure `usage_events` (table + the additive `agent_id` column/index) is
   represented as an **idempotent** migration file, not only in `schema.sql`. Same for any
   other table that exists in `schema.sql` but has no migration. Don't leave prod dependent
   on a manual `schema.sql` apply.
2. **Make the migrations idempotent and safe** (`create table if not exists`,
   `create index if not exists`, `add column if not exists`) — they already mostly are;
   verify the new/reconciled ones are too, so re-running is harmless.
3. **Apply to production.** Run the migration runner against the prod `DATABASE_URL`
   (Neon). Confirm `schema_migrations` records them and the tables now exist.
4. **Verify the code's expected columns match** what the migration creates — `forge-store.js`
   and `api/_lib/usage.js` / `api/agents/[id].js` query specific columns; the table shape
   must satisfy every query (not just the table name).
5. **Guard the read paths** so a future missing-relation never becomes an unhandled 500:
   `forge-gallery` should return an empty gallery (designed empty state) rather than 500 if
   the table is somehow absent; `agents/[id]` should treat "no usage_events" as zero usage,
   not a crash. Errors handled at the boundary.

## Verification

- `\dt` (or a `select to_regclass('public.forge_creations')`) against prod confirms both
  tables exist with the expected columns.
- `/api/forge-gallery` returns real creations (or a clean empty state) — no 500.
- `/api/agents/<real-id>` returns the agent with usage stats — no 500.
- `select * from schema_migrations` shows the applied migration rows.
- Grep post-deploy logs: zero `relation "..." does not exist`.

## Definition of done

Both tables exist in prod via tracked idempotent migrations, every querying route returns
real data, read paths degrade gracefully if a relation is ever missing, and the
schema.sql-vs-migrations drift that caused this is reconciled so it can't recur.
