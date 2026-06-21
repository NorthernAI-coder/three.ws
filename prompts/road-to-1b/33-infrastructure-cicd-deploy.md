# 33 — Infrastructure, CI/CD & deploy safety

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 6 — Growth & business
**Owns:** `vercel.json`, build/deploy scripts, `.github/workflows/`, DB migrations, workers deploy, rollback.
**Depends on:** 09 (CI gate), 11 (observability).  ·  **Parallel-safe with:** 32.

## Why this matters for $1B
At scale, deploys must be safe, reversible, and observable. A bad deploy that can't be
rolled back, or a migration that corrupts data, is a company-ending event. Operational
maturity is part of the valuation.

## Mission
Make the build, deploy, migration, and rollback story safe, automated, and verified.

## Map
- Deploy: `vercel.json`, `npm run build:vercel`, `check:dist`, `audit:deploy`, `deploy`;
  the known trap that `npx vercel build` overwrites `api/*.js` in place
  (CLAUDE.md "Known traps" — guard against committing esbuild bundles).
- Data: `npm run db:migrate` / `db:status` (`scripts/apply-migrations.mjs`).
- Workers: `workers/` + their deploy scripts (e.g. `deploy:sniper`); R2 CORS
  (`apply:r2-cors`).

## Do this
1. Verify the production build is reproducible and `check:dist` + `audit:deploy` pass;
   add a guard (CI check) that rejects accidentally-committed esbuild bundles in `api/`.
2. Make migrations safe: forward-only, reviewed, with `db:status` reflecting state; never
   a destructive migration without a backup/rollback plan.
3. Define and test a rollback path (previous deploy + DB) and document the runbook.
4. Ensure workers deploy reliably and are monitored (ties prompt 11); secrets via env
   only (prompt 05).
5. Set correct caching/headers in `vercel.json` (ties prompt 12) and confirm both
   mirror remotes stay in sync per CLAUDE.md git rules.
6. Add a preview-deploy smoke (the existing `smoke:*` scripts) gating promotion to prod.

## Must-not
- No destructive migration without backup + rollback; no committing build bundles to `api/`.
- Do not deploy without `check:dist`/`audit:deploy` passing.

## Acceptance
- [ ] Reproducible build; bundle-in-`api` guard in CI; caching/headers correct.
- [ ] Migrations forward-only + reviewed; rollback path tested and documented.
- [ ] Workers deploy + monitored; preview smoke gates prod; `npm test` green; changelog `infra` entry.
