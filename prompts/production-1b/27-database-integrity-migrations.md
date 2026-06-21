# 27 — Database integrity & migrations

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

The database holds money truth: payment intents, agent revenue, skill licenses,
launch records. One non-idempotent migration that half-applies, one missing unique
index that lets a payment double-settle, or one unindexed hot query that table-scans
under load can corrupt balances or take the platform down during the exact traffic
spike you wanted. At $1B, schema discipline is the floor that everything else stands
on — it must be boringly safe, forward-only, and reversible.

## Mission

Guarantee every migration is idempotent and forward-safe, every hot query is indexed
and constrained, money paths are protected by unique/FK constraints, and no
destructive change ships without a backup — with retry and timeouts on the Neon client.

## Map (trust but verify — files move)

- **Migrations** — [api/_lib/migrations/](../../api/_lib/migrations) — ~134 `.sql`
  files (mixed `001_`, dated, and `YYYYMMDDHHMMSS_` naming). Idempotency via
  `CREATE TABLE/INDEX IF NOT EXISTS` and `DO $$ … EXCEPTION WHEN duplicate_object`.
- **Base schema** — [api/_lib/schema.sql](../../api/_lib/schema.sql) — ~1900 lines,
  `pgcrypto`/`citext`, fully idempotent (`IF NOT EXISTS` everywhere).
- **Neon client** — [api/_lib/db.js](../../api/_lib/db.js) — `@neondatabase/serverless`
  HTTP driver, lazy init, composable SQL fragments with placeholder renumbering.
- **Retry helper** — [api/_lib/db-retry.js](../../api/_lib/db-retry.js) — `withDbRetry`,
  3 attempts, retries transient connection errors only (never SQLSTATE constraint errors).
- **Migration runner** — [scripts/apply-migrations.mjs](../../scripts/apply-migrations.mjs) —
  dry-run by default (`--apply` to write), `schema_migrations` ledger (filename + SHA-256),
  drift detection (refuses if a hash changed), `Pool` for multi-statement files.
  Scripts: `npm run db:status` (dry) / `npm run db:migrate` (apply).
- **Money-path examples** —
  [api/_lib/migrations/20260603120000_payment_intents_tx_hash_unique.sql](../../api/_lib/migrations/20260603120000_payment_intents_tx_hash_unique.sql)
  (anti-replay unique tx_hash),
  [api/_lib/migrations/20260621120000_revenue-integrity.sql](../../api/_lib/migrations/20260621120000_revenue-integrity.sql)
  (partial unique index + CHECK via DO/EXCEPTION).
- **Tests** — [tests/db-sql-compose.test.js](../../tests/db-sql-compose.test.js)
  (fragment placeholder renumbering), [tests/db-retry.test.js](../../tests/db-retry.test.js).

## Do this

1. **Establish the truth.** Run `npm run db:status` to see applied vs pending and
   confirm the `schema_migrations` ledger + drift detection work. Never edit a
   migration that has already applied (it breaks the SHA-256 drift guard) — add a
   new forward migration instead.
2. **Idempotency sweep.** Grep every file under `api/_lib/migrations/` for
   `CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT`/`ADD COLUMN` lacking
   `IF NOT EXISTS` or a `DO $$ … EXCEPTION` guard. Each must be safe to re-run on a
   DB that already has the object. Fix any that aren't (new migration if already applied).
3. **Hot-query indexes.** Identify the most-read tables (payments/intents, agent
   revenue, launches, marketplace, feeds). For each frequent `WHERE`/`ORDER BY`/`JOIN`,
   confirm a supporting index exists; add `CREATE INDEX IF NOT EXISTS` (use partial
   indexes where a column is nullable, mirroring the revenue-integrity pattern).
4. **Constraints on money paths.** Verify unique constraints prevent double-settle
   (e.g. one intent per on-chain tx_hash) and that foreign keys tie child rows to
   their owners. Add missing UNIQUE/FK/CHECK via the `DO $$ … EXCEPTION WHEN
   duplicate_object THEN NULL; END $$;` idempotent pattern.
5. **No destructive change without a backup.** Audit migrations for `DROP TABLE`,
   `DROP COLUMN`, `TRUNCATE`. For any new destructive op, require an explicit Neon
   branch/snapshot first and document the rollback; prefer additive deprecation
   (rename-then-drop in a later release) over in-place drops.
6. **Client safety.** Confirm money/critical reads/writes go through `withDbRetry`.
   Add a request-level query timeout (`Promise.race` against a bounded deadline)
   around long DB calls so a stalled Neon connection can't hang a serverless
   function past its limit. Keep retry classification (transient vs constraint) intact.
7. **Split-safety.** The runner splits multi-statement files on bare `;` at line
   ends — verify any new migration with `DO $$`/dollar-quoted bodies still parses
   (test against `db:status`), and that statements are individually idempotent.
8. Run `npx vitest run tests/db-sql-compose.test.js tests/db-retry.test.js`, then
   `npm run db:status` to confirm a clean, applied-or-pending state. Add a
   `data/changelog.json` entry only if a user-visible behavior changed; `npm run build:pages`.

## Must-not

- Never edit an already-applied migration — it trips the drift guard; add a forward one.
- Never ship `DROP`/`TRUNCATE`/`DROP COLUMN` without a Neon snapshot + documented rollback.
- Never make a migration non-idempotent; assume it may re-run on a partially-applied DB.
- Do not pull/fetch/merge from the `threeD` remote (push-only mirror).
- No mocks, stubs, or TODOs. The only coin is `$THREE` — no other mint in fixtures/seeds.

## Acceptance (all true before claiming done)

- [ ] `npm run db:status` shows a clean ledger; drift detection verified working.
- [ ] Every migration is idempotent (`IF NOT EXISTS` / `DO $$ … EXCEPTION`), safe to re-run.
- [ ] Hot tables have indexes covering their frequent `WHERE`/`ORDER BY`/`JOIN`.
- [ ] Money paths carry unique + FK + CHECK constraints (e.g. no double-settle per tx).
- [ ] No destructive migration lacks a backup/rollback plan; additive deprecation preferred.
- [ ] Critical DB calls use `withDbRetry` and a bounded query timeout.
- [ ] `db-sql-compose` and `db-retry` tests pass; changelog updated only if user-visible.
