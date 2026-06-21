# Track A — Reliability, Observability & Trust

This is the foundation every other track ships on. A platform is worth $1B when it is
**trusted with money, used daily, and built upon by others** — and all three collapse the
moment software loses funds, 500s under load, or fails silently. Track A makes that
impossible. Run it first; keep it green; never let B–G regress it.

Read `prompts/production-campaign/00-README-orchestration.md` and `00b-the-bar.md` first —
the global definition of done and the reliability/performance bars there are inherited by
every prompt below. This README only adds the track-local run order and the file-ownership
map that lets the seven prompts run in parallel without colliding.

> **This is hardening, not greenfield.** three.ws already ships `api/_lib/sentry.js`,
> `_lib/axiom.js`, `_lib/http.js` (the `wrap()` boundary used by ~91 of 100 handlers),
> `_lib/resilience.js` (cockatiel), `_lib/rate-limit.js` (@upstash/ratelimit),
> `api/client-errors.js`, `api/csrf-token.js`, a `pages/status.html`, `.lighthouserc.json`,
> `scripts/test-gate.mjs`, and `.github/workflows/ci.yml`. The gaps are **coverage and
> enforcement**: observability reaches only a handful of handlers and zero workers, ~42
> routes are unrate-limited, ~77 are unvalidated, the resilience helper has one call site,
> and CI gates lint+vitest but not the test gate, Lighthouse, or playwright. Extend what
> exists. Do not rewrite working code.

---

## The seven prompts

| ID | Mission (one line) | Run order / depends on |
|---|---|---|
| **A1** | Wire Sentry + Axiom + trace/request IDs across **every** `api/*.js` handler and every worker; alert on error-rate spikes; readable error dashboard. Make silent failure impossible. | **First.** Foundation for A2–A7's verification. No deps. |
| **A2** | One error-envelope shape, zod validation, `@upstash/ratelimit`, and idempotency keys across the ~100 `api/*.js` endpoints. | After A1 (so new boundaries emit traces). |
| **A3** | Audit every money path (x402 checkout, agent-wallet custody/sends, USDC, billing, mint): idempotency, on-chain confirm before success, "your funds are safe" failed state, no double-spend. | After A1 + A2 (envelope + traces in place). |
| **A4** | Auth, CSRF, secret hygiene (grep the built bundle), per-endpoint authorization, abuse prevention, security headers/CSP. | After A2 (shares the boundary helpers). |
| **A5** | Raise vitest+playwright coverage on money/auth/3D paths, kill flakes, enforce `test:gate` in CI. | After A2/A3/A4 land the code it must cover. |
| **A6** | Lighthouse CI as a gate, hold Core Web Vitals budgets, lazy-load Three.js, compress GLBs, mobile perf. | Parallel with A1–A5 (own lane). |
| **A7** | Circuit breakers (cockatiel), upstream fallback (RPC/3D/LLM/pump.fun), health checks, `/status` page, and fix the Forge "free engines all busy" dead-end into a graceful path. | After A1 (health feeds observability + status). |

**Recommended order:** A1 → (A2 ∥ A6) → (A3 ∥ A4 ∥ A7) → A5. A1 lands the telemetry every
other prompt verifies against; A5 is last because it must cover the code A2–A4 ship.

---

## File-ownership map (run in parallel without colliding)

Each prompt owns a lane. Where two prompts must touch a shared file, the **owner** is named;
the other prompt extends additively and never reformats. `data/changelog.json` and
`data/pages.json` are append-only for everyone.

| Prompt | Owns (primary write lane) | May read / extend additively (not owner) |
|---|---|---|
| **A1** | `api/_lib/sentry.js`, `api/_lib/axiom.js`, `api/_lib/alerts.js`, `api/client-errors.js`, worker telemetry shims, `docs/ops/observability.md` (new) | `api/_lib/http.js` `wrap()` (coordinate with A2) |
| **A2** | `api/_lib/http.js`, `api/_lib/validate.js`, `api/_lib/rate-limit.js`, per-handler validation/limits in `api/*.js`, `docs/API_AUDIT.md` | error-envelope shape consumed by A3/A4 |
| **A3** | `api/x402-checkout.js`, `api/_lib/agent-wallet.js`, `api/_lib/x402-*.js`, `api/_lib/subscription-billing.js`, `src/agent-wallet/`, money-path tests | idempotency keys from A2; envelope from A2 |
| **A4** | `api/csrf-token.js`, `api/_lib/csrf.js`, `api/_lib/auth.js`, `src/auth/`, security headers in `api/_lib/http.js` (coordinate with A2), `docs/security/` | per-endpoint authz wired into A2's boundary |
| **A5** | `vitest.config.js`, `playwright.config.js`, `scripts/test-gate.mjs`, `tests/**`, `.github/workflows/ci.yml` (test jobs) | covers code from A2/A3/A4 |
| **A6** | `.lighthouserc.json`, `.github/workflows/ci.yml` (lighthouse job), `scripts/optimize-glb.mjs`, `scripts/compress-glbs.mjs`, lazy-load wiring in `src/` 3D entry points | shares `ci.yml` with A5 — append jobs, don't reformat |
| **A7** | `api/_lib/resilience.js`, `api/_lib/forge-health.js`, `api/_lib/provider-health.js`, `api/forge.js` + `src/forge.js` busy path, `pages/status.html`, `api/health*.js` | health events flow into A1's telemetry |

**Shared-file protocol:** `api/_lib/http.js` is touched by A1 (telemetry inside `wrap()`),
A2 (envelope/validation/limits), and A4 (headers/CSP). A2 owns its structure; A1 and A4 add
named helpers and call them — no reformatting, stage explicit hunks, re-read `git diff
--staged` before commit. `ci.yml` is shared by A5 (test jobs) and A6 (lighthouse job): each
appends a job, neither rewrites the file.

When this directory contains only this `00-README.md`, Track A is done.
