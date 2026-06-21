# 09 · Graceful degradation for auth & payments when deps are down

> **Phase 1 — Reliability** · **Depends on:** 08 (shared breakers) · **Parallel-safe:** yes · **Effort:** M

## Mission
The audit found critical paths with no explicit fallback: if the DB is down, **login 500s**; if
Upstash Redis is down, **every `/api/x402/*` endpoint exits with code 1** on cold start. Define and
implement deliberate degradation behavior for the paths users cannot live without — fail *safe and
legibly*, never with a raw 500 or a silent fail-open on money.

## Context (read first)
- `CLAUDE.md` hard rule #9.
- `api/healthz.js` (already catches DB errors → liveness fallback), `api/status.js` (warming-up state).
- Auth: `api/_lib/auth.js`, `csrf.js`. Payments: `api/_lib/x402/*`, Redis requirement (`@upstash/redis`, `@upstash/ratelimit`) — note USE-15: x402 exits on missing Redis.
- Resilience layer from prompt 08.

## Build this
1. **Auth degradation** — when the DB/session store is briefly unavailable: distinguish "can't verify → 503 with Retry-After + clear message" from a hard 500. Never grant access on failure. Consider a short read-through cache for session validation so transient blips don't log everyone out.
2. **Payments + Redis** — x402 needs Redis for idempotency; do **not** fail-open (that risks double-spend). Instead: fail-*closed* with a clean 503 and a precise operator message, and add a startup/health signal that flags missing Redis loudly (pairs with prompt 16). If a safe degraded mode exists (e.g. DB-backed idempotency fallback), implement it explicitly and test it.
3. **Standard degraded response** — a shared helper for 503 + `Retry-After` + structured body, used consistently so clients (and the status page) can react.
4. **Decision matrix** — document, in `docs/`, for each critical dependency (DB, Redis, RPC, facilitator, S3/R2): what degrades, how, and what the user sees. This is the contract the chaos suite (05) verifies.

## Files likely in play
`api/_lib/auth.js`, `api/_lib/x402/*`, `api/_lib/http.js` (503 helper), `api/healthz.js`/`status.js`, `docs/degradation-matrix.md` (new), tests + chaos cases.

## Definition of done
- [ ] DB-down → auth returns 503 w/ Retry-After (not 500); never fail-open.
- [ ] Redis-down → x402 fails closed cleanly (or a tested DB-backed fallback), never silent-exit or double-spend.
- [ ] Degradation matrix doc committed; chaos suite asserts each row.
- [ ] Tests pass; no fail-open on money paths.
- [ ] Changelog: if users now see a clean "temporarily unavailable" instead of a broken page → **fix** entry.

## Guardrails
Follow CLAUDE.md. **Fail-closed on anything touching money or access.** Push both remotes.
