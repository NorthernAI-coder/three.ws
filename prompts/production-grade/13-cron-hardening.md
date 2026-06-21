# Task 13 — Cron hardening: locks, run history, failure alerting

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track D —
> Reliability.** Depends on `12` (emits run outcomes + freshness into status). The
> reconciliation cron from `10` and the asset/seed crons all benefit.

## The thesis

Background jobs are where silent failures live. three.ws runs real crons — rewards
distribution, forge seeding, oracle ticks, uptime checks — but they can double-run (no
distributed lock), fail silently (inconsistent error handling), and never record when they last
succeeded (so staleness is invisible). A $1B platform's automated money/asset jobs are
locked, observable, alerting, and auditable.

## What exists today (read first)

- **Cron dispatcher** — [api/cron/[name].js](../../api/cron/[name].js): dynamic dispatch;
  per-cron error handling is inconsistent (some `captureException`, most `console.error`).
- **No concurrency lock** — [api/cron/forge-seed-cron.js](../../api/cron/forge-seed-cron.js)
  runs per-minute; if a run exceeds 60s, Vercel can spawn a second instance that races DB state.
- **No run history** — nothing records each cron's last-success time, so `/api/status` can't
  report staleness and a stalled `rewards-distribute` goes unnoticed for hours.
- **Uptime check is narrow** — [api/cron/uptime-check.js](../../api/cron/uptime-check.js) probes
  ~5 hardcoded public paths; new critical endpoints (e.g. paid flows) aren't monitored, and
  it's GET-only (no signed/payment flow coverage).
- **Shared secret** — a single `CRON_SECRET` ([api/_lib/env.js](../../api/_lib/env.js)) guards
  all crons.

## What to build

1. **Distributed lock per cron.** A real lease/lock (Redis SETNX with TTL or equivalent) so a
   given cron has at most one active run; a slow run blocks the next tick instead of racing.
   Release on completion; auto-expire on crash.
2. **Run-history / last-success tracking.** Record every cron run (name, start, end, outcome,
   duration, error) to a real table. Expose last-success + last-error so `12`'s `/api/status`
   can show freshness ("X last ran N min ago"). Add queue-depth visibility where a cron drains a
   work table (e.g. forge seed jobs) so backups are detectable.
3. **Uniform failure handling + alerting.** Standardize cron error handling (every cron
   captures to Sentry via `12` and emits a run-history failure row), and alert on
   failure/staleness/queue-backup through the existing ops channel (the uptime check already
   pages Telegram on failure — reuse that path; don't add a new vendor).
4. **Broaden synthetic monitoring.** Extend [uptime-check.js](../../api/cron/uptime-check.js) to
   cover the critical endpoints that matter now (including a safe synthetic check of a paid/
   signed path where feasible) instead of the 5 hardcoded public GETs.
5. **(If low-risk) per-cron secrets.** Move toward per-cron secrets or signed invocation so a
   single leaked secret can't trigger every cron. Keep it simple; don't break existing schedules.

## Hard rules specific to this task

- **Idempotent crons.** Locking + run-history must not cause a missed run to silently skip
  money/asset work — a lock that can't be acquired this tick should be picked up next tick, not
  dropped. Money jobs (rewards, reconciliation from `10`) must never double-pay.
- Don't change cron schedules or break the dispatcher contract; harden in place.

## Definition of done

README DoD, plus: each cron holds a lock (a forced overlap doesn't double-run); run history
records every execution with outcome; `/api/status` shows real cron freshness; failures/
staleness/queue-backups alert through the existing channel; synthetic monitoring covers the
real critical paths. Vitest covers the lock (no double-run) and the run-history write.
Changelog (`infra`). Self-review, then harden the next-weakest job.

Delete this file when done.
