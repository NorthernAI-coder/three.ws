# F1 — Production Data Layer (Postgres · Redis · R2/CDN)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`, `STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none.

## Why this matters for $1B
The data layer is where trust lives. Neon holds every payment intent, mint, and custodial balance; Upstash Redis is the only thing standing between a viral spike and an unbounded GPU/LLM bill (the June 2026 500k/mo Upstash blowout and the cost-limiter fail-closed posture both already live in this repo); R2 + the first-party CDN serve every GLB and thumbnail. At $1B scale a single missing index turns a 30ms read into a 3s table scan, an unbounded Redis fan-out drains the quota and 503s the whole site, and a botched migration with no rollback path corrupts the ledger. This task makes the data layer hold under success — fast, bounded, and recoverable.

## Current state (read before you write)
- **Migrations:** `scripts/apply-migrations.mjs` (`npm run db:migrate` → `--apply`) is already safe-by-default: dry-run unless `--apply`, tracks `schema_migrations` (filename + sha256 + applied_at), and **refuses on hash drift**. 190+ `.sql` files live in `api/_lib/migrations/`. It runs each file via the websocket `Pool` (multi-statement), records the hash, and is idempotent. Gap: no per-migration transaction wrapping, no documented rollback companion, no index/perf review of recent migrations, no CI guard that pending migrations parse.
- **Postgres client:** `api/_lib/db.js` — lazy `neon()` HTTP client with a composable-fragment Proxy + `sqlValues()` bulk-insert helper and NUL stripping. HTTP driver, no long-lived pool on the hot path.
- **Redis:** `api/_lib/redis.js` — single shared `getRedis()` singleton (returns `null` when unconfigured); `api/_lib/cache.js`; `api/_lib/rate-limit.js` — a large, resilient limiter set (critical buckets fail **closed** in prod, cheap read buckets are `local:` per-instance to spare quota). `scripts/migrate-redis.mjs` exists. `docs/ops/redis.md` documents the quota story.
- **R2/CDN:** `api/cdn-object.js` (`/cdn/<key>` → S3 stream, `s-maxage` CDN cache, key validation), `scripts/set-r2-cors.mjs` (idempotent `PutBucketCors`, accepts `S3_*` or `R2_*` env, wildcard preview origins), `cors.json`, `api/_lib/r2.js`.

## Your mission
### 1. Make migrations transactional + reversible without rewriting the runner
Wrap each migration apply in `scripts/apply-migrations.mjs` in a single Postgres transaction (`BEGIN`/`COMMIT`, `ROLLBACK` on error) so a multi-statement file that fails halfway leaves the schema clean instead of half-applied — only record the `schema_migrations` row inside the committed transaction. Add a `--verify` mode that parses + EXPLAINs pending migrations against the live DB **in a rolled-back transaction** (no writes) so CI and operators can confirm a migration is sound before `--apply`. Document the rollback convention: every destructive migration (`drop`, `alter … drop column`, type narrowing) ships with a paired `*.down.sql` or a documented roll-forward, and the runner surfaces which pending files are destructive. Do not break the existing drift-refusal or dry-run-default behavior.

