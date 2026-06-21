# 29 — Load & stress testing

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Scale & infra
**Owns:** load-test harness (in `scripts/` or `tests/load/`), `api/`, `workers/`, caching/CDN config.
**Depends on:** `06`, `08`, `25`, `26`. Pairs with `27`, `28`.

## Why this matters for $1B
A platform that goes viral and falls over wasted the moment. You need to know the real
ceiling of each critical path, where it breaks first, and that autoscaling + rate
limits + caching hold under a launch-day spike. Capacity confidence is fundability.

## Mission
Establish load profiles for the critical paths, find the breaking points, fix the
first bottlenecks, and document headroom + scaling behavior.

## Map
- Critical paths: homepage + key pages (static/CDN), forge generation (expensive,
  upstream-bound), checkout/x402 (money, DB + RPC), MCP tool calls, launch feed reads,
  agent profile reads.
- Use a vetted tool (k6 / Artillery). Run against a staging/preview env, never prod,
  with synthetic data — and **never** real third-party mints (prompt `22`).

## Do this
1. **Define profiles:** realistic mixes — steady-state, a marketing-spike ramp, and a
   sustained soak — with target RPS/concurrency per path based on growth goals.
2. **Build the harness** in `scripts/` or `tests/load/` (kept, documented, not
   throwaway), parameterized by env + RPS, with auth handled. Cover read paths and at
   least one safe write path (idempotent, against staging).
3. **Run & measure:** capture p50/p95/p99 latency, error rate, throughput, and
   upstream/DB saturation (via prompt `25` dashboards). Identify the first bottleneck
   on each path.
4. **Fix the top bottlenecks:** add/verify caching (CDN for static + GLBs, query
   caching for hot reads), connection pooling/limits for DB + RPC, queueing/
   backpressure for generation, and confirm rate limits (prompt `08`) shed load
   gracefully instead of collapsing.
5. **Autoscaling:** verify serverless function concurrency limits and worker scaling
   behave under spike; no cold-start cliff on the money path; no unbounded fan-out to
   a single RPC node.
6. **Failure-mode under load:** confirm that when an upstream degrades under load, the
   resilience patterns (prompt `06`) and circuit breakers keep the rest of the site up
   (graceful degradation, designed error states — prompt `12`).
7. **Document capacity:** record measured headroom per path, the breaking point, and
   the scaling levers in `docs/capacity.md`. Set alert thresholds (prompt `28`) below
   the breaking point.

## Must-not
- Do not load-test production or use real third-party mints/addresses.
- Do not "fix" a bottleneck by removing a rate limit or a safety check.
- Do not leave the harness as an undocumented throwaway in the repo root (use `scripts/`).

## Acceptance
- [ ] Documented load profiles (steady/spike/soak) with growth-based targets.
- [ ] Repeatable, parameterized load harness in `scripts/` or `tests/load/`.
- [ ] p50/p95/p99 + error rate + saturation measured per critical path; bottlenecks identified.
- [ ] Top bottlenecks fixed (caching, pooling, queueing); rate limits shed load gracefully.
- [ ] Autoscaling verified under spike; no cold-start cliff on checkout.
- [ ] Graceful degradation confirmed when an upstream fails under load.
- [ ] `docs/capacity.md` records headroom, breaking points, levers; alerts set below them.
