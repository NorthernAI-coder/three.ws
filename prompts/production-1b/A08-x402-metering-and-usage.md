# A08 — x402 per-wallet metering, rate-limit headers & usage endpoint

> Phase A · Depends on: A07 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Paid endpoints today share coarse quotas but don't meter usage per paying wallet. That
means a single caller can exhaust an expensive pipeline (forge, mesh), there's no
`x-ratelimit-*` feedback for well-behaved agents, and a wallet can't see what it spent.
Metering is how you protect capacity, price fairly, and give agents the predictability
that makes them build on you.

## Where this lives (real files)
- `api/_lib/x402/access-control.js` — subscriber bypass, tier-based limits, API-key auth (extend here).
- `api/_lib/x402/audit-log.js` — settlement ledger (per-settlement records exist).
- `api/_lib/rate-limit.js` — Redis sliding-window limiters.
- `api/x402/*.js` — paid endpoints to instrument.
- `api/_lib/migrations/` — add `agent_x402_usage` if a durable rollup is needed.

## Current state & gaps
- No per-wallet calls/min, calls/day, or spend/month meter.
- No `x-ratelimit-limit/remaining/reset` headers on paid responses.
- No "your usage this month" read for a wallet.

## Build this
1. **Per-wallet meter:** in `access-control.js`, track calls and USD spend per wallet per minute/day/month (Redis counters; roll up to `agent_x402_usage` for durability). Tie the per-minute/day ceilings to tier (from A03).
2. **Standard headers:** return `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, and a `x-x402-spend-month` header on every paid response so agents can self-throttle.
3. **Usage endpoint:** `GET /api/x402/usage` (auth or signed by the wallet) returning calls + spend this minute/day/month and remaining quota per service.
4. **Min-charge / dust guard:** enforce a per-service `min_charge_usd` (from A07's config) so sub-cent endpoints can't be hammered for free; add per-IP limits on the cheapest routes.
5. **Graceful 429:** when metered out, return a clean 429 with `Retry-After` and a body explaining the limit + upgrade path (tier), never a generic error.

## Out of scope
- Pricing config (**A07**) and facilitator failover (**A09**).

## Definition of done
- [ ] Per-wallet metering enforced with tier-scaled ceilings; `agent_x402_usage` rollup persisted.
- [ ] All paid responses carry `x-ratelimit-*` + spend headers; 429s are clean with `Retry-After`.
- [ ] `/api/x402/usage` returns accurate per-wallet figures.
- [ ] Min-charge + per-IP guard on cheap endpoints; tests cover meter math + 429 path.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Hammer a paid endpoint past the limit → 429 + `Retry-After` + headers decrement correctly.
- `curl …/api/x402/usage` reflects the calls just made.
