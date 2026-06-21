# E05 — Redis quota: proactive monitoring + degraded-feature signaling

> Phase E · Depends on: E02, E03 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Rate limiting, idempotency, caching, and locks all lean on Upstash Redis, which has a hard
daily command ceiling. A June 2026 incident showed quota exhaustion can degrade critical
limiters platform-wide. Make quota burn proactively visible and make degradation graceful
and intentional rather than a surprise.

## Where this lives (real files)
- `api/_lib/redis.js` — singleton client; `api/_lib/redis-usage.js` — quota burn tracking (reactive).
- `api/_lib/rate-limit.js` — 360+ limiters (fail-closed for money/auth, fail-open for reads), `local: true` for high-frequency reads.
- `api/cron/quota-check.js` — quota monitoring cron.
- `api/_lib/cache.js` — cache + in-flight coalescing + Redis fallback.

## Build this
1. **Proactive thresholds:** alert at 50/70/85% of the daily ceiling (not just at exhaustion), via E02's tiered alerting; project burn rate to estimate time-to-exhaustion.
2. **Command-cost reduction:** audit the hottest limiters/caches; expand `local: true` for non-critical high-frequency reads; coalesce/raise TTLs where safe; batch where possible — drive structural burn down.
3. **Graceful degradation:** when approaching the ceiling, automatically shed non-critical Redis usage (serve more from in-memory, relax non-critical limiters) while keeping money/auth limiters fail-closed; reflect this in `degraded_features` (E03).
4. **Client hint:** surface quota pressure on `/api/config` so the UI can soften polling/retries during a crunch.
5. **Runbook:** document what to do at each threshold and how raising the ceiling vs shedding load trades off.

## Out of scope
- Replacing Redis or the limiter design — optimize + protect what's there.

## Definition of done
- [ ] Proactive alerts at graduated thresholds with a time-to-exhaustion estimate.
- [ ] Measured reduction in command burn on the hottest paths (document before/after).
- [ ] Automatic, intentional degradation keeps money/auth safe; reflected in degraded_features + client hint.
- [ ] Runbook written; `npx vitest run` green; changelog entry (infra); committed + pushed to both remotes.

## Verify
- Simulate high burn (lower the threshold locally) → graduated alerts + degradation engage; money/auth limiters stay fail-closed.
