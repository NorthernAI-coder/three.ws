# 08 — Rate limiting & abuse prevention

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 1 — Correctness & hardening
**Owns:** `api/`, `workers/`, the shared limiter in `api/_lib/rate-limit.js` + `api/_lib/http.js`, Upstash Redis usage (`api/_lib/redis.js`).
**Depends on:** `07` (security hardening)  ·  **Parallel-safe with:** `09`

## Why this matters for $1B
Every expensive call — text-to-3D, image gen, LLM proxy, Solana RPC, mint/launch —
spends real GPU, model, and chain budget. Unmetered, one abuser (or a distributed
flood) drains the spend cap, trips fail-closed lanes, and takes the platform down for
everyone. Abuse = downtime = lost users and burned margin. Metering is what lets a free
tier exist without bankrupting the business.

## Mission
Put per-identity and per-IP rate limits, per-tier quotas, and abuse defenses on every
expensive or money-moving endpoint, standardized on the existing shared limiter.

## Map
- Shared limiter: `api/_lib/rate-limit.js` (Upstash `Ratelimit`, sliding-window,
  in-memory dev fallback, `FORGE_PAID_GLOBAL_HOURLY` platform ceiling, cost limiters
  that fail closed when Redis is unconfigured). Helpers `rateLimited` +
  `setRateLimitHeaders` (with `Retry-After`, RFC 9110 §10.2.3) live in `api/_lib/http.js`.
- Health signal: `api/_lib/forge-health.js` already probes the rate-limiter store
  ("paid generation lanes fail closed" when it is down) — keep this accurate.
- Cost-bearing endpoints: text-to-3D `api/forge.js` (already lane-aware via `rl` /
  `rateLimited`), image gen `api/_mcp3d/text-to-image.js` + `api/_mcp3d/vertex-imagen.js`,
  LLM proxy `api/llm/anthropic.js`, RPC `api/solana-rpc.js`, mint/launch under
  `api/pump/`, the x402 family via `api/_lib/x402-paid-endpoint.js` and `api/x402/`.

## Do this
1. Inventory every cost-bearing / money-moving handler in `api/` and `workers/`. For
   each, record who pays (GPU, model tokens, RPC credits, chain fees) and whether it
   already routes through `rateLimited` from `api/_lib/http.js`.
2. Standardize on `api/_lib/rate-limit.js` — do not hand-roll new limiters. Add
   sliding-window limits keyed by authenticated identity first, then by IP. Never key
   off client-supplied identity (verify the session as `07` requires).
3. Add per-tier quotas: a free tier and a higher-ceiling $THREE-holder tier. Keep the
   platform-wide circuit breaker (`FORGE_PAID_GLOBAL_HOURLY` and the x402 facilitator
   backstop) intact and env-tunable.
4. Protect upload endpoints (size, MIME type, count) before any expensive processing.
5. Add lightweight bot/abuse heuristics (burst detection, repeated-junk-payload
   rejection) and surface a clear `429` with `Retry-After` via `rateLimited`.
6. Add tests under `tests/` simulating burst traffic against the limited endpoints,
   asserting `429` + `Retry-After` once the window is exhausted.

## Must-not
- Do not trust client-supplied identity for keying limits.
- Do not silently drop requests — always return `429` with a reason and `Retry-After`.
- Do not weaken the fail-closed behavior of the cost/money limiters when Redis is down.

## Acceptance
- [ ] Every expensive endpoint has a documented limit + per-tier quota, all routed
      through `api/_lib/rate-limit.js`.
- [ ] `429` responses are designed (reason + `Retry-After`); upload guards in place.
- [ ] Burst tests pass; `npm test` green; `npm run lint` + `npm run typecheck` clean.
- [ ] Changelog `improvement`/`security` entry if user-visible; `npm test` green.