### 2. Index + query-budget audit of the hot tables
Identify the highest-traffic read paths (payments/`payment_intents`, `pump_trades`, `usage_events`, `agents`/`avatars` lists, `three_holder_snapshot`, oracle/sniper tables). For each, confirm the columns in every `WHERE`/`ORDER BY`/`JOIN` are indexed; add the missing indexes as a **new** forward migration in `api/_lib/migrations/` (use `CREATE INDEX CONCURRENTLY` where the table is large and live — note that `CONCURRENTLY` cannot run inside a transaction, so gate it so step 1's wrapper skips wrapping those files). Establish a written **query performance budget** in `docs/ops/` (e.g. p95 < 50ms for indexed reads, no unbounded `SELECT *` on growth tables, every list endpoint paginated) and check current offenders against it.

### 3. Connection pooling correctness for serverless
Audit how `api/_lib/db.js` is used under Vercel fan-out: the Neon HTTP driver is right for short serverless calls, but any long-lived/batch path (cron, migrations, workers) must use the websocket `Pool` and **close it**. Confirm no endpoint leaks a `Pool`, and that the migration runner's `pool.end()` in `finally` survives the new transaction logic. Document when to reach for HTTP `sql` vs pooled `Pool` in `docs/ops/`.

### 4. Redis caching + rate-limit hardening
Audit `api/_lib/cache.js` and `getRedis()` callers: every cache read must have a TTL, a documented invalidation trigger, and a graceful path when `getRedis()` returns `null` (degrade, never throw). Confirm no module constructs its own `new Redis()` (the singleton exists precisely to stop the quota blowout — grep for it). Spot-check `api/_lib/rate-limit.js`: every new money/GPU/LLM-spend bucket must be `critical: true` (fail closed in prod without Redis), every high-frequency side-effect-free read should be `local:`. Add a CI/audit guard that flags a `new Redis(` outside the singleton and a critical-looking bucket missing `critical`.

### 5. R2/CDN + CORS as code
Verify `scripts/set-r2-cors.mjs` is the single source of truth for bucket CORS and that `cors.json` matches the live policy; wire a documented "apply CORS" step into the deploy/ops runbook (`docs/ops/` or `docs/deployment.md`) so a new R2 token or preview origin never silently breaks uploads/previews. Confirm `api/cdn-object.js` sets correct `s-maxage`/`Cache-Control` and `Content-Type` for GLB/USDZ/poster types, validates keys (no traversal), and streams (never buffers) large objects. Add cache-header coverage to its test if absent.

### 6. Verify it for real
Run `npm run db:migrate` (dry-run) and the new `--verify` against a real DATABASE_URL if available (`.env.local` / `vercel env pull`); if creds are absent locally, say so explicitly and prove the logic with tests. Run `npm test` for the data-layer suites. Exercise a `/cdn/<key>` fetch and confirm CORS headers in the network tab.

## Definition of done
Inherits the **global definition of done** in `00-README-orchestration.md`. Plus, mapped to `00b-the-bar.md`:
- **Reliability bar:** migrations are atomic + reversible; a half-applied file is impossible; drift refusal intact. No Redis-absent path throws — cost buckets fail closed, read buckets degrade. R2/CORS is reproducible from code, not dashboard memory.
- **Performance bar:** every hot read path is index-backed and inside the documented query budget; no unbounded scans on growth tables; the CDN absorbs repeat GLB reads.
- New logic has tests (migration transaction/verify, cache TTL/degrade, CORS headers); `npm test` green. Every claim verified against a real DB or explicitly flagged as un-runnable locally with the reason.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs. `$THREE` is the only coin. Design tokens only where UI is touched (this track is mostly infra). Stage explicit paths only (never `git add -A`). Watch the `api/*.js` bundle-overwrite trap (check `head -1` of any changed `api/` file for `__defProp`/`createRequire` before committing). Never pull/fetch/merge from the `threeD` mirror. Own the **data layer** (migrations runner, `api/_lib/db.js`/`redis.js`/`cache.js`/`rate-limit.js`/`r2.js`, `api/cdn-object.js`, R2/CORS scripts, new index migrations, `docs/ops/`) — extend existing infra, do not rewrite it. New migrations are forward-only and append to `api/_lib/migrations/`.

## When finished
Self-review (CLAUDE.md's five checks). Ship one improvement (e.g. a `db:migrate --verify` CI step, or an EXPLAIN-driven index you found). Append a `data/changelog.json` entry if user-visible (tag: `infra`). Then delete this prompt file (`prompts/production-campaign/F-infra/F1-data-layer.md`) and report what you shipped + any seam for the next agent (F2 workers depend on the same DB/Redis/QStash infra; F3 will want your `--verify` step in CI).
