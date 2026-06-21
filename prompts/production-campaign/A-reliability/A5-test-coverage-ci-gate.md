# A5 — Test Coverage & CI Gate

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** A2,
A3, A4 (their new code is what you must cover; their audit ledgers are your test checklists).

## Why this matters for $1B
Reliability that isn't enforced by CI is reliability that regresses on the next deploy. A1–A4 can
make the platform correct today; only a green, enforced gate keeps it correct tomorrow. The $1B
distinction is a platform where a money/auth/3D regression **cannot ship** — the build fails first.
A flaky suite is as bad as no suite: it trains everyone to ignore red, and then a real failure slips
through. This prompt turns the test surface into a trustworthy gate.

## Current state (read before you write)
- 219 specs under `tests/` (`*.test.js`). `vitest.config.js` and `playwright.config.js` configure
  unit + browser tests; `npm test` drives a real browser via Playwright and includes specs that need
  live DB/RPC credentials.
- `scripts/test-gate.mjs` runs a **curated, offline-safe subset** ("money-path confirmation handling,
  the HTTP cache/error boundary, custody spend guards, payment verification") so a regression in those
  FAILS THE DEPLOY. Its header explicitly invites adding new money/auth invariant tests.
- `.github/workflows/ci.yml` runs: Lint (`eslint`), Unit tests (`vitest run`), Source guards
  (`check-api-not-bundled`, `check:images`, `build:pages`), Typecheck (advisory). **It does NOT run
  `scripts/test-gate.mjs`, Playwright, or coverage thresholds.**
- **The gap:** coverage on money/auth/3D paths is unmeasured; flakes are unaddressed; the curated gate
  exists but isn't enforced in CI as the merge-blocking checkpoint; there are no coverage budgets.

## Your mission
### 1. Measure coverage, then raise it on the paths that matter
Turn on vitest coverage (v8/istanbul) and read the real numbers. Set **enforced** thresholds — not a
blanket global, but a meaningful floor on the critical lanes: money paths (A3's inventory),
auth/authz (A4), and the 3D pipeline (`src/glb-canonicalize.js`, `src/animation-retarget.js`,
forge/avatar flows). Write the missing tests to clear the floor. Cover the A2 boundary helpers
(envelope, validation, idempotency, rate-limit) and the A4 guards (CSRF, ownership, bundle-secret
scan) directly.

### 2. Make the money/auth/3D specs gate-grade and offline-safe
Extend `scripts/test-gate.mjs` to include the new A3/A4 invariant tests (double-submit idempotency,
confirm-failure "funds safe", concurrent cap, IDOR/authz rejection) — keeping every gate test
green-offline (no live DB/RPC/browser), per its own header rule. The gate is the fast, deterministic
checkpoint; the heavy suite stays in `npm test`.

### 3. Eliminate flakes — root-cause, don't retry-paper-over
Find the flaky specs (run the suite repeatedly; look for time/order/network nondeterminism). Fix the
cause: fake timers for time-dependent logic, deterministic seeds, awaited async, isolated state,
stable Playwright selectors (`getByRole`/test-ids, not brittle CSS) and proper auto-waiting instead of
arbitrary `waitForTimeout`. A test that's green 100/100 runs or it's deleted/fixed — no `retry: 3`
masking real instability on money/auth paths.

### 4. Enforce `test:gate` (and Playwright) in CI
Wire `scripts/test-gate.mjs` into `.github/workflows/ci.yml` as a **required**, merge-blocking job.
Add a Playwright job for the critical e2e flows (first-run Forge free lane, wallet connect, an x402
checkout dry path, the status page) — run it headless with the right browser deps, artifact traces on
failure. Append jobs additively; **A6 also edits `ci.yml`** for Lighthouse — coordinate, don't reformat
the file, stage explicit hunks.

### 5. Cover the new code from A2/A3/A4 explicitly
Walk A2's `docs/API_AUDIT.md` and A4's `docs/security/SECURITY_AUDIT.md` as checklists: each
"validated/rate-limited/idempotent/CSRF/authz ✓" claim should have a test that proves it. Where a claim
has no test, write one or correct the ledger. The audit and the tests must agree.

### 6. Document the testing contract
Add/refresh a short `docs/ops/testing.md` (or extend an existing testing doc): what runs in the gate
vs. the full suite, how to add a gate-grade test, the coverage floors and where they're enforced, how
to debug a Playwright trace. So the next contributor keeps the gate green by default.

## Definition of done
The critical lanes (money, auth, 3D) meet an **enforced** coverage floor; A2/A3/A4's new logic has
direct tests that match their audit ledgers; flakes are root-caused (no retry-masking on money/auth);
`scripts/test-gate.mjs` and a Playwright critical-path job are **required, merge-blocking** in
`ci.yml`; the testing contract is documented. `00b-the-bar.md`'s "existing tests pass; new logic has
new tests; money/auth/3D paths covered" is enforced by machinery, not goodwill. Inherits the global
definition of done in `00-README-orchestration.md`. Note explicitly which specs need live credentials
and therefore live in the heavy suite, not the gate.

## Operating rules (override defaults)
No mocks of **our own** money/RPC logic — test the real code paths with offline-safe inputs; **no real
third-party mints in fixtures** (use `$THREE` or a synthetic placeholder). `$THREE` is the only coin.
Stage explicit paths only (never `git add -A`); re-check `git diff --staged` before commit. You own
`vitest.config.js`, `playwright.config.js`, `scripts/test-gate.mjs`, `tests/**`, and the test jobs in
`.github/workflows/ci.yml` (shared with A6 — append, don't reformat). Don't weaken a threshold to pass;
fix the code or write the test.

## When finished
Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. coverage trend artifact, or a
mutation-test smoke on the money path). No changelog entry unless something user-visible changed (CI is
an internal chore) — but if a flaky-bug fix changed real behavior, log it (tag: `fix`). Then delete this
prompt file (`prompts/production-campaign/A-reliability/A5-test-coverage-ci-gate.md`) and report the
coverage numbers before/after, the gate job names now blocking merge, and any flake you quarantined with
a follow-up needed.
