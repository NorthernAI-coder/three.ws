# 17 · Rate-limit coverage audit across all endpoints

> **Phase 3 — Security** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
Rate limiting exists and is well-built (`api/_lib/rate-limit.js`, Upstash sliding window, fails
closed in prod), but there's **no audit that every abuse-prone endpoint actually applies it**. A
single unlimited generation/mint/payment endpoint is a cost-and-abuse hole. Produce a coverage map,
close the gaps, and add a guard that flags any new endpoint shipping without an explicit limit decision.

## Context (read first)
- `CLAUDE.md`.
- `api/_lib/rate-limit.js` (`limits.*`, `clientIp`), `api/_lib/http.js` (`rateLimited`).
- Known-covered: paid `x402/*`, forge (global breaker), payments. Unmapped: many read endpoints (some intentionally).
- All ~100 handlers live in `api/`.

## Build this
1. **Coverage map** — a script (`scripts/audit-rate-limits.mjs`) that statically lists every endpoint and whether it calls a limiter, classifying each as: money/settlement, generation/compute, mint/launch, auth, write, or read. Output a table.
2. **Close gaps** — add appropriate buckets to any abuse-prone endpoint missing one: generation/compute (cost), mint/launch (`api/pump/*`), auth (brute-force), and write endpoints. Tune limits per class (per-IP and, where applicable, per-wallet/per-agent).
3. **Explicit opt-out** — endpoints that *intentionally* skip limiting (public caches, health) must declare it (a marker/comment the audit recognizes) so "no limit" is always a decision, never an oversight.
4. **CI guard** — the audit script fails CI if any non-opted-out endpoint lacks a limiter.
5. **Tests** — representative endpoints return 429 with correct headers past threshold; opted-out ones don't; limiter fails closed when Redis is down (coordinate with prompt 09).

## Files likely in play
`scripts/audit-rate-limits.mjs` (new), gap endpoints across `api/`, `api/_lib/rate-limit.js` (new buckets if needed), `.github/workflows`, tests.

## Definition of done
- [ ] Coverage map generated; every endpoint classified.
- [ ] All abuse-prone endpoints rate-limited with class-appropriate buckets.
- [ ] Intentional opt-outs explicitly marked.
- [ ] CI fails on an unmarked, unlimited endpoint.
- [ ] Tests cover 429 behavior + fail-closed.
- [ ] Changelog: **security** entry if user-observable (e.g. clearer 429s), else internal.

## Guardrails
Follow CLAUDE.md. Don't rate-limit so aggressively that legitimate agent traffic breaks — tune per class. Push both remotes.
