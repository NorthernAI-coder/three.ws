# Track F — Scale & Infrastructure

**Goal: it holds up under success.** Activation, monetization, and ecosystem work (Tracks B–E) only matter if the platform doesn't fold the day the traffic arrives. This track hardens the three layers that fail silently and catastrophically at scale: the **data layer** (Neon Postgres, Upstash Redis, R2/CDN), the **workers** (oracle, agent-sniper, the Forge GPU generation chain + QStash), and the **deploy path** (CI/CD gates, the `api/*.js` bundle footgun, preview deploys, rollback). When this track is done, a viral spike is a non-event: indexed reads stay under budget, the Redis quota stays bounded, no worker dies on a bad signal or loses a job, the "free engines all busy" state queues instead of dead-ends, and no known production footgun can ship twice.

This is **hardening, not greenfield.** The data clients, migration runner, limiter set, QStash adapter, model workers, and most CI scripts already exist (`api/_lib/db.js`, `apply-migrations.mjs`, `rate-limit.js`, `qstash.js`, `workers/*`, `scripts/audit-*`). These prompts make them atomic, bounded, observable, and gated — they do not rewrite them.

## Prompts

| # | File | Mission | Run order |
|---|------|---------|-----------|
| **F1** | `F1-data-layer.md` | Atomic + reversible Neon migrations (`db:migrate` + `--verify`), hot-table indexes & a written query-perf budget, serverless connection-pooling correctness, Redis caching/rate-limit hardening (singleton, critical-bucket fail-closed), R2/CDN + CORS as code (`set-r2-cors.mjs`, `api/cdn-object.js`). | **First** — F2 & F3 build on its DB/Redis/QStash hardening and want its `--verify` + guard in CI. |
| **F2** | `F2-workers-reliability.md` | Crash-safe oracle & agent-sniper (drain, heartbeat, idempotent money paths), QStash retries/backoff/**dead-letter**, model-* + post-process worker health & concurrency budgets, and turning Forge's "free engines all busy" into a durable **queue + ETA + notify-me**. | After F1 (shares infra). Can overlap. |
| **F3** | `F3-cicd-deploy-safety.md` | Promote unenforced audits (`test:gate`, `audit:pages/handlers/mcp/deploy`, `check:dist`, lighthouse) into real CI merge gates, lock the `api/*.js` bundle-overwrite trap, preview deploys + `audit:deploy` per PR, and a one-command rollback runbook for web + workers + data. | Last — gates the work F1 & F2 land; wants their checks wired in. |

Run **F1 → F2 → F3**; F2 and F3 can begin once F1's shared-infra changes are understood. Each prompt deletes itself when complete; when only this `00-README.md` remains, Track F is done.

## File-ownership map

Concurrent agents share this worktree — **stage explicit paths only, never `git add -A`.** Each prompt owns a lane:

- **F1 — data layer:** `scripts/apply-migrations.mjs`, new forward migrations in `api/_lib/migrations/`, `api/_lib/{db,redis,cache,rate-limit,r2}.js`, `api/cdn-object.js`, `scripts/set-r2-cors.mjs`, `cors.json`, `scripts/migrate-redis.mjs`, query-budget + pooling docs in `docs/ops/`.
- **F2 — workers & Forge pipeline:** `workers/*` (oracle, agent-sniper, model-*, remesh/texture/segment/rembg/stylize/unirig, avatar-pipeline-controller), `workers/deploy/`, `scripts/deploy-sniper.mjs`, `api/_lib/qstash.js` + QStash receiver endpoints, `api/forge.js` + `api/_lib/forge-tiers.js` backpressure, `src/forge.js` queue UI.
- **F3 — CI/CD & deploy safety:** `.github/workflows/ci.yml`, `scripts/{audit-*,check-*,test-gate,build-vercel,check-api-not-bundled}.mjs`, `vercel.json` deploy config, `.lighthouserc.json` wiring, `docs/deployment.md`, `docs/ops/` runbooks.

Shared, append-only files (`data/changelog.json`, `data/pages.json`) are never reformatted — only appended. The two repo traps apply to every prompt here: `npx vercel build` overwrites `api/*.js` with esbuild bundles (check `head -1` for `__defProp`/`createRequire` before committing an `api/` diff; recover with `git restore -- api/ public/`), and **never** `git pull`/`fetch`/`merge` from the `threeD` mirror. `$THREE` is the only coin.
