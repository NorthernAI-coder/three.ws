# 05 · Load, chaos, a11y & visual-regression test infra

> **Phase 0 — Test confidence** · **Depends on:** 01–04 · **Parallel-safe:** yes · **Effort:** L

## Mission
A $1B platform proves it survives load, failure, and regressions — not just that the happy path
passes. Stand up the four test types the suite is missing today: **load/soak**, **chaos/resilience**,
**accessibility**, and **visual regression**. These run out-of-band (nightly / pre-GA), not on every PR.

## Context (read first)
- `CLAUDE.md`; existing partial perf tests (`tests/*club-perf*`, `*club-venue-load*`).
- Heaviest request paths: forge generation (300s `maxDuration` in `vercel.json`), x402-pay, agent create, avatar render.
- Dependencies already present you can lean on: `@playwright/test`, `fast-check` (property tests), `cockatiel` (for chaos injection of breakers).

## Build this
1. **Load/soak** — a script (`scripts/loadtest-*.mjs` or k6/autocannon if you add it as a devDep) that drives sustained RPS against forge-creation, x402-pay, and agent-create, recording p50/p95/p99 latency, error rate, and DB connection-pool behavior. Define target SLOs (e.g. p95 < Xs at N RPS) and fail the run if breached.
2. **Chaos/resilience** — tests that inject failure at boundaries (RPC down, DB timeout, Redis unavailable, payment facilitator slow) and assert graceful degradation, not 500 storms. Pair with Phase 1/5 work (breakers, fallbacks).
3. **Accessibility** — wire `@axe-core/playwright` (add devDep) into a Playwright project that scans the top ~15 pages and fails on serious/critical violations. This becomes the gate for prompt 21.
4. **Visual regression** — Playwright screenshot baselines for the top pages + key components (forge card, marketplace grid, dashboard). Tolerant diffing; baselines committed; a `--update-snapshots` path documented.
5. **Property tests** — use `fast-check` on at least the canonicalization / pricing / parsing logic where input space is large.

## Files likely in play
`scripts/loadtest-forge.mjs` / `loadtest-x402.mjs` (new), `tests/chaos/*.test.js` (new), `tests/a11y/axe.spec.*` (new), `tests/visual/*.spec.*` (new + baselines), `package.json` (new devDeps + `test:load`, `test:chaos`, `test:a11y`, `test:visual` scripts), nightly `.github/workflows`.

## Definition of done
- [ ] Each of the four suites runs locally and in a nightly CI job; documented in `tests/README.md`.
- [ ] Load run prints latency percentiles + error rate and enforces SLO thresholds.
- [ ] Chaos suite asserts degradation (no unhandled 500s) for RPC/DB/Redis/facilitator outages.
- [ ] axe suite is green on the top pages (or filed issues for what it flags → feeds prompt 21).
- [ ] Visual baselines committed; diff job runs in CI.
- [ ] Changelog: internal → **no** entry.

## Guardrails
Follow CLAUDE.md. Don't point load tests at production money endpoints with real funds — use a test/staging target or deterministic local server. Push both remotes.
