# 38 · Database Migrations & Data Integrity

## Mission
The data layer is correct, migratable, backed up, and consistent — no orphaned records, no drift
between schema and code, no destructive migration without a path back.

## Context
- Migration tooling: `npm run db:migrate` (`scripts/apply-migrations.mjs --apply`), `npm run db:status`.
- Data backs avatars, agents, skills, licenses, usage events, launches, reviews, notifications.

## Tasks
1. **Schema ↔ code parity:** confirm every table/column the code reads/writes exists and matches;
   `npm run db:status` clean; no pending/unapplied migrations on the deploy path.
2. **Migration safety:** migrations are idempotent + reversible (or have a documented forward-fix);
   no destructive change without backup + rollback notes; additive-first.
3. **Integrity:** foreign keys / constraints / indexes for hot queries; no orphaned rows (e.g. avatars
   without owners, licenses without items); add constraints where missing.
4. **Ownership invariants:** enforce `owner_id` and access invariants at the DB level where feasible
   (defense in depth with the API checks from prompt 14).
5. **Backups + retention:** document backup cadence + restore procedure; data retention for usage
   events; PII handling aligned with the privacy policy (prompt 44).
6. **Performance:** index the queries that power dashboards/galleries/marketplace; check slow queries.

## Acceptance
- `db:status` clean; migrations idempotent + reversible/forward-fixable; additive-first.
- Integrity constraints + indexes in place; no orphaned records in the critical tables.
- Backup/restore + retention documented in `docs/ops/data.md`.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs; never run a destructive migration without backup + rollback. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/38-database-migrations.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
