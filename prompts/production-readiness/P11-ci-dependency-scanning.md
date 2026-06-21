# P11 · CI dependency scanning + Dependabot + legacy-peer-deps de-risk

> **Workstream:** Security & compliance · **Priority:** P0 · **Effort:** M · **Depends on:** none

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map).
2. three.ws monorepo: vanilla JS + Vite frontend, Vercel functions in `api/`, Cloudflare workers in `workers/`, tests via `vitest` + Playwright (`npm test`), CI in `.github/workflows/`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never reference any other coin.

## Context
- CI lives in a single file, `.github/workflows/ci.yml`. Jobs today: `lint` (`npx eslint .`), `test` (`npx vitest run`), `guards` (`node scripts/check-api-not-bundled.mjs`, `npm run check:images`, `npm run build:pages`), `typecheck` (`npm run typecheck`), `pages` (`npm run test:pages`), `e2e` (`npx playwright test`). All run `npm ci` on Node 24. There is **no** dependency vulnerability scan anywhere.
- Repo root `.npmrc` contains exactly one line: `legacy-peer-deps=true`. This is load-bearing for the workspace install but dangerous — see below.
- This is an npm-workspaces monorepo: 20 workspaces declared in `package.json` (`agent-payments-sdk`, `avatar-sdk`, `mcp-server`, `walk-sdk`, `tour-sdk`, `packages/*`, etc.). `package.json` `engines.node` = `24.x`.
- A real prod outage on 2026-06-11 (465 consecutive 500s, 90 min of failed deploys) was partly caused by `legacy-peer-deps=true`: when `helius-sdk` 3.0 moved `@solana-program/stake` to peerDependencies, npm silently did not install it and every `/api/cron/*` died at module load with `ERR_MODULE_NOT_FOUND`. `scripts/audit-deploy-artifacts.mjs` is the **post-hoc** backstop (runs standalone, as phase 1 of `scripts/build-vercel.mjs`, and via `tests/deploy-artifacts.test.js`): it verifies every non-optional peerDependency in the prod lock tree resolves and every bare import in `api/**/*.js` is declared. There is no CI gate that runs it, and no scan that would have flagged a known-vuln dependency before it shipped.

## Problem / opportunity
Real money rides on this code (the CI header says so). A high/critical CVE in a transitive dependency would ship unflagged today, and `legacy-peer-deps=true` masks broken dependency trees until runtime. We need a gate that (a) fails the build on high/critical advisories, (b) keeps deps patched automatically, and (c) reduces the blast radius of `legacy-peer-deps`.

## Mission
Add a CI dependency-scan job that rejects high/critical vulnerabilities, add Dependabot config for npm + GitHub Actions, and add a CI gate that runs the existing `audit-deploy-artifacts.mjs` peer-dep check so legacy-peer-deps breakage is caught at PR time, not in prod.

