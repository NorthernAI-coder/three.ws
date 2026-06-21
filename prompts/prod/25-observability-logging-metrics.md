# 25 — Observability (logging, metrics, error tracking)

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Scale & infra
**Owns:** `api/`, `workers/`, `public/error-reporter.js`, logging/metrics/tracing infra.
**Depends on:** `06`, `08`. Pairs with `27`, `28`.

## Why this matters for $1B
You cannot operate or scale what you cannot see. At $1B-trajectory volume, you need to
know within seconds when payments fail, RPC degrades, or a deploy regresses. Observable
systems are the difference between a 5-minute incident and a 5-hour one.

## Mission
End-to-end observability: structured logs, error tracking with alerting, key business
+ system metrics on dashboards, and request tracing across api/workers.

## Map
- `public/error-reporter.js` already captures client runtime errors — wire it into a
  real sink and dedupe/group. Backend handlers in `api/`, workers in `workers/`.
- Prefer a vetted OSS/SaaS sink (Sentry-class for errors, an OTEL-compatible metrics/
  trace backend) over hand-rolling. Additive — don't churn working handlers.

## Do this
1. **Structured logging:** adopt one structured logger (JSON) across `api/` + workers
   with a request id, route, latency, status, and identity (no secrets/PII — prompt
   `05`/`07`). Replace ad-hoc `console.log`. Log levels respected per env.
2. **Error tracking:** server + client errors flow to an error tracker with source
   maps, grouping, release tagging, and alerting on new/spiking errors. Wire
   `error-reporter.js` to it. Confirm the happy path is silent.
3. **Metrics:** instrument the metrics that matter — request rate/latency/error per
   route, payment success/failure + GMV, generation jobs (queued/succeeded/failed/
   p95 duration), RPC/AI upstream latency + error + spend, rate-limit hits, signups/
   activations. Cost meters per paid upstream (ties to prompt `08`).
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
- [ ] Server + client errors flow to a tracker with source maps, grouping, alerting.
- [ ] Key system + business metrics instrumented, incl. per-upstream cost meters.
- [ ] Trace ids propagate API → upstream → worker.
- [ ] System + business dashboards exist and are documented.
- [ ] Actionable alerts with runbooks; SLOs defined for critical paths.
