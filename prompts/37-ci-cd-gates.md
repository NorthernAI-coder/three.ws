# 37 · CI/CD Pipeline & Quality Gates

## Mission
Make it impossible to ship broken: a fast, reliable CI pipeline that runs lint, types, tests, audits,
and build on every change, and a safe deploy path to Vercel for both mirrors.

## Context
- Scripts: `lint`, `typecheck`, `test`/`test:core`/`test:gate`, `test:e2e`, `audit:web`,
  `audit:pages`, `audit:handlers`, `check:images`, `audit:deploy`, `verify`, `build`.
- Two GitHub remotes: `threeD` (push-only mirror), `threews` (canonical). Deploy: `npm run deploy`.

## Tasks
1. **CI workflow:** a GitHub Actions (or equivalent) pipeline that on PR/push runs: install →
   `lint` → `typecheck` → `test:gate` → `test:core` → page/handler/image audits → `build`. Fast,
   cached, parallelized where possible. Fail the build on any gate failure.
2. **E2E in CI:** run `test:e2e` (Playwright) on a built preview; provide required secrets via CI env;
   mark which specs need creds.
3. **Pre-commit/pre-push hooks:** lightweight local hooks (format check, lint-staged, the esbuild-trap
   guard from prompt 04) — documented, opt-in friendly.
4. **Deploy safety:** document/automate the deploy so it runs `check:dist` + `audit:deploy` before
   `vercel --prod`; ensure both mirrors stay in sync (push `threeD` and `threews`); never force-push.
5. **Status checks:** required checks on the canonical repo before merge; coin-policy + secret scan in CI.
6. **Reproducibility:** pin tool versions; document Node version; cache `node_modules`/build artifacts.

## Acceptance
- CI runs lint+types+tests+audits+build on every PR and blocks on failure; E2E runs on a preview.
- Pre-commit/pre-push hooks documented incl. esbuild-trap + secret/coin-policy scan.
- Deploy path documented + safe; both mirrors stay in sync; runbook in `docs/ops/ci-cd.md`.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. Push to BOTH remotes (`git push threeD main && git push threews main`); never pull/fetch/merge from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/37-ci-cd-gates.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
