# 15 — Test coverage to the bar

**Phase 4. Serial** (touches test config + CI gating).

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. Test stack: Vitest +
Playwright (`npm test` runs `vitest run && playwright test`), ~456 test files
already. Read [CLAUDE.md](../../CLAUDE.md). The only coin is **$THREE** — tests
must use the `$THREE` CA or synthetic placeholders, never a real foreign mint.

## Objective

A test suite you can ship behind: every money/chain path, every API contract,
and every critical user journey has automated coverage; flaky tests are fixed or
quarantined with a tracked reason; and coverage is measured and gated in CI so it
can't regress.

## Why it matters

You cannot move fast on a billion-dollar platform without a green suite you
trust. Tests are how a small team ships daily without breaking payments. Coverage
on money flows specifically is non-negotiable — a regression there is real lost
funds.

## Instructions

1. **Baseline.** Run the suite and capture coverage:
   ```bash
   npx vitest run --coverage
   npx playwright test --reporter=line
   ```
   Record overall % and, more importantly, per-area coverage for: `api/x402*`,
   payments, pump launch, wallet/auth, agent CRUD, marketplace, forge pipeline.
2. **Prioritize by risk, not by line count.** Fill gaps in this order:
   money/chain → auth/session → data mutations → core user journeys → everything
   else. 100% on a logger matters less than 100% on settlement.
3. **API contract tests** (`tests/api/`): for each money/chain + mutation
   endpoint — happy path, authz reject, validation reject, rate-limit, and
   idempotency (aligns with [08](08-api-hardening.md)). Reuse existing patterns
   like `tests/api/pump-trending-resilience.test.js`.
4. **E2E journeys** (Playwright): forge a model → view it; create an agent →
   appears in marketplace; connect wallet → sign in (SIWE); x402 checkout happy
   path; launch flow. These are the flows a regression must never break.
5. **Unit tests** for pure logic with edge cases: the canonicalize/retarget rig
   mappings (extend `tests/glb-canonicalize.test.js` for any new skeleton),
   pricing math, amount/address validation, x402 receipt verification.
6. **De-flake.** Identify flaky tests (run the suite 3x; diff failures). Fix the
   root cause (timing, shared state, real-network calls that should be stubbed at
   the boundary). If one truly can't be fixed now, mark it with a tracked reason
   and a follow-up — never delete coverage silently.
7. **Gate coverage.** Add a coverage threshold (start at current, ratchet up) and
   wire it so CI fails on regression (coordinate with
   [16 — CI/CD](16-ci-cd-hardening.md)). Critical dirs get a higher floor.
8. **No real external calls in unit tests.** Stub at the network boundary; keep
   smoke/integration tests that hit real services separate and clearly labeled.

## Definition of done

- [ ] Coverage measured; per-area numbers recorded for money/chain, auth,
      mutations, core journeys.
- [ ] Every money/chain + mutation endpoint has contract tests (happy + authz +
      validation + rate-limit + idempotency).
- [ ] Playwright E2E covers forge, agent-create, SIWE login, x402 checkout, and
      launch journeys.
- [ ] Suite runs green 3x consecutively (no flakes), or remaining flakes are
      quarantined with a tracked reason + follow-up.
- [ ] Coverage threshold enforced and wired into CI; critical dirs have a higher
      floor.
- [ ] No real foreign mint in any fixture; no real external call in unit tests.
- [ ] `npm test` passes.
- [ ] Changelog: skip (internal) — testing isn't user-visible.
