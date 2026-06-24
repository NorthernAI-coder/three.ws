# 36 · Observability — Logging, Metrics, Errors, Alerting

## Mission
When something breaks in production, we know before users tell us, and we can diagnose it fast.
Structured logs, error tracking, key metrics, and alerts on the flows that matter (payments, generation, auth).

## Context
- `api/client-errors` endpoint exists for client error reporting. Usage events flushed via
  `api/cron/flush-usage-events` (cron). Workers run oracle/sniper.

## Tasks
1. **Client errors:** ensure the global error/unhandledrejection handlers (prompt 08) report to
   `/api/client-errors` with enough context (route, user agent, release), and that those land somewhere
   queryable. Add release/version tagging.
2. **Server logs:** structured, leveled logs in `api/` + `workers/` (no `console.log` soup, no secret
   leakage); request IDs to correlate; consistent error logging at boundaries.
3. **Key metrics:** instrument the money/critical flows — payment success/failure, generation
   success/latency/cost, auth success/failure, rate-limit hits, queue depth. Wire to usage events.
4. **Alerting:** define alerts/thresholds for payment failure spikes, generation error rate, auth
   failures, 5xx rate, cron failures; document where alerts go.
5. **Dashboards:** a minimal ops dashboard or documented queries for the above.
6. **Cron health:** verify the cron jobs (flush-usage-events, auto-rig-sweep, smart-money-rollup, etc.)
   succeed and surface failures.

## Acceptance
- Client + server errors are captured, release-tagged, and queryable; no secret leakage in logs.
- Money/critical flows emit metrics; alerts defined with thresholds + destinations documented.
- Cron jobs monitored; a runbook (`docs/ops/observability.md`) explains how to diagnose incidents.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs; logs must never leak secrets. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/36-observability-logging-alerting.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
