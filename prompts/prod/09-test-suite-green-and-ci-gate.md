# 09 — Test suite green & CI gate

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 1 — Correctness & hardening
**Owns:** `tests/`, `vitest.config.js`, `playwright.config.js`, `.github/workflows/ci.yml`, the `test*`/`lint`/`typecheck` scripts in `package.json`.
**Depends on:** `02` (no stubs)  ·  **Parallel-safe with:** `08`

## Why this matters for $1B
Green, meaningful tests plus a blocking CI gate are table stakes for fundability and
for shipping safely at scale. Real money rides on `api/` and the chain paths — a red
suite or a CI that waves failures through is how a money bug reaches production. The
repo already has ~456 test files and a `.github/workflows/ci.yml` merge gate; this
prompt makes it trustworthy.

## Mission
Get the full suite green, cover the highest-risk money/3D/auth paths, and make CI block
merges on red.

## Map
- Suites/scripts (`package.json`): `npm test` = `vitest run && playwright test`;
  `test:core` (single-worker vitest), `test:gate` (`scripts/test-gate.mjs`), `test:e2e`
  (`playwright test`), `test:pages` (`scripts/test-pages.mjs`).
- Config: `vitest.config.js`, `playwright.config.js` (`testDir: 'tests/e2e'`).
- Quality gates: `npm run lint` (`eslint .`), `npm run typecheck` (`tsc -p jsconfig.json`).
- CI: `.github/workflows/ci.yml` jobs — `lint`, `test` (`vitest run`), `guards`
  (`check-api-not-bundled.mjs`, `check:images`, `build:pages`), `typecheck` (currently
  `continue-on-error: true`, advisory).
- Risk-path example: `tests/glb-canonicalize.test.js` is the per-skeleton convention
  test required by `/CLAUDE.md`.

## Do this
1. Run `npm test`, `npm run test:e2e`, `npm run test:pages`, and `npm run test:gate`.
   Fix every failure, or quarantine it behind a tracked issue — no permanent skips.
2. Add tests for the highest-risk paths surfaced by prompt `01`: wallet/withdraw authz,
   x402 payment, the forge generation fallback chain (`api/forge.js` lanes), and
   `glb-canonicalize` per the `tests/glb-canonicalize.test.js` convention.
3. Make `npm run lint` and `npm run typecheck` pass for touched code; clear typecheck
   errors so `.github/workflows/ci.yml` can flip `typecheck` from advisory to blocking.
4. Verify the CI workflow runs lint + tests + guards and blocks on failure on PRs and
   pushes to `main`; tighten the typecheck job to a hard gate once it is clean.
5. Identify flaky tests (re-run suspect specs), de-flake them at the source, and record
   any that remain quarantined with their tracking issue.

## Must-not
- Do not `.skip`/`.only` a test to go green without a tracked issue.
- Do not weaken assertions, shrink fixtures, or delete cases to force a pass.
- Do not mock real APIs to dodge a failure — fix the code or the test setup.

## Acceptance
- [ ] `npm test`, `npm run test:e2e`, `npm run test:pages`, `npm run lint`, and
      `npm run typecheck` all green locally and in `.github/workflows/ci.yml`.
- [ ] CI blocks merges on red (typecheck moved off `continue-on-error` once clean).
- [ ] New tests cover the top risk paths (wallet/withdraw, x402, forge fallback, glb).
- [ ] Flaky tests de-flaked or quarantined with a tracked issue; `npm test` green.
- [ ] Changelog entry only if a user-visible behavior changed (usually internal).
