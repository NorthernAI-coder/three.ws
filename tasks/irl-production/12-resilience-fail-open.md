# Task 12 — Resilience: fail-open on dependency outages, no tight retry loops

**Phase:** 3 (backend) · **Effort:** M · **Files:** `api/irl/pins.js`, `api/irl/interactions-stream.js`

## Why
IRL depends on Redis (rate limit), the DB (Neon), and the Guardian/watsonx
moderation check. When a dependency degrades, the feature must degrade gracefully —
never 500 the whole endpoint, never spin a tight retry loop that saturates Vercel
concurrency, never block every request on a dead upstream.

## Read first (verify before fixing)
- Placement rate limit (`Promise.all([burst, hourly])`) — `api/irl/pins.js:~634-649`
- Guardian/watsonx check (4s bound, per-request) — `api/irl/pins.js:~76-100`
- SSE poller breaker + retry delay — `api/irl/interactions-stream.js:~120-196`
- SSE `seen` dedupe set growth — `api/irl/interactions-stream.js:~176-181`

## Scope — confirm, then fix

1. **Rate-limiter fails open with a log.** Wrap the Redis token-bucket calls in
   try/catch: on a Redis outage, log a warning and allow the request (fail open) —
   the comment already says this is the intent, but confirm there's actually a
   try/catch and a log, not an unhandled rejection that 500s the POST.

2. **Guardian degraded-state cache.** A dead moderation upstream currently costs
   every placement its full timeout. Cache the "degraded" verdict for ~60s so one
   failure doesn't make every subsequent placement wait. Keep the per-request
   timeout tight (~2s) and fail toward allowing placement (or your existing safe
   default) with a log.

3. **SSE breaker on persistent failure.** The poller must engage its breaker / back
   off on ANY persistent error, not only quota errors — otherwise a DB outage turns
   into a tight `POLL_MS_MIN` retry loop. After N consecutive failures, degrade to
   heartbeat-only with exponential backoff; recover when the DB returns.

4. **Bounded dedupe memory.** Ensure the SSE `seen` set is pruned (size or
   time-based) so a long-lived instance under constant activity doesn't creep toward
   unbounded memory.

## Implementation guidance
- Match the existing limiter/breaker patterns already used elsewhere in the repo
  (see the forge/ratelimit health work in memory `redis-quota-incident`) for
  consistency.
- Where logic is pure (backoff schedule, breaker state machine, dedupe pruning),
  extract it and unit-test it under `tests/api/`.
- **Do not edit `data/changelog.json`** — return the proposed line in your summary.

## Definition of done
- [ ] Simulated Redis/DB/Guardian outage degrades gracefully (no 500, no tight loop,
      no per-request multi-second stall) — covered by unit tests on the pure parts.
- [ ] Breaker + backoff verified by test; dedupe pruning verified by test.
- [ ] `npm test` green.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-production/12-resilience-fail-open.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
