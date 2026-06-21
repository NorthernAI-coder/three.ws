# 30 — Load & stress testing

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

The day a launch goes viral is the day you find out whether the platform holds. If
the Forge GPU budget, the x402 verify path, or the public feeds buckle under a
traffic spike — or worse, if a spike silently burns the entire monthly Redis command
budget in a day — the moment you waited for becomes the outage that defines you. You
cannot guess capacity at $1B; you measure it, find the breaking point on purpose in a
safe lane, and prove the rate-limits and budgets hold before real users arrive.

## Mission

Identify the hottest and most-expensive endpoints, script realistic load tests
(k6/artillery) against a non-production target, prove the rate-limits and Redis
budget hold at their designed ceilings, find the breaking points, and document capacity.

## Map (trust but verify — files move)

- **Hottest endpoints** — [api/forge.js](../../api/forge.js) (text→3D, GPU-bound),
  [api/x402-checkout.js](../../api/x402-checkout.js) + [api/x402/forge.js](../../api/x402/forge.js)
  (payment prepare/verify), [api/feed.js](../../api/feed.js) +
  [api/feed-stream.js](../../api/feed-stream.js) + [api/trades/feed.js](../../api/trades/feed.js)
  (read-heavy, polled).
- **Rate limiting** — [api/_lib/rate-limit.js](../../api/_lib/rate-limit.js) — Upstash
  sliding-window (in-memory fallback for dev/tests); ~80+ named buckets; critical
  (money) buckets fail CLOSED, non-critical reads fail OPEN; `local: true` buckets
  never consume Redis. Key ceilings: `forge_paid_global_hourly` (600/h),
  `x402_verify_global_per_hour` (12000/h), `mcp3dGenerate` (30/h), `publicIp` (60/min).
- **Redis budget** — [api/_lib/redis-usage.js](../../api/_lib/redis-usage.js) —
  `REDIS_MONTHLY_BUDGET = 500_000` (Upstash free tier), warn 80% / crit 90%; daily ≈16,667.
- **x402 paid endpoint plumbing** — [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js).
- **Existing smokes (not load tests)** — [scripts/onchain-smoke.mjs](../../scripts/onchain-smoke.mjs)
  (`npm run smoke:onchain`), [scripts/smoke-mcp-remotes.mjs](../../scripts/smoke-mcp-remotes.mjs)
  (`npm run smoke:mcp`), [scripts/smoke-api-endpoints.mjs](../../scripts/smoke-api-endpoints.mjs).
- **Env** — [.env.example](../../.env.example) — `UPSTASH_REDIS_REST_URL/TOKEN`,
  `FORGE_PAID_GLOBAL_HOURLY`, `X402_VERIFY_GLOBAL_PER_HOUR` overrides.

> No load-test tooling exists yet — this is net-new. Add it under `scripts/` (or a
> new `loadtest/` dir) and an npm script; do not pollute the repo root.

## Do this

1. **Rank by cost and heat.** From the map, classify endpoints into GPU-bound
   (forge), money-path (x402 checkout/verify), and read-heavy (feeds, status,
   marketplace). Read `rate-limit.js` to record the exact ceiling for each so tests
   target the designed limit, not an arbitrary number.
2. **Pick the tool, add it cleanly.** Adopt k6 (preferred) or artillery as a
   dev/CI dependency. Create `loadtest/` (or `scripts/load/`) with one script per
   class: `forge.js`, `x402.js`, `feeds.js`. No scratch files in the repo root.
3. **Target a safe environment.** Run against a preview/staging deploy or a local
   `npm run dev`, NEVER production money paths. For x402, drive the 402 price-discovery
   and verify amplification path with synthetic/declined payments — never settle real
   funds, never use a non-`$THREE` mint.
4. **Prove the limiters hold.** Push each endpoint to and past its bucket ceiling;
   assert that critical money buckets fail CLOSED (reject, not melt) and read buckets
   fail OPEN/degrade. Confirm 429s are returned with correct `Retry-After`-style copy
   and no 5xx storms.
5. **Watch the Redis budget.** While a feeds/status load test runs, sample
   `redis-usage.js` accounting. Confirm high-frequency cheap reads use `local: true`
   buckets (per the June-2026 quota-burn incident) so a spike does not torch the
   500k/month budget. Flag any hot read that hits Redis on every request.
6. **Find the breaking point.** Ramp concurrency until p95 latency or error rate
   crosses an SLO (define one, e.g. p95 < 1s for reads, generation queue bounded).
   Record the knee of the curve per endpoint — that is your capacity number.
7. **Verify autoscaling/queueing holds.** Confirm forge's global hourly circuit
   breaker queues/sheds rather than overrunning the shared GPU budget, and that
   serverless concurrency limits don't cascade into timeouts on dependent calls.
8. Document results: per-endpoint ceiling, observed p50/p95, breaking point, Redis
   cost/request, and recommended limits in a `loadtest/README.md`. Run
   `node scripts/smoke-api-endpoints.mjs` (or `npm run smoke:onchain`) as a sanity
   pass against the safe target. Add a
   `data/changelog.json` entry only if a user-visible limit/behavior changed; `npm run build:pages`.

## Must-not

- Never load-test production money paths or settle real funds; use staging + synthetic payments.
- Never use a non-`$THREE` mint in any test fixture or payload.
- Never leave load scripts or result files in the repo root — `loadtest/` or `scripts/`, gitignore artifacts.
- Do not weaken a working rate-limit just to "pass" a test — the limit is the answer.
- Do not pull/fetch/merge from the `threeD` remote (push-only mirror). No mocks/stubs/TODOs.

## Acceptance (all true before claiming done)

- [ ] Endpoints ranked by cost/heat with each target's exact rate-limit ceiling recorded.
- [ ] k6/artillery scripts exist for forge, x402, and feeds, run against staging/local (never prod).
- [ ] At ceiling: critical buckets fail CLOSED, read buckets degrade; 429s correct, no 5xx storms.
- [ ] Redis budget is not torched by a read spike; high-frequency reads use `local` buckets.
- [ ] Breaking point (knee) documented per endpoint against a stated SLO.
- [ ] `loadtest/README.md` records capacity numbers + recommended limits; no artifacts committed.
- [ ] A smoke pass succeeds; changelog updated only if user-visible.
