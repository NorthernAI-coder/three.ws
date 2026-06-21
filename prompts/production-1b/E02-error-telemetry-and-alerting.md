# E02 — Error telemetry dashboard + tiered alerting & escalation

> Phase E · Depends on: E01 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Errors are captured to Sentry and alerts go to Telegram, but there's no aggregation, no
severity, and no escalation — so a money-path failure looks the same as a cosmetic one and
can go unnoticed. Build the visibility and alerting that lets the team catch and triage
incidents before users do.

## Where this lives (real files)
- `api/_lib/sentry.js` — fire-and-forget error envelope.
- `api/_lib/alerts.js` — Telegram ops alerts (dedup by signature, recovery announce).
- `api/_lib/axiom.js` — metrics ingest.
- `api/cron/` — health crons (forge-smoke, uptime-check, world-health, quota-check).

## Build this
1. **Error aggregation:** emit structured error events (code, route, domain: payment|render|infra|auth) to Axiom alongside Sentry, so you can query "429s yesterday by route" and "payment errors this hour."
2. **Severity tiers:** classify alerts (critical = money/auth/RPC down; warning = degraded; info). Critical alerts page louder (and are ready to wire to PagerDuty/Slack via an env-configurable sink, not Telegram-only).
3. **Spike detection:** alert when a route's error rate exceeds a baseline (e.g. >Nσ or > threshold), not just on single failures; dedup + auto-recover messages (reuse `alerts.js`).
4. **Dashboards:** define the Axiom queries/dashboards for error rate by route, p95 latency, RPC provider health, payment success rate, Redis quota burn.
5. **SLO doc:** write the target SLOs (error rate <0.5%, p95 <2s, payment success >99.5%) in `docs/` and tie alerts to them.

## Out of scope
- Producing the structured logs (**E01**) — this consumes them.

## Definition of done
- [ ] Structured error events queryable by route + domain; severity tiers implemented with an env-configurable critical sink.
- [ ] Spike-based alerts fire (not just single errors), with dedup + recovery.
- [ ] Dashboards + SLO doc exist; a forced money-path error triggers a critical alert.
- [ ] `npx vitest run` green; changelog entry (infra); committed + pushed to both remotes.

## Verify
- Force a burst of errors on one route → spike alert (critical) fires once + recovers; confirm the Axiom query shows them.
