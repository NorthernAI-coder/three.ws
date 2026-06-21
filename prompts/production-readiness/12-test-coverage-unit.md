# 12 — Unit & integration test coverage

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** Vitest suites under `tests/` + colocated `*.test.js`; `vitest.config.js`.
**Depends on:** `01`. **Pairs with:** `13` (e2e), `14` (CI), `44` (money safety).

## Why this matters for $1B
Tests are how a small team ships fast without breaking money. The repo already has ~466
test files and a `test:gate` for critical money/auth paths — the goal now is closing
coverage gaps on the logic that, if wrong, loses funds or corrupts data. Coverage is a
diligence checkbox; correctness on money paths is survival.

## Map — real anchors
- `npm test` → `vitest run` + `playwright test`. `npm run test:core` → `vitest run --maxWorkers=1`. `npm run test:gate` → `scripts/test-gate.mjs` (critical money/auth subset).
- `vitest.config.js` — 120s timeout, forks capped at min(4, cpus-1), `@grpc/*` deduped.
- Tests in `tests/*.test.js` + colocated (e.g. `api/_lib/coin/*.test.js`).

## Do this
1. **Coverage report:** run `vitest run --coverage` (add the coverage dep/config if missing). Identify the lowest-covered high-risk modules: `api/_lib/x402/*`, `api/_lib/agent-wallet.js`, `api/_lib/pump*.js`, `api/_lib/three-gate.js`/`require-three.js`, `api/_lib/secret-box.js`, `api/_lib/db.js`, retarget/canonicalize (`src/glb-canonicalize.js`, `src/animation-retarget.js`).
2. **Pure-logic first:** add deterministic unit tests for pricing math, amount/units conversions, idempotency-key derivation, gating tier thresholds, bonding-curve quotes, address validation, and bone-name canonicalization (the CLAUDE.md rule: every new skeleton mapping gets a `tests/glb-canonicalize.test.js` case).
3. **Boundary + error cases:** for each money/auth module, test the failure paths — invalid input, replay, insufficient balance, RPC failure, unauthorized caller — not just the happy path.
4. **Integration tests** for handler flows that can run without live third parties (use the existing test seams; do **not** introduce mocks of real APIs into production code — keep test doubles in test files only).
5. **Make `test:gate` comprehensive:** ensure the critical-path gate covers every money/auth invariant so CI blocks regressions there.
6. **Flaky-test sweep:** find and fix nondeterminism (time, ordering, network). No `.skip`/`xfail` left without a written reason + removal condition.

## Must-not
- Do not add mocks/fakes into shipped `src/`/`api/` code — test doubles live in test files only (CLAUDE.md forbids mocks in production code).
- Do not chase a coverage % by testing trivial getters; prioritize money/auth/data-integrity logic.
- Do not leave skipped tests without a documented reason.

## Definition of done
- [ ] Coverage measured; high-risk money/auth/data modules meaningfully covered incl. failure paths.
- [ ] New deterministic unit tests for pricing, idempotency, gating, quotes, address validation, canonicalization.
- [ ] `test:gate` covers all critical money/auth invariants.
- [ ] No flaky/skipped tests without a written reason; `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
