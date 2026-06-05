# Fix 02 — Upstash Redis request limit exhausted (P0, ~737 lines)

## The error (verbatim)

```
[api] unhandled UpstashError: Command failed:
ERR max requests limit exceeded. Limit: 500000, Usage: 500000.
See https://upstash.com/docs/redis/troubleshooting/max_request_limit_exceeded
```

Returns **500** on **every Redis-backed route**: `/api/explore`, `/api/marketplace/[action]`,
`/api/agents/[id]`, `/api/agents/[id]/skill-access`, `/api/auth/*`, `/api/solana-rpc`,
`/api/pump/*`, `/api/notifications`, `/api/community/*`, `/api/friends/presence-ticket`,
`/api/avatars/[id]`, `/api/widgets`, `/api/permissions/*`, `/api/erc8004/*`,
`/api/users/me/purchased-skills`, and more. The cap is account-wide so it takes down the
whole platform's caching/rate-limit/session layer at once.

## Root cause

Two compounding problems:
1. **Operational:** the Upstash plan's monthly request quota (500k) is fully consumed.
2. **Code-level (the part we fix here):** we are spending Redis requests far too liberally —
   the volume that burned 500k commands in a month points at missing caching discipline:
   per-request `GET`s with no in-memory/edge memoization, rate-limit checks on read paths,
   chatty multi-command flows where a pipeline would do, and **hard failures when Redis is
   unavailable** instead of degrading gracefully.

## Required fix (both halves — code first, it's the durable one)

### A. Fail open, never 500, when Redis is the dependency-not-the-payload
Audit the shared Redis client (the module every `[api] unhandled UpstashError` flows
through — find it: `grep -rln "UpstashError\|@upstash/redis\|Redis.fromEnv\|new Redis" api/_lib`).
- Cache reads (`explore`, `marketplace`, `agents`, `pump/trending`, token caches): on any
  Redis error, **fall through to the source of truth** (DB / upstream API) and serve the
  request. A cache miss is not a 500.
- Rate-limit checks: on Redis error, **fail open** (allow the request) — never block real
  users because the limiter backend is down. Log once, don't throw.
- Session/auth: where Redis backs nonce/session, surface a clean 503 with retry semantics,
  not an unhandled 500, and only where Redis is genuinely required for correctness.
- The goal: a Redis outage degrades performance, it does **not** take the API down.

### B. Stop burning requests
- **Memoize hot reads** in function memory with a short TTL (e.g. trending, token config,
  marketplace listings) so repeated calls within a warm instance don't each hit Redis.
- **Pipeline / batch** multi-key flows (`MGET`, `redis.pipeline()`) instead of N round-trips.
- **Drop redundant reads:** trace `explore` (300 lines) and `marketplace` (211) — they are
  the top burners. Confirm each Redis call is necessary; remove double-fetches and
  read-after-write reads that can use the value already in hand.
- **Cap rate-limit writes:** only `INCR` when actually enforcing, not on every read.

### C. Operational (call out to the user, don't silently assume)
- The plan quota is exhausted. Surface this explicitly: the user must either upgrade the
  Upstash plan or the usage reduction in (B) must bring monthly commands under 500k.
  Quantify the expected reduction from (B) so the user can decide.

## Verification

- Force the Redis client to error (temporarily point it at a bad URL locally) and confirm
  **every** affected route still returns real data (from DB/upstream), not 500.
- Add a counter/log of Redis commands per request for the top routes; confirm `explore` and
  `marketplace` drop materially after memoization/pipelining.
- After deploy, grep logs: `UpstashError ... max requests limit` no longer produces 500s —
  at most a single warn-level "redis degraded, served from source".

## Definition of done

No route 500s due to Redis being unavailable or over-quota; hot reads are memoized/pipelined;
the per-month command burn is measurably reduced; the user has the numbers to decide on plan
upgrade. Graceful degradation is wired everywhere Redis is touched.
