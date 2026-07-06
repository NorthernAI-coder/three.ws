# 01 — Free tier lane for the aggregator (`/api/v1/x/*`)

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

The aggregator currently has three billing lanes (BYOK / plan / x402). Add the fourth and most
important one: a **genuine free tier**. An unauthenticated caller with no payment header gets a
per-IP quota on endpoints marked `free`, and only sees the 402 challenge after exhausting it.
This is what makes "the free crypto API" real instead of marketing copy — an agent must be able
to `curl https://three.ws/api/v1/x/coingecko/price?ids=solana` and get data with zero setup.

## Context

- Front door: `api/v1/x/[...slug].js` — read its billing-lane selection logic top to bottom
  before changing it. It already imports `limits`/`clientIp` from `api/_lib/rate-limit.js` and
  helpers from `api/_lib/http.js` (`rateLimited`, `setRateLimitHeaders`).
- Engine: `api/_lib/aggregator.js` (`executeUpstream`, `getPaidHandler`).
- Registry: `api/v1/_providers.js`. The `free` field contract (from 00-CONTEXT):
  `free: { perMin: <n>, perDay: <n> }` on an endpoint descriptor.
- Existing rate-limit plumbing: read `api/_lib/rate-limit.js` fully — reuse its store/limiter
  rather than inventing a second one. If it is purely in-memory per-instance, that is
  acceptable for per-minute quotas; for per-day quotas check whether the repo has a shared
  store (`api/_lib/db.js` has `sql`; grep for existing daily-quota patterns, e.g. in
  `api/_lib/usage.js` / `recordEvent`) and use the same mechanism the platform already uses.

## Tasks

1. **Engine support.** In the front door's lane selection: when the caller has no BYOK key, no
   bearer/session auth, and no x402 payment header, AND the resolved endpoint descriptor has a
   `free` field → serve the request through the free lane: enforce `perMin` and `perDay` per
   client IP per endpoint, execute the upstream, return the payload.
2. **Headers.** Free-lane responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
   `X-RateLimit-Reset` (reuse `setRateLimitHeaders`) plus `X-Free-Tier: 1`.
3. **Over-quota behavior.** When the free quota is exhausted, fall through to the existing x402
   lane (the 402 challenge). Add a JSON hint field to the 402 response body if the paidEndpoint
   rail allows attaching one (read `api/_lib/x402-paid-endpoint.js` to see; if the challenge
   shape is spec-locked, put the hint in a response header `X-Free-Tier-Reset: <iso>` instead):
   the caller should learn "free quota resets at T; or pay per call; or send a three.ws API
   key."
4. **Mark existing endpoints free.** In `api/v1/_providers.js`, add `free` quotas to every
   `coingecko` and `defillama` endpoint (they're keyless upstreams — suggested:
   `{ perMin: 30, perDay: 2000 }`). Do NOT mark `openai/chat` free (platform key costs real
   money per call).
5. **Discovery.** Extend `providerCatalog()` so each endpoint's entry includes its `free`
   quota (or `free: false`). Verify `GET /api/v1/x` renders it.
6. **Metering.** Free-lane calls still record a usage event (find how the BYOK lane calls
   `recordEvent` in the front door and mirror it with a `billing: 'free'` marker) so adoption
   is measurable — this data is how the owner knows the funnel works.
7. **Tests** in `tests/api/v1-free-tier.test.js`: free endpoint serves without auth; quota
   headers present; over-quota falls through to 402; non-free endpoint (openai/chat) still
   402s immediately; catalog exposes free quotas. Read a neighboring `tests/api/*.test.js`
   first for the harness pattern (how handlers are imported and req/res are faked). Run
   `npx vitest run tests/api/v1-free-tier.test.js` until green.
8. **Docs.** Update `docs/api-reference.md`'s section on `/api/v1/x` (or add one matching the
   neighboring format): the four lanes, the free-tier quotas, one runnable curl example using
   `ids=solana`. Changelog entry in `data/changelog.json` (tag: `feature`) — holder-readable:
   the three.ws crypto API now has a free tier.
9. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

Free lane works end-to-end locally (prove with a real invocation of the handler in tests),
quota falls through to a real 402, catalog + docs + changelog updated, tests green, committed,
pushed to threews (threeD attempted).