## Scope
**In scope:** new `audit` job in `ci.yml`; `.github/dependabot.yml`; wiring `scripts/audit-deploy-artifacts.mjs` into CI; an allowlist mechanism for accepted/unfixable advisories.
**Out of scope:** rewriting dependencies, removing `legacy-peer-deps` outright (document the path; don't break the install), container/Trivy image scanning (no Docker images shipped here).

## Implementation guide
1. **`audit` job in `.github/workflows/ci.yml`.** Mirror the existing job shape (checkout@v4, setup-node@v4 node 24 + `cache: npm`, `npm ci`). Add:
   - `npm audit --audit-level=high` against the production tree. Because workspaces + `legacy-peer-deps` make raw `npm audit` noisy, prefer a deterministic wrapper: add `scripts/audit-deps.mjs` that runs `npm audit --json --omit=dev`, parses `vulnerabilities`, and exits 1 only if any advisory severity is `high` or `critical` AND its module is not in an allowlist. Keep the allowlist in `scripts/audit-deps-allowlist.json` as `{ "<advisoryId-or-ghsa>": { "reason": "...", "expires": "YYYY-MM-DD" } }`; treat an expired entry as not-allowlisted (fail). Print a table of what passed/blocked. Reference how `scripts/audit-deploy-artifacts.mjs` already shells `npm`/`git` via `node:child_process` and reads the lockfile for the style to match.
   - Wire `npm run audit:deps` into `package.json` scripts next to the existing `audit:deploy`.
2. **Run the existing peer-dep backstop in CI.** In the same `audit` job (or the `guards` job), add `- run: node scripts/audit-deploy-artifacts.mjs`. This is the check that would have caught the 2026-06-11 outage. Confirm it runs clean today first (`node scripts/audit-deploy-artifacts.mjs`) so you don't land a red gate; if it flags something real, fix the dep, don't disable the check.
3. **`.github/dependabot.yml`.** Two `package-ecosystem` blocks:
   - `npm`, `directory: "/"`, weekly, grouped minor+patch into one PR (`groups:`), `open-pull-requests-limit: 5`, `versioning-strategy: increase`. Because this is a workspaces root, the single `/` entry covers all workspaces via the root lockfile. Ignore major bumps for the fragile pinned forks (`helius-sdk`, anything under `agent-payments-sdk`'s declared deps) so a surprise major can't auto-merge into the legacy-peer-deps tree.
   - `github-actions`, `directory: "/"`, weekly — keeps `actions/checkout`, `actions/setup-node`, `actions/cache` patched.
4. **De-risk `legacy-peer-deps`.** Do NOT silently remove the `.npmrc` line — it will break `npm ci`. Instead: (a) add a comment to `.npmrc` explaining why it exists and the risk; (b) ensure `scripts/audit-deploy-artifacts.mjs` runs in CI (step 2) so the failure mode it guards is caught pre-merge; (c) in `docs/security.md` or a new `docs/dependency-policy.md`, document the path off legacy-peer-deps (audit which workspace forces it via `npm ls` / `npm install --no-legacy-peer-deps` dry run, list the offending peer conflicts) as a tracked follow-up. Picking the minimal real reduction (e.g. moving the flag from global to only the workspace that needs it, if feasible) is in scope; a full removal is not.
5. **Permissions.** The new job needs only `contents: read` (already the workflow default). Do not add write scopes.

## Definition of done
- [ ] `ci.yml` has an `audit` job that fails on high/critical advisories (not in allowlist) and runs `audit-deploy-artifacts.mjs`.
- [ ] `.github/dependabot.yml` covers npm (`/`) + github-actions, with majors ignored for the fragile forks.
- [ ] `scripts/audit-deps.mjs` + allowlist exist; `npm run audit:deps` works locally and is green on the current tree.
- [ ] `.npmrc` documented; dependency-policy doc records the legacy-peer-deps exit path.
- [ ] Existing tests pass (`npm test`); new logic has new tests (a `tests/audit-deps.test.js` covering allowlist-honored, expired-entry-fails, high-blocks).
- [ ] User-visible change → entry in `data/changelog.json`, then `npm run build:pages` (security work counts — tag `security`).
- [ ] `git diff` self-reviewed.

## Verification
- `node scripts/audit-deps.mjs` → exits 0 on clean tree, exits 1 when you temporarily seed a fake high advisory id outside the allowlist.
- `node scripts/audit-deploy-artifacts.mjs` → exits 0.
- `npx vitest run tests/audit-deps.test.js` passes.
- `actionlint .github/workflows/ci.yml` (or paste into GitHub's workflow editor) — no syntax errors; YAML parses.
- Validate `dependabot.yml` against schema (e.g. open a PR and confirm GitHub renders no config error in the Insights → Dependency graph → Dependabot tab).

## Guardrails
- No mocks, fake data, stubs, `TODO`s, or commented-out code. Real APIs; handle errors at boundaries with working fallbacks.
- Stage explicit paths only; concurrent agents share this worktree — re-check `git status` before committing.
- Push only when asked, to BOTH remotes: `git push threeD main` && `git push threews main`. Never pull/fetch from `threeD`.
- Never commit secrets. Watch the `npx vercel build` trap: never commit esbuild-bundled `api/*.js` (check `head -1` for `__defProp`).
