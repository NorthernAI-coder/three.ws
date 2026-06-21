# 29 · Data backup/DR runbook + migration gating

> **Phase 5 — Observability & ops** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
The DB (Neon/postgres) has 180+ migrations but **no documented, tested backup/restore** and
migrations are applied manually with no pre-deploy gate. A $1B platform must be able to recover from
data loss on demand and never deploy code ahead of its schema. Establish DR and migration discipline.

## Context (read first)
- `CLAUDE.md`.
- `scripts/apply-migrations.mjs` (`db:migrate`, `db:status`; dry-run default, hash-tracked in `schema_migrations`), `api/_lib/migrations/*`.
- `@neondatabase/serverless`; Neon supports branching + point-in-time recovery.
- Asset storage: R2/S3 (`apply:r2-cors`); Redis (Upstash) is cache/idempotency (define what's recoverable vs ephemeral).

## Build this
1. **Backup strategy** — document and (where scriptable) automate: Neon PITR/snapshot cadence, R2/S3 versioning for generated assets, and what Redis state is reconstructable vs must-not-lose (idempotency/ledger live in Postgres, not Redis).
2. **Tested restore runbook** — `docs/ops/dr-runbook.md`: step-by-step restore to a temp Neon branch, validate schema + row counts + a smoke query, and a target RTO/RPO. **Actually perform the restore once** and record the result.
3. **Migration gating** — add `db:status` to CI: fail the deploy if there are pending migrations not applied to the target environment (no code-ahead-of-schema). Document the apply order relative to deploy.
4. **Migration safety** — guidelines + a check for backward-compatible (expand/contract) migrations so a rollback (prompt 28) doesn't hit a schema it can't read. Flag destructive migrations for explicit review.
5. **Restore drill cadence** — schedule a periodic DR drill (`/schedule` or a cron) so the runbook stays real.

## Files likely in play
`docs/ops/dr-runbook.md` (new), `scripts/apply-migrations.mjs` (CI status gate + safety checks), backup automation script, `.github/workflows`, migration-authoring guidelines doc.

## Definition of done
- [ ] Backup strategy documented + automated where possible (DB, assets).
- [ ] DR runbook written **and a restore actually performed + recorded**; RTO/RPO stated.
- [ ] CI fails on pending/unapplied migrations for the target env.
- [ ] Expand/contract migration guidelines + destructive-migration flagging in place.
- [ ] DR drill scheduled.
- [ ] Changelog: internal/ops → **no** entry.

## Guardrails
Follow CLAUDE.md. Never run a destructive migration without a verified fresh backup. Don't restore over prod during a drill — use a temp branch. Push both remotes.
