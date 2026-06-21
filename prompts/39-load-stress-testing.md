# 39 · Load & Stress Testing

## Mission
Know the platform's limits before users find them. Load-test the hot paths, find the breaking points,
and fix or document the scaling story so a launch spike doesn't take us down.

## Context
- Hot paths: page loads (static + SSR-ish), forge/avatar generation (expensive, upstream-bound),
  x402 settlement, auth, galleries/marketplace reads, multiplayer rooms (Colyseus), MCP remotes.

## Tasks
1. **Define SLOs:** target p50/p95 latency + error rate + concurrency for each hot path.
2. **Load scripts:** build repeatable load tests (k6/artillery or a Node harness in `scripts/`) for the
   read paths and the generation/payment paths (against a staging/test environment + free lanes).
3. **Find limits:** ramp concurrency until SLOs break; record where + why (DB, RPC, provider rate
   limits, function cold starts, memory). Capture the breaking point per path.
4. **Fix the cheap wins:** caching, connection pooling, batching, queueing for expensive jobs,
   backpressure; ensure rate limits (prompt 35) shed load gracefully rather than collapsing.
5. **Multiplayer:** stress Colyseus rooms with many concurrent clients; verify stability + memory.
6. **Document scaling:** a `docs/ops/scaling.md` with measured limits, current headroom, and the plan
   for the next 10×.

## Acceptance
- Load tests exist + are repeatable; measured p50/p95/error/concurrency per hot path vs SLOs.
- Breaking points documented; cheap wins applied; load shed gracefully under overload (no cascade).
- `docs/ops/scaling.md` captures limits + headroom + next-10× plan.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. Load-test only our own infra (staging/test env + free lanes) — no third-party targeting. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Put harnesses in `scripts/`, not the repo root. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
