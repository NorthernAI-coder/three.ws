# 14 — CI/CD gates

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** `.github/workflows/*.yml`, build guards in `scripts/`, the Vercel build pipeline.
**Depends on:** `12`, `13`. **Pairs with:** `04` (route audit), `45` (migrations).

## Why this matters for $1B
CI is the seatbelt that lets a team move fast. The deploy that triggered this whole effort
failed because a strict route audit caught an undocumented page — that's the system
working. The goal: make every class of regression (broken build, failing test, leaked
bundle, undocumented route, accessibility break, money-path failure) impossible to merge.

## Map — real anchors
- `.github/workflows/ci.yml` — jobs: lint (eslint, new-errors-only), unit (vitest), source guards (`check-api-not-bundled.mjs`, `check:images`, `build:pages`), typecheck (advisory). Concurrency cancels in-flight runs per branch.
- `scripts/build-vercel.mjs` — the multi-phase Vercel build; `scripts/audit-page-index.mjs --strict` gates it.
- `scripts/check-api-not-bundled.mjs` — prevents esbuild bundles in `api/*.js`.

## Do this
1. **Make the gate complete.** Ensure CI blocks merge on: lint errors, unit test failures, `test:gate` (money/auth), the page-route audit (`audit:pages`), image-loading audit (`check:images`), handler audit (`audit:handlers`), and the api-not-bundled guard.
2. **Add E2E to CI** (from `13`) on PRs — at least the smoke subset — with the dev-server + Playwright setup, retried once, and a sane timeout.
3. **Typecheck:** decide whether to promote typecheck from advisory to blocking; if not yet clean, track the gap and gate net-new type errors only.
4. **Build parity:** ensure CI runs the same `build:vercel` gates Vercel runs, so a green PR can't red the deploy. Catch the esbuild-bundle trap in CI (the guard exists — confirm it runs on the right paths).
5. **Required checks + branch protection:** document which checks must pass; ensure the deploy only proceeds when CI is green.
6. **Speed:** cache `node_modules`/build artifacts; keep PR feedback under ~10 min. Parallelize independent jobs.
7. **Secret scanning in CI:** add a secret scan step (coordinate with `05`) so a leaked key fails the PR.

## Must-not
- Do not let a deploy proceed on a red gate to "unblock" a release — fix the cause.
- Do not add flaky E2E that erodes trust in the gate; quarantine or fix flakes immediately.
- Do not disable the api-not-bundled or route-audit guards.

## Definition of done
- [ ] CI blocks merge on lint, unit, test:gate, page/image/handler audits, api-not-bundled, secret scan.
- [ ] E2E smoke runs on PRs and gates merge; CI build mirrors the Vercel gates.
- [ ] Branch protection / required checks documented; deploy only on green.
- [ ] PR feedback time is reasonable (caching + parallelism); `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
