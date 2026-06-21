# 27 — Deploy pipeline & rollback safety

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Scale & infra
**Owns:** `vercel.json`, build scripts (`build`, `build:vercel`, `build:all`), `deploy/`, CI/CD, `npm run audit:deploy`, the two git remotes.
**Depends on:** `01`, `05`, `25`. Pairs with `28`.

## Why this matters for $1B
Shipping safely and reverting instantly is what lets a team move fast without breaking
trust. A bad deploy that can't be rolled back is an outage. Repeatable, gated deploys
are an engineering-maturity signal in diligence.

## Map
- `vercel.json` (buildCommand, outputDirectory, installCommand, env, functions,
  routes, crons). Build pipeline scripts in `package.json`. `npm run audit:deploy`.
- **Two remotes** (`/CLAUDE.md`): `threeD` (push-only mirror) + `threews` (canonical).
  Never pull/fetch/merge from `threeD`. Watch the `npx vercel build` trap that
  overwrites `api/*.js` in place — guard against committing esbuild bundles.

## Do this
1. **Reproducible build:** `npm ci` from a clean tree builds deterministically;
   document the exact build/deploy steps in `docs/deploy.md`. Confirm `audit:deploy`
   passes and what it checks.
2. **Pipeline gates:** deploys to production require green lint + typecheck + tests
   (prompt `01`). Wire CI so `main` deploys only on green; PRs get preview deploys.
3. **Source-bundle trap guard:** add a pre-commit/CI check that fails if any committed
   `api/*.js` or `public/*` begins with esbuild markers (`__defProp`/`createRequire`),
   per the known trap. Document the recovery (`git restore -- api/ public/`).
4. **Both-remotes discipline:** document and (where possible) script the dual push
   (`threeD` + `threews`) so neither deploy target falls behind; never force-push;
   never pull from `threeD`.
5. **Migrations in deploy:** DB migrations (prompt `26`) run as an ordered, gated step
   with a clear order relative to code deploy (backward-compatible migrate → deploy →
   cleanup). No deploy that assumes an unrun migration.
6. **Rollback:** verify instant rollback to the previous good deployment works (Vercel
   promote/rollback), and document the exact steps + when to use it. Practice one.
7. **Crons:** audit `vercel.json` crons (incl. the auto-rig sweep) — each has a clear
   purpose, idempotency, failure alerting (prompt `25`), and won't stampede.
8. **Env parity:** preview/staging mirrors prod env keys (prompt `05`); no
   prod-only surprises.
9. **Post-deploy smoke:** an automated post-deploy smoke (`smoke:onchain`,
   `smoke:mcp`, key page loads) gates promotion and pages on failure.

## Must-not
- Do not commit esbuild-bundled `api/*.js` source (run the guard).
- Do not pull/fetch/merge from `threeD`; do not force-push either remote.
- Do not deploy code that depends on an unrun migration.

## Acceptance
- [ ] `docs/deploy.md` documents reproducible build + deploy + rollback steps.
- [ ] Production deploy gated on green CI; PRs get previews.
- [ ] CI guard blocks committed esbuild-bundled source files.
- [ ] Dual-remote push documented/scripted; no pulls from `threeD`.
- [ ] Migrations run as a gated, ordered, backward-compatible step.
- [ ] Rollback verified by an actual practice run; documented.
- [ ] Crons audited (purpose/idempotency/alerting); post-deploy smoke gates promotion.
