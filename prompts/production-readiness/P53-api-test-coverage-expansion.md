# P53 · API test coverage expansion (high-risk mutations)

> **Workstream:** Testing, CI & quality · **Priority:** P1 · **Effort:** L · **Depends on:** P58 (coverage instrumentation) recommended, not required

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md`.
2. three.ws monorepo: tests via `vitest` (`tests/**/*.test.js`) + Playwright (`tests/e2e/**/*.spec.js`); gate is `npm test`. CI in `.github/workflows/ci.yml`. Dev server `npm run dev` (port 3000).
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. In tests/fixtures use the $THREE CA or a clearly-synthetic placeholder — NEVER a real third-party mint.

## Context
The suite is large but lopsided. `find tests src -name '*.test.js' -o -name '*.test.mjs'` returns **~466 files**, and `tests/api/` alone holds ~200 of them. But `find api -name '*.js' -not -path '*/_*'` returns **~586 route handlers** (~966 including `api/_lib/**`). Whole families of money- and identity-moving routes have zero direct handler test:
- **Payments / x402:** good coverage on the *prepare/verify* layer (`tests/api/x402-paid-endpoint-replay.test.js`, `x402-spec.test.js`, `tests/x402-checkout-prepare.test.js`), but the checkout *record/settle* and merchant routes (`api/x402-checkout-record.js`, `api/x402-merchant.js`, `api/x402-status.js`) are thin.
- **pump dashboard mutations:** `api/pump/withdraw-prep.js`, `withdraw-confirm.js`, `accept-payment-prep.js`, `accept-payment-confirm.js`, `launch-prep.js` move value and are under-tested at the handler level.
- **Avatars/agents CRUD:** `tests/api/agents.test.js` is the gold-standard pattern; many sibling mutation routes (`api/forge-upload.js`, `api/forge-creation.js`, avatar persist routes) lack equivalents.

The established handler-test pattern is already excellent — follow it exactly:
- `tests/api/agents.test.js`: `vi.mock` for `_lib/auth.js`, `_lib/csrf.js`, `_lib/db.js` (tagged-template `sql` stub with a result queue), `_lib/agent-wallet.js`; handler imported *after* mocks; `makeReq`/`makeRes` build a Node `Readable` request and a capturing response.
- `tests/_helpers/monetization.js`: shared `createTestAgent`/`makeReq` — note the comment that `agent_id` must be a real UUID (`00000000-0000-4000-8000-…`) or `isUuid()` 404s before the logic runs.
- All responses flow through `api/_lib/http.js` (`json`/`error`/`serverError`/`rateLimited`), so assertions target `res.statusCode` + parsed `res.body` and the security headers it always sets (`x-content-type-options`, `x-frame-options`).

## Problem / opportunity
350+ mutation routes can regress silently. A broken `withdraw-confirm`, a CSRF gate that stops firing, or a settlement double-credit would ship green. The fix is not "test everything" — it's a **risk-ranked push** that closes the gap on the routes where a regression costs money or leaks identity, plus a measurable `api/` coverage target so the gap can't quietly reopen.

## Mission
Add handler-level vitest specs for the highest-risk untested `api/` mutation routes, following the existing `tests/api/agents.test.js` pattern, and define + document a coverage target for `api/`.

## Scope
**In scope:** New `tests/api/*.test.js` for ranked routes across auth, x402 settlement/merchant, pump withdraw/accept-payment, agents/avatars/forge CRUD. A short ranking doc. A coverage target proposal for `api/` (coordinate with P58).
**Out of scope:** Rewriting handlers (only fix a bug if a new test exposes one — note it). E2E (that's P54). Load (P55). Changing the global `npm test` gate semantics.

## Implementation guide
1. **Rank the gap (do this first, commit the ranking).**
   - List untested handlers: `comm -23 <(find api -name '*.js' -not -path '*/_*' | sort) <(grep -rhoE "api/[a-zA-Z0-9/_-]+\.js" tests/api | sort -u)` — treat as a starting signal, then eyeball.
   - Score each by **(writes value | moves money | touches auth/identity | CSRF-gated)**. Top of the list: `api/x402-checkout-record.js`, `api/x402-merchant.js`, `api/pump/withdraw-prep.js`, `api/pump/withdraw-confirm.js`, `api/pump/accept-payment-confirm.js`, `api/forge-upload.js`, avatar persist routes, any auth route lacking a test.
2. **For each chosen route, write a spec mirroring `tests/api/agents.test.js`:**
   - Declare `vi.mock('../../api/_lib/auth.js', …)`, `vi.mock('../../api/_lib/csrf.js', …)`, `vi.mock('../../api/_lib/db.js', …)` (sql result queue) BEFORE the dynamic `import('../../api/<route>.js')`.
   - Mock external boundaries the route hits (`_lib/agent-wallet.js`, Solana RPC fetch, facilitator verify/settle as `x402-paid-endpoint-replay.test.js` does) — never reach a real chain or RPC.
   - Reuse `makeReq`/`makeRes` (copy from `agents.test.js` or import from `tests/_helpers/monetization.js`).
3. **Cover the contract, not just the happy path** — each spec asserts:
   - **Method gate:** wrong method → 405 (handlers call `method(...)` from `http.js`).
   - **Auth gate:** no session/bearer → 401.
   - **CSRF gate:** cookie-session mutation without CSRF → 403 (see how `agents.test.js` mocks `requireCsrf`; the gate itself lives in `security-csrf-gates.test.js`).
   - **Validation:** malformed body → 400 via `validationError`.
   - **Happy path:** valid input → correct `sql` calls fired (assert against the captured `sqlState.calls`) + 200/201 shape.
   - **Idempotency/replay where relevant:** a confirm route must not double-settle (model on `x402-paid-endpoint-replay.test.js`).
4. **Coverage target.** With P58's v8 coverage enabled, add a per-directory threshold for `api/` (start at the measured baseline, e.g. lines ≥ current %, then ratchet). If P58 isn't landed yet, document the intended target in `tests/api/README.md`-style note and wire the threshold when P58 merges.
5. **Determinism.** No real network, no timers without `vi.useFakeTimers`, no `process.env` writes that leak across files (restore in `afterAll`, like `tests/api/forge-cost-cap.test.js`). Use synthetic Solana addresses (`Keypair.generate().publicKey.toBase58()` or `3wsSynthetic…`), the $THREE CA, or USDC mint — never a third-party mint.

## Definition of done
- [ ] New checks pass locally and in CI; `npm test` green.
- [ ] No flaky tests introduced; deterministic (no real network in unit tests).
- [ ] `git diff` self-reviewed.
- [ ] Ranking doc committed; ≥ the top-ranked untested money/auth routes now have specs covering method + auth + CSRF + validation + happy path.
- [ ] An `api/` coverage target is defined (threshold wired if P58 landed, else documented).

## Verification
```bash
# Run only the new/affected API specs fast:
npx vitest run tests/api
# Full gate:
npm test
# Prove a new test actually guards the route: temporarily break the route
# (e.g. drop the CSRF check or flip a status code), re-run the spec, confirm RED,
# then revert. Paste the before/after into your report.
git stash   # or git checkout -- the route, after the deliberate break
```

## Guardrails
- No real third-party coin mints in fixtures. No mocks of the kind CLAUDE.md forbids in product code — but test doubles/stubs ARE appropriate inside tests.
- Stage explicit paths; re-check `git status`. Push only when asked, to BOTH remotes.
- Watch the `npx vercel build` trap: never commit bundled `api/*.js` (check `head -1` for `__defProp`/`createRequire`).
