# 28 — Deploy pipeline & rollback safety

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

A platform handling real money and real assets must be able to ship safely and undo
instantly. The single worst footgun in this repo is `npx vercel build` rewriting
`api/*.js` source files in place with esbuild bundles — committing one corrupts the
backend silently. Add a missed cron registration, a desync between the two git
remotes, or a deploy with no fast rollback, and a routine push becomes an outage.
At $1B, deploys must be a non-event: gated, verified, mirrored, and reversible.

## Mission

Harden the deploy path so a bundled `api/` file can never reach `main`, the deploy
audit + build gates always run, crons stay in sync with their handlers, both git
remotes stay aligned, and rollback is one documented command away.

## Map (trust but verify — files move)

- **Bundle guard** — [scripts/check-api-not-bundled.mjs](../../scripts/check-api-not-bundled.mjs) —
  scans first 4096 bytes of every `api/**/*.js` for `__defProp`, `createRequire(`,
  `__toESM(`, `__toCommonJS(`; exits non-zero with `git restore -- api/ public/` recovery hint.
- **Deploy artifact audit** — [scripts/audit-deploy-artifacts.mjs](../../scripts/audit-deploy-artifacts.mjs) —
  catches committed symlinks + unsatisfied peers + undeclared `api/` imports. Run `npm run audit:deploy`.
- **Build orchestrator** — [scripts/build-vercel.mjs](../../scripts/build-vercel.mjs) —
  5-phase build; phase 1 gates on `audit:deploy`, `test:gate`, `verify:solana`,
  `verify:onchain`, `audit:mcp`. Run `npm run build:vercel`.
- **Vercel config** — [vercel.json](../../vercel.json) — `routes`, `functions`, `headers`,
  `env`, and `crons` (~46 cron entries). Cron handlers live in [api/cron/](../../api/cron).
- **CI** — [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — jobs: **lint**
  (`eslint .`), **test** (`vitest run`), **guards** (`check-api-not-bundled.mjs`,
  `check:images`, `build:pages`), **typecheck** (advisory, continue-on-error).
- **Tests** — [tests/deploy-artifacts.test.js](../../tests/deploy-artifacts.test.js).
- **Git remotes** — `origin` → `nirholas/three.ws` (canonical), `threeD` →
  `nirholas/3D-Agent` (push-only mirror). Per `/CLAUDE.md`, every push goes to BOTH.

## Do this

1. **Prove the bundle guard.** Read `check-api-not-bundled.mjs`. Confirm it runs in
   CI (guards job) and as a build gate. Before any large `api/` commit, run
   `node scripts/check-api-not-bundled.mjs` and `head -1` changed files for
   `__defProp`/`createRequire`; recover with `git restore -- api/ public/`. Add a
   `pre-commit`/local check note if not already enforced.
2. **Run the deploy audit.** `npm run audit:deploy` — fix any symlink, peer-dep, or
   undeclared-import finding it reports. This is the gate that caught the 2026-06-11
   outage class; it must pass clean.
3. **Cron registration sanity.** There is no validator that `vercel.json` crons map
   1:1 to `api/cron/*` handlers (the counts differ because some handlers serve
   multiple schedules). Write/extend a script that, for every `crons[].path` in
   `vercel.json`, asserts a resolvable handler exists under `api/`, and flags any
   `api/cron/*` handler with no schedule. Wire it into the guards CI job.
4. **Verify the build gates fire.** Run `npm run build:vercel` (or inspect phase 1)
   and confirm `audit:deploy`, `test:gate`, `verify:solana`, `verify:onchain`,
   `audit:mcp` all run and that RPC-dependent verifies degrade to warnings (never
   hard-fail) when an RPC is down — a flaky RPC must not block a deploy.
5. **Dual-remote discipline.** Document and (where possible) script that every push
   goes to `origin` AND `threeD` in the same step; never force-push without explicit
   request; NEVER pull/fetch/merge from `threeD`. Surface an error if the two
   remotes' `main` diverge rather than silently leaving them out of sync.
6. **Rollback runbook.** Document the fast rollback: `vercel rollback` (or promote a
   prior production deployment in the Vercel dashboard) plus `git revert` using a
   NEUTRAL commit message (never echo the reverted title, per `/CLAUDE.md`). Capture
   how to re-point both remotes after a revert.
7. **Preview deploys.** Confirm preview/PR deployments are isolated from production
   data (no prod writes, no prod crons). If any preview can touch prod money/DB,
   gate it behind env separation.
8. Run `npx vitest run tests/deploy-artifacts.test.js`, `npm run audit:deploy`, and
   `node scripts/check-api-not-bundled.mjs`. Add a `data/changelog.json` entry only
   if a user-visible surface changed (deploy hardening is usually internal); if so,
   `npm run build:pages`.

## Must-not

- Never commit a bundled `api/*.js` (esbuild markers in the first bytes) — guard + recover.
- Never pull/fetch/merge from `threeD`; it is a push-only mirror. Push to BOTH remotes.
- Never force-push to either remote without an explicit request.
- Never let an RPC outage hard-block a deploy — verify steps degrade to warnings.
- No mocks, stubs, or TODOs in the pipeline scripts. The only coin is `$THREE`.

## Acceptance (all true before claiming done)

- [ ] `check-api-not-bundled.mjs` passes; documented recovery is `git restore -- api/ public/`.
- [ ] `npm run audit:deploy` passes clean (no symlink/peer/undeclared-import findings).
- [ ] A cron-sync check asserts every `vercel.json` cron has a handler (and flags orphans), wired into CI.
- [ ] Build gates run and RPC-dependent verifies degrade to warnings when RPC is down.
- [ ] Dual-remote push discipline is documented/scripted; divergence is surfaced, not hidden.
- [ ] A fast rollback runbook exists (Vercel promote/rollback + neutral-message revert).
- [ ] `deploy-artifacts` test passes; changelog updated only if user-visible.
