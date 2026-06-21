# 26 — Database integrity & migrations

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Scale & infra
**Owns:** `api/_lib/db.js`, `api/_lib/schema.sql`, `api/_lib/migrations/`, `api/_lib/db-retry.js`, data-access in `api/_lib/`, tables like `agent_identities`, `pump_agent_mints`, skill/license/purchase tables.
**Depends on:** `05`, `07`. Pairs with `18`, `27`.

## Why this matters for $1B
Data integrity is existential when the data is wallets, ownership, and money. Corrupt
or lost data destroys trust and is often unrecoverable. Clean migrations let you ship
fast without breaking production.

## Mission
A documented, versioned schema with safe forward-migrations, enforced integrity
constraints, backups with tested restore, and no orphaned or inconsistent records.

## Map
- DB client: `api/_lib/db.js` (+ retry wrapper `db-retry.js`). Schema: `api/_lib/
  schema.sql`. Migrations: `api/_lib/migrations/` (e.g.
  `20260616130000_oracle_copy_fanout.sql`). Tooling: `npm run db:migrate`,
  `npm run db:status`. Core invariants: `agent_identities.user_id` immutable, one
  agent = one owner; launch records in `pump_agent_mints`; skill/license/purchase rows.

## Do this
1. **Schema audit:** document every table, column, type, and relationship in
   `docs/data-model.md` (derive from `schema.sql` + `migrations/`). Identify missing
   constraints: primary keys, foreign keys, uniqueness (e.g. one wallet per agent),
   not-null, check constraints (amount ≥ 0), and indexes on hot query paths.
2. **Add the constraints** that enforce the invariants the app assumes — especially
   the ownership and money invariants (prompt `07`). Backfill/clean any existing rows
   that would violate them first, via a migration.
3. **Migrations:** ensure every schema change goes through a versioned, ordered,
   idempotent migration in `api/_lib/migrations/`; `db:status` reflects reality;
   migrations are forward-safe and reversible where possible. No manual prod schema
   edits.
4. **Integrity sweep:** scan for orphans (records pointing to deleted parents),
   duplicates, and inconsistent states (purchase confirmed but no license; mint
   recorded but no agent). Fix the data and add the constraint/job that prevents
   recurrence.
5. **Transactions:** money/ownership mutations that touch multiple rows run in
   transactions so they can't partially apply (ties to prompt `18` idempotency).
6. **Backups & restore:** confirm automated backups exist, are encrypted, and — most
   importantly — **test a restore** into a scratch environment. Document RPO/RTO.
7. **Performance:** add indexes for slow queries surfaced by observability (prompt
   `25`); paginate large reads (prompt `10`); use `db-retry.js` on transient failures.
8. Add data-integrity tests/checks that can run against a seeded DB in CI.

## Must-not
- Do not edit production schema outside a migration.
- Do not add a destructive migration without a tested backup and a reversal plan.
- Do not weaken an invariant constraint to make a write succeed — fix the write.

## Acceptance
- [ ] `docs/data-model.md` documents schema + relationships from `schema.sql`/migrations.
- [ ] Integrity constraints (PK/FK/unique/not-null/check) + hot-path indexes added; offending data cleaned.
- [ ] All schema changes are versioned, idempotent migrations in `api/_lib/migrations/`; `db:status` accurate.
- [ ] Orphan/duplicate/inconsistent-state sweep clean; preventer in place.
- [ ] Multi-row money/ownership mutations are transactional.
- [ ] Backups verified by a successful test restore; RPO/RTO documented.
- [ ] Data-integrity checks runnable in CI.
