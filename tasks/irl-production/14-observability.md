# Task 14 — Observability: log the right things, alert on what matters

**Phase:** 3 (backend) · **Effort:** S · **Files:** `api/irl/*.js`, `api/cron/irl-reap.js`, `multiplayer/src/rooms/IrlRoom.js`

## Why
"Zero error" requires *knowing* when something breaks in production. Today several
IRL failure paths swallow errors silently and key moderation events leave no audit
trail. Wire IRL into the platform's existing observability so operators see failures
and moderation actions.

## Read first (verify before fixing)
- Existing ops/error pipeline — search the repo for `sendOpsAlert`, `[client-error]`,
  and the Telegram alerts wiring (memory `observability-stack`); reuse it, don't invent.
- Silent catches — `api/irl/interactions.js:~251`, `api/irl/interactions-stream.js:~163`
- Moderation hide path — `api/irl/report.js:~129-140`
- Reaper cron — `api/cron/irl-reap.js`
- Realtime room — `multiplayer/src/rooms/IrlRoom.js`

## Scope — confirm, then fix

1. **No silent swallows.** Replace bare `.catch(() => {})` on meaningful operations
   (view_count increment, SSE send, etc.) with a structured `console.error`/`warn`
   that includes endpoint + context. Keep truly-ignorable best-effort calls cheap but
   logged at `warn`.

2. **Moderation audit + alert.** When a pin is auto-hidden after crossing the report
   threshold, log a structured event AND fire an ops alert (`sendOpsAlert`) with the
   pin id, report count, and timestamp, so the review team has visibility.

3. **SSE + poller metrics.** Periodically log connection count, dispatch rate, error
   count, and current delay for the interactions-stream poller, so a stuck poller is
   diagnosable.

4. **Reaper cron telemetry.** The IRL reaper should log how many pins it expired per
   run (and alert on an anomalous spike or repeated failures).

5. **Realtime room health.** Confirm `IrlRoom` logs join/leave/error at a useful
   level without leaking PII (presence is anonymous — keep it that way).

## Constraints
- Reuse the existing alert/log pipeline and respect privacy (no precise coordinates,
  no device identifiers in logs/alerts).
- **Do not edit `data/changelog.json`** — return the proposed line (observability is
  usually internal-only; include a line only if there's a user-visible effect).

## Definition of done
- [ ] No meaningful error path is silently swallowed; all log with context.
- [ ] Pin auto-hide fires a structured log + ops alert.
- [ ] Poller + reaper emit periodic health/telemetry lines.
- [ ] Any pure helper (e.g. log-sampling) unit-tested; `npm test` green.
