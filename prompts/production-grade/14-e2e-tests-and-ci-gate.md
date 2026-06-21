# Task 14 — E2E tests for the money paths + put Playwright in the merge gate

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track E —
> Engineering excellence.** Lands early; it's the safety net every other task ships behind.
> Coordinate with `08`/`10` (checkout/payments specs) so E2E covers the real flow.

## The thesis

The critical flows that *make the money* — checkout/x402 payment, signup/auth, Forge
generation, avatar creation — have thin or no end-to-end coverage, and Playwright **isn't in
the CI merge gate** (it's manual-only). That means a regression in checkout can ship green. A
$1B platform gates its revenue paths behind automated browser tests that block merge.

## What exists today (read first)

- **Unit tests are solid** — ~219 vitest files; Forge, avatar, wallet, on-chain parity covered
  ([tests/](../../tests/)).
- **E2E is thin** — [playwright.config.js](../../playwright.config.js) runs ~10 specs in
  [tests/e2e/](../../tests/e2e/) (e.g. `coin-buy-trade.spec.js`, `nav-auth.spec.js`). There is
  **no** end-to-end test for the main x402 checkout/payment modal, the full signup/identity
  flow, the Forge text→3D happy path, or avatar creation.
- **CI doesn't gate E2E** — [.github/workflows/ci.yml](../../.github/workflows/ci.yml) runs
  lint/vitest/build but `npm run test:e2e` is not in the merge gate.
- **No coverage reporting** — [vitest.config.js](../../vitest.config.js) has no coverage config;
  the tested % of API handlers is unknown.

## What to build

1. **E2E specs for the critical flows** (real browser, real app via `npm run dev`, against real
   or properly-seeded test data — no mocked happy paths that hide breakage):
   - **Checkout / x402 payment** — the full pay flow (coordinate with `08`/`10`): quote →
     pay → confirm → unlock/receipt, including the failure/retry branch.
   - **Signup / auth** — complete the identity flow (extend
     [tests/e2e/nav-auth.spec.js](../../tests/e2e/nav-auth.spec.js)): email/SIWS/SIWE/OAuth
     callback chain through to a signed-in session.
   - **Forge text→3D** — prompt → generate → result rendered (free lane), with the empty/error
     states asserted.
   - **Avatar creation** — create/upload → rigged → reachable agent page.
2. **Put Playwright in the CI gate.** Add an E2E job to
   [.github/workflows/ci.yml](../../.github/workflows/ci.yml) that runs the specs on PR and
   **blocks merge** on failure. Make it reliable (seeded data, retries on genuine flake only,
   sensible timeouts) — a flaky gate gets ignored, which is worse than none.
3. **Coverage reporting.** Add coverage (c8/v8) to [vitest.config.js](../../vitest.config.js),
   report it in CI, and set a floor on **changed** files so new code can't ship untested.
   Don't retrofit a giant global threshold that blocks unrelated work — gate the diff.

## Hard rules specific to this task

- **Real flows, real assertions.** E2E that stubs the thing it claims to test is worse than no
  test. Use real endpoints / seeded test fixtures; if a flow needs test funds, use a synthetic
  placeholder (**$THREE** CA or `THREEsynthetic1111…`), never a real third-party mint.
- The gate must be **trustworthy**: if it's flaky, fix the flake or quarantine the spec
  explicitly with a tracked reason — never `continue-on-error` the whole job to make it pass.

## Definition of done

README DoD, plus: the four critical flows have passing E2E specs (including a failure branch
for checkout); the E2E job runs on PR and blocks merge; coverage is reported and a changed-files
floor is enforced; the gate is green and not flaky over repeated runs. Changelog
(`infra`/`improvement` — or omit if you judge it internal-only per CLAUDE.md). Self-review,
then add the next-most-valuable E2E flow you noticed was uncovered.

Delete this file when done.
