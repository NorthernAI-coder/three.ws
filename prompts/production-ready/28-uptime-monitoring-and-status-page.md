# 28 — Uptime monitoring & public status page

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Scale & infra
**Owns:** health endpoints (`api/healthz.js`, `api/_lib/forge-health.js`, `llm-health.js`, `provider-health.js`), external uptime monitoring, a public status page.
**Depends on:** `25`. Pairs with `27`, `29`.

## Why this matters for $1B
Enterprise buyers and serious developers expect a status page and a track record of
uptime. Knowing about outages before users do — and being transparent when they
happen — builds the trust a platform handling money requires.

## Mission
Real health checks for every critical dependency, external synthetic monitoring of
the user-critical flows, and a public status page with incident history.

## Map
- Existing: `api/healthz.js` (liveness), `api/_lib/forge-health.js` (probes the
  rate-limiter store / paid-lane health), `llm-health.js`, `provider-health.js`.
  Extend these into a deep readiness check.
- Critical deps to probe: DB (prompt `26`), Solana RPC, pump.fun feed, AI worker
  proxies, x402 facilitator, R2/CDN for GLBs.
- Observability sinks from prompt `25` feed the monitors/alerts.

## Do this
1. **Health endpoints:** keep `healthz.js` as a fast liveness check; add a deeper
   readiness check that verifies each critical dependency (DB connectivity, RPC
   reachable, AI proxy up via `llm-health.js`/`provider-health.js`, payment facilitator
   up, rate-limit store via `forge-health.js`) and returns a structured per-dependency
   status. No secrets in output.
2. **Synthetic monitoring:** external uptime checks (multi-region) for the homepage,
   forge generate path, a sample MCP call, and a checkout prepare — i.e. the flows
   that lose money/users when down, not just "is the site up."
3. **Alerting:** down/degraded triggers the on-call alert (prompt `25`) with the
   failing dependency named. Distinguish degraded (one dep slow) from down.
4. **Public status page:** a branded status page (own page or a vetted provider) showing
   component status (web, forge, payments, MCP, launches), uptime history, and incident
   posts. Linkable from the footer.
5. **Incident process:** document a lightweight incident runbook in `docs/`: detect →
   declare → communicate (status page) → mitigate → resolve → postmortem. Templates
   included.
6. **Cron/worker liveness:** monitor the crons + workers (oracle/sniper, auto-rig
   sweep) — alert if a scheduled run is missed or fails (prompt `27`).

## Must-not
- Do not expose secrets, internal hostnames, or stack details in health output.
- Do not let the deep health check be so heavy it becomes a self-inflicted load source
  — rate-limit/cache it.
- Do not alert without naming the failing component.

## Acceptance
- [ ] Liveness (`healthz.js`) + deep readiness endpoint report per-dependency status, no leaks.
- [ ] External multi-region synthetic checks cover homepage, forge, MCP, checkout.
- [ ] Down/degraded alerts fire with the failing dependency named.
- [ ] Public branded status page with component status + uptime + incident history, linked in footer.
- [ ] Incident runbook + templates in `docs/`.
- [ ] Cron/worker liveness monitored with missed-run alerts.
