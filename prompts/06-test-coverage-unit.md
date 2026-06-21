# 06 · Unit & Integration Test Coverage (Vitest)

## Mission
Raise unit/integration coverage on the logic that, if it breaks, costs money or trust: payments,
wallet, gating, avatar/rig pipeline, routing/curriculum, SDK surfaces. Tests must be real (no
mocked-away core logic) and deterministic.

## Context
- Runner: Vitest (`npm run test:core` for `--maxWorkers=1`, `vitest run` for full). E2E is separate
  (Playwright, prompt 07). Existing tests in `tests/`.
- `npm run test:gate` (`scripts/test-gate.mjs`) is the gate; `npm run typecheck` (tsc on `jsconfig.json`).
- Pure logic to target first: `walk-sdk/src/*` (roster/config/retarget), `src/glb-canonicalize.js`
  (already has tests — extend for new skeletons), `api/_lib/*` (payment/x402 helpers, skill license),
  curriculum/playlist builders, price/quota/access-matrix logic.

## Tasks
1. **Coverage baseline:** run vitest with coverage; record per-area %. Identify the highest-risk
   uncovered modules (money, auth, gating, rig retarget, route resolution).
2. **Write tests** for those modules: happy path + boundary + failure. For `glb-canonicalize`, add a
   case for every skeleton convention named in CLAUDE.md (Mixamo/Avaturn/Unreal/VRM/VRoid/VRM1.0/
   Daz/MakeHuman/Blender `.L`/simple `shoulderL`).
3. **x402 / payment helpers:** test amount math, currency = USDC, the malformed-RPC-reply recovery
   path, and that no code path can reference a non-`$THREE` token.
4. **Determinism:** remove flakiness (no real network in unit tests — use the project's existing
   fixtures/harness; keep integration tests that DO hit real services in a clearly separated suite
   that the gate can run with creds).
5. **Wire the gate:** ensure `npm run test:gate` runs the new suites and fails on regression.
6. Keep `npm run typecheck` clean for any files you touch.

## Acceptance
- Coverage on money/auth/gating/rig modules materially up (state before/after numbers).
- `npm run test:core` and `npm run test:gate` green and deterministic across 3 consecutive runs.
- No core logic mocked away to make a test pass; no `$THREE`-policy violation slips through.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first (they override defaults)
- No mocks of core logic, no fake data, no stubs that hide real behavior. Real implementations.
- $THREE is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths (never `git add -A`); re-check before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`.
- Tests are internal — no changelog entry needed unless a user-visible bug was fixed along the way.
- Push to BOTH remotes when asked; never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.
