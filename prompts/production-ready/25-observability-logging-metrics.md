# 25 — Observability (logging, metrics, error tracking)

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Scale & infra
**Owns:** `api/`, `workers/`, `api/_lib/sentry.js`, `api/_lib/usage.js`, `api/_lib/redis-usage.js`, `public/error-reporter.js`.
**Depends on:** `06`, `08`. Pairs with `27`, `28`.

## Why this matters for $1B
You cannot operate or scale what you cannot see. At $1B-trajectory volume, you need to
know within seconds when payments fail, RPC degrades, or a deploy regresses. Observable
systems are the difference between a 5-minute incident and a 5-hour one.

## Mission
End-to-end observability: structured logs, error tracking with alerting, key business
+ system metrics on dashboards, and request tracing across api/workers.

## Map
- Error tracking is already wired: **`api/_lib/sentry.js`** (server) + 
  **`public/error-reporter.js`** (client). Usage/metering: `api/_lib/usage.js`,
  `api/_lib/redis-usage.js`. Health probes: `api/_lib/forge-health.js`,
  `llm-health.js`, `provider-health.js`, `api/healthz.js`.
- Extend what exists; don't introduce a parallel stack. Additive, per memory guidance.

## Do this
1. **Structured logging:** adopt one structured logger (JSON) across `api/` + workers
   with a request id, route, latency, status, and identity (no secrets/PII — prompt
   `05`/`07`). Replace ad-hoc `console.log`. Log levels respected per env.
2. **Error tracking:** confirm `sentry.js` + `error-reporter.js` capture server +
   client errors with source maps, grouping, release tagging, and alerting on new/
   spiking errors. Ensure the happy path is silent (cross-check prompt `03`).
3. **Metrics:** instrument the metrics that matter — request rate/latency/error per
   route, payment success/failure + GMV, generation jobs (queued/succeeded/failed/
   p95 duration), RPC/AI upstream latency + error + spend, rate-limit hits, signups/
   activations. Build on `usage.js`/`redis-usage.js` for per-upstream cost meters
   (ties to prompt `08`).
4. **Tracing:** propagate a request/trace id through API → upstreams → workers so a
   slow payment can be traced end-to-end.
5. **Dashboards:** a system dashboard (latency/errors/saturation/cost) and a business
   dashboard (signups, activation, GMV, generations, MCP calls). Document where they
   live in `docs/`.
6. **Alerting:** actionable alerts (not noise) for: payment failure rate, 5xx spike,
   upstream-spend approaching cap, worker down, error spike, latency SLO breach.
   Route to the right channel; define ownership/runbook links.
7. **SLOs:** define SLOs for the critical paths (checkout, forge, page load) and track
   error budgets.

## Must-not
- Do not log secrets, private keys, or PII.
- Do not alert on everything — every alert must be actionable.
- Do not hand-roll a metrics backend when a vetted one fits.

## Acceptance
- [ ] One structured logger across api + workers with request ids; no secret/PII logging.
- [ ] Server + client errors flow to the tracker with source maps, grouping, alerting.
- [ ] Key system + business metrics instrumented, incl. per-upstream cost meters.
- [ ] Trace ids propagate API → upstream → worker.
- [ ] System + business dashboards exist and are documented.
- [ ] Actionable alerts with runbooks; SLOs defined for critical paths.
