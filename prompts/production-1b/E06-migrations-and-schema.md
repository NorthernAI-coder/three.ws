# E06 — Migrations: remove CREATE TABLE from handlers, add versioning & rollback

> Phase E · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Several handlers create their tables lazily (`CREATE TABLE IF NOT EXISTS` at request time) —
a race condition, a hidden schema dependency, and a DDL-on-the-hot-path anti-pattern. And
there's no record of which migrations have run. Make schema management explicit, versioned,
and safe.

## Where this lives (real files)
- Lazy `CREATE TABLE` in handlers/libs: `api/_lib/agent-embeddings.js`, `api/_lib/diorama-store.js`, `api/_lib/onchain-deploy.js`, `api/_lib/coin/three-holders.js` (and audit for more).
- `api/_lib/migrations/` — SQL migration files (timestamped).
- `scripts/run-migrations.js` / `apply-migrations.mjs` — runner.

## Build this
1. **Migration versioning:** add a `schema_migrations` table that records applied migrations; make the runner idempotent (skip already-applied) and ordered.
2. **Move DDL into migrations:** convert every in-handler `CREATE TABLE/INDEX IF NOT EXISTS` into a real migration; the handler assumes the table exists. Keep behavior identical.
3. **Readiness check:** a startup/readiness assertion (ties to E03) that required tables exist; fail loud if a migration is pending in production.
4. **Rollback strategy:** for each migration, document or provide a down/rollback path (or an explicit "forward-only, here's the compensating migration" note).
5. **Pre-deploy gate:** wire migration application into the deploy/CI flow (E10) so schema is applied before traffic.

## Out of scope
- Read replicas + partitioning (**E09**).

## Definition of done
- [ ] No handler runs DDL at request time; all such tables have real migrations.
- [ ] `schema_migrations` tracks applied migrations; runner is idempotent + ordered.
- [ ] Readiness check fails on pending migrations; rollback/compensation documented.
- [ ] `npx vitest run` green; changelog entry (infra); committed + pushed to both remotes.

## Verify
- Drop a dev table, run the runner twice → created once, second run is a no-op; confirm no handler recreates tables.
