# 27 · Metrics, dashboards & SLOs

> **Phase 5 — Observability & ops** · **Depends on:** 26 · **Parallel-safe:** yes · **Effort:** L

## Mission
Today Axiom records only payment metrics, optionally. There's no per-endpoint latency, no error
budgets, no SLA tracking — so a degradation is invisible until users complain. Build the metrics,
dashboards, SLOs, and alerts that let the team see platform health at a glance and get paged before
customers notice.

## Context (read first)
- `CLAUDE.md`.
- `api/_lib/axiom.js` (existing sink), the structured request-summary logs from prompt 26, `api/status.js`/`healthz.js`.
- Critical user-facing metrics: forge generation success rate + latency by engine, x402 settlement success rate + latency by rail, avatar create/rig success, RPC latency by provider, error rate by endpoint.

## Build this
1. **Emit metrics** — from the request-summary + key-flow events (prompt 26), record: request count, latency percentiles (p50/p95/p99), error rate per endpoint; plus domain metrics (forge success% by engine, payment settle% by rail, refund rate, breaker state from prompt 08).
2. **Dashboards** — build Axiom (or chosen backend) dashboards: platform overview, forge health, payments health, RPC/dependency health. Commit the dashboard definitions/queries to the repo (`infra/dashboards/`) so they're versioned.
3. **SLOs + error budgets** — define SLOs (e.g. forge success ≥99%, payment settle ≥99.9%, API p95 < Xms, availability target) and track burn rate.
4. **Alerts** — page/notify on SLO breach, error-rate spikes, forge/payment success drops, breaker-open storms, reconciliation backlog (prompt 14). Route to the team channel; document thresholds.
5. **Synthetic checks** — a periodic synthetic that exercises forge (free lane) + a read path and alerts if the user-visible flow breaks, independent of internal metrics.

## Files likely in play
`api/_lib/metrics.js` (new, on top of axiom + logs), `infra/dashboards/*` (new, versioned defs), alert config, a synthetic-check worker/cron, `docs/ops/slos.md`.

## Definition of done
- [ ] Per-endpoint latency + error-rate metrics flowing; domain metrics (forge/payments/RPC) live.
- [ ] Versioned dashboards in-repo; rendering real data.
- [ ] SLOs + error budgets defined and tracked.
- [ ] Alerts fire on breach/spike/success-drop, routed to the team.
- [ ] Synthetic user-flow check running + alerting.
- [ ] Changelog: internal/ops → **no** entry.

## Guardrails
Follow CLAUDE.md. Keep metric emission async/fire-and-log (use the prompt-06 helper) so telemetry never slows or breaks a request. Push both remotes.
