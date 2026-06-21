# Task 12 — Observability: tracing, server-side Sentry, secret scrubbing, live status

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track D —
> Reliability.** Foundational — `09`/`10`/`11`/`13` all emit into what you build here.
> Lands early so the other Track D tasks have somewhere to report.

## The thesis

You can't operate a $1B platform you can't see. Today errors are mostly `console.log`, there's
no request tracing across the Vercel→upstream boundary, server-side exceptions in functions
largely aren't captured, secrets can leak into logs, and `/api/status` reports green even when a
core dependency is down. This task makes the platform observable and its health honest.

## What exists today (read first)

- **Sentry, thinly wired** — [api/_lib/sentry.js](../../api/_lib/sentry.js) (fire-and-forget,
  no retry, no URL scrubbing); only ~27 `captureException` calls across ~360 handlers, mostly
  on the client ([api/client-errors.js](../../api/client-errors.js)). Server exceptions in
  functions are largely uncaptured.
- **Logging is unstructured** — `console.*` throughout `api/` and `workers/`; no request id /
  trace id propagation in [api/_lib/http.js](../../api/_lib/http.js).
- **Secret-leak risk** — [api/_lib/http.js](../../api/_lib/http.js) logs raw `err.message` on
  5xx (RPC URLs often embed API keys); redaction (`SENSITIVE_QUERY_KEYS`) misses `api-key`,
  `sig`, `auth`, etc.
- **Status is shallow** — [api/status.js](../../api/status.js) returns cached cron-probe data
  and does **not** check live deps (Redis limiter, LLM providers via
  [api/_lib/llm-health.js](../../api/_lib/llm-health.js), Solana RPC). Forge/LLM health
  ([api/_lib/forge-health.js](../../api/_lib/forge-health.js)) exists but isn't reflected.
  Status page UI: [pages/status.html](../../pages/status.html).

## What to build

1. **Structured logging + request tracing.** A small structured logger (level, message,
   context, request id, route) used across handlers via [http.js](../../api/_lib/http.js).
   Generate/propagate a request/trace id (`x-request-id`) through inbound handling and outbound
   calls (tie into `09`'s wrapper) so a single request can be followed end to end.
2. **Real server-side error capture.** Route handler exceptions through
   [sentry.js](../../api/_lib/sentry.js) (or equivalent) with request/trace context, at the
   `http.js` boundary so coverage is uniform — not 27 ad-hoc call sites. Add retry so a dropped
   Sentry POST doesn't lose the event silently.
3. **Secret scrubbing.** Scrub secrets from everything logged or sent to Sentry: redact
   credentials in URLs (RPC keys), expand the sensitive-key list (`api-key`, `sig`, `auth`,
   `token`, authorization headers), and never serialize a keypair/secret. Add a test that a
   known-secret-shaped string never reaches a log/Sentry payload.
4. **Honest live status.** Make [api/status.js](../../api/status.js) probe **live**
   dependencies — limiter/Redis reachability, LLM provider health
   ([llm-health.js](../../api/_lib/llm-health.js)), forge backend health
   ([forge-health.js](../../api/_lib/forge-health.js)), Solana RPC — and reflect degraded
   states (not just hard down). Surface per-component status on
   [pages/status.html](../../pages/status.html) with designed states. Include cron
   freshness (from `13`) so "rewards-distribute last ran 6h ago" is visible.
5. **Metrics sink for the other tasks.** Provide the lightweight metric/log hook that `09`
   (degradation), `11` (cap hits), `13` (cron outcomes) emit into.

## Hard rules specific to this task

- **Never log or transmit a secret.** This is a security task as much as an ops one — the
  scrubbing test is mandatory.
- Observability must not add meaningful latency or block the request path (fire-and-forget with
  bounded cost; degrade silently if the sink is down — but record that it degraded).

## Definition of done

README DoD, plus: a request can be traced by id through handler + upstreams; handler exceptions
reach Sentry with context; the secret-scrubbing test passes (no secret in any log/payload);
`/api/status` reflects real live-dependency and cron-freshness state and the status page shows
per-component health with designed states. Vitest covers scrubbing + the status aggregation
logic. Changelog (`infra`/`security`). Self-review, then widen logging coverage to the next
subsystem.

Delete this file when done.
