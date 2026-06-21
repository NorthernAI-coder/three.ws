# 11 — Observability: logging, monitoring, alerting

**Phase 2. [parallel-safe]** with 07–10.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform on Vercel functions +
Cloudflare workers, with PostHog and Vercel Analytics already loaded on the
frontend and a `public/error-reporter.js`. Read [CLAUDE.md](../../CLAUDE.md). The
only coin is **$THREE**.

## Objective

You can see what the platform is doing in production: structured logs with
request/trace context, client + server error reporting into one pipeline, uptime
and latency monitoring on every critical path, and alerting that pages a human
before users complain. No silent failures, no blind spots on money flows.

## Why it matters

At a billion-dollar bar you operate the platform, not just ship it. If a payment
endpoint starts 500ing or RPC latency spikes, you must know in minutes — from a
metric, not a tweet. Observability is the difference between a 5-minute incident
and a 5-hour one.

## Instructions

1. **Structured logging.** Replace ad-hoc `console.log` in server code
   (`api/`, `workers/`) with a structured logger (level, message, requestId,
   userId/agentId where safe, dependency, duration). Never log secrets, private
   keys, full tokens, or PII. Add a `requestId` at the edge and thread it through.
   ```bash
   grep -rIn "console.log\|console.error\|console.warn" --include=*.js api/ workers/ | grep -v node_modules | wc -l
   ```
2. **Unified error reporting.** Wire client errors (`public/error-reporter.js`)
   and server errors into one sink (Sentry or the existing pipeline — check
   deps/env before adding a new vendor). Capture: message, stack, requestId,
   route, release/commit. De-dupe and group. Cross-check with
   [03 — error boundaries](03-harden-error-boundaries.md): every reported catch
   lands here.
3. **Critical-path monitoring.** Define SLOs for the money/chain and core paths
   (forge generate, x402 checkout, pump launch, login, marketplace load). Add
   uptime + latency checks (synthetic monitors or a `/api/health` + external
   pinger). Record p50/p95/p99 latency and error rate per path.
4. **Health endpoints.** Ensure a real `/api/health` (and per-worker health) that
   checks downstream deps (RPC reachable, DB reachable, KV reachable) and returns
   structured status — used by monitors and the status page
   ([26 — trust surfaces](26-trust-surfaces.md)).
5. **Alerting.** Configure alerts on: error-rate spike, p95 latency breach, money
   -path failure, breaker-open events (from [10](10-resilience-external-calls.md)),
   and health-check failure. Route to a real channel (the existing Telegram
   integration is a candidate). Document thresholds in
   `docs/observability.md`.
6. **Dashboards.** Stand up (or document) a dashboard view of the core metrics so
   on-call has one place to look. PostHog is already present for product
   analytics — keep product vs ops signals distinct.
7. **Verify it fires.** Trigger a synthetic error and a synthetic latency breach;
   confirm it shows up in the sink and the alert routes.

## Definition of done

- [ ] Server code uses a structured logger with requestId threading; no secret/
      PII logged; raw `console.*` in `api/`/`workers/` reduced to near-zero.
- [ ] Client + server errors flow into one reporting sink with release/commit and
      requestId; verified by a synthetic error.
- [ ] `/api/health` (+ worker health) checks real downstream deps.
- [ ] SLOs + uptime/latency monitoring exist for every critical path; metrics
      recorded.
- [ ] Alerting configured and verified to fire on error-spike / latency / money-
      path / health failure, routed to a real channel.
- [ ] `docs/observability.md` documents SLOs, alert thresholds, and the runbook
      pointer (feeds [28 — incident response](28-incident-response-oncall.md)).
- [ ] Changelog: skip (internal) unless a user-facing status surface shipped.
