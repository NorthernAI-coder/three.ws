# A1 — Observability Backbone

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none —
this is the first prompt in Track A; every other prompt verifies its work against the telemetry
you land here.

## Why this matters for $1B
A platform trusted with money cannot fail silently. The day an x402 settlement or an
agent-wallet send fails and nobody is paged is the day trust dies — and you only find out from
an angry holder, not a dashboard. "Observability is total" is a $1B reliability bar
(`00b-the-bar.md` §1): every error captured, every paid call traced, every worker reporting
health. Right now that bar is half-met, and the half that's missing is where money moves.

## Current state (read before you write)
- `api/_lib/http.js` exports `wrap(handler)` — the boundary ~91 of 100 `api/*.js` handlers
  already use. It calls `captureException(err, { ref, url, method })` on a thrown error and
  stamps a `ref`. That `ref` is the seam to build on.
- `api/_lib/sentry.js` exports `captureException` / `captureMessage` (Sentry guarded by
  `SENTRY_DSN`). `api/_lib/axiom.js` exports `axiomEnabled()`, `ingestEvent(fields)`,
  `recordPaymentMetric(...)`. `api/_lib/alerts.js` exports `sendOpsAlert(title, detail, opts)`.
- `api/client-errors.js` ingests browser errors from `public/error-reporter.js` and logs one
  structured `[client-error]` line; it forwards to Sentry when configured.
- **The gap (measured):** only 3 handlers import sentry directly, **0 import axiom**, and no
  worker (`workers/agent-sniper`, `workers/deploy`, `workers/model-*`, `workers/avatar-*`)
  emits structured telemetry. There is no per-request **trace/request ID** propagated into
  logs, no **error-rate spike** alert, and no single **readable error view**. Silent failure
  is still possible. Verify these counts yourself with grep before writing.

## Your mission
### 1. Make `wrap()` the universal trace + telemetry boundary
In `api/_lib/http.js`, extend `wrap()` (additively — do not change its signature or break the
existing `ref`) to: derive a **request ID** (reuse an inbound `x-request-id` / Vercel
`x-vercel-id` if present, else generate one), set it on the response header, and thread it
through every `captureException` context **and** an `ingestEvent` call to Axiom on both success
(sampled) and failure (always) with `{ route, method, status, durationMs, requestId, ref }`.
Every handler that already uses `wrap()` inherits this for free — that's the leverage. Audit the
~9 handlers NOT using `wrap()` and either wrap them or justify each in `docs/ops/observability.md`.

### 2. Structured logging with trace IDs, one shape
Add a tiny structured logger to `api/_lib/axiom.js` (or a new `api/_lib/log.js` it re-exports)
that emits one JSON line per event — `{ ts, level, route, requestId, msg, ...fields }` — to
stdout (so Vercel log drains capture it) AND to Axiom when enabled. Replace ad-hoc
`console.log`/`console.error` on money/auth paths with it. Make `requestId` flow from `wrap()`
into handlers (attach to `req` or pass via context) so a single request is traceable end to end.

### 3. Bring workers into the same telemetry plane
Workers run outside the `api/` boundary and are currently dark. Add a shared worker telemetry
shim (mirror the axiom/sentry helpers — reuse, don't fork) so every worker in `workers/*`
reports: start, completion, failure (with Sentry capture), and a **heartbeat/health** signal.
Wire it into each worker's main loop / job handler. A worker that dies must page, not vanish.

### 4. Alert on error-rate spikes — not just single errors
`sendOpsAlert` fires per-error today. Add rate-aware alerting: when a route's error rate or a
worker's failure count crosses a threshold over a short window, fire **one** deduped ops alert
(reuse the existing dedupe in `_lib/alerts.js`/`sentry.js`; don't double-page). Money/auth
routes get a tighter threshold than read endpoints. Document thresholds in `docs/ops/`.

### 5. A readable error dashboard / surface
Engineers and the status page both need a human view. Provide a real, reachable surface — a
queryable Axiom dashboard config committed to the repo **and** a small authenticated internal
read endpoint (or extend an existing ops/admin surface) that summarizes recent error counts by
route, top error refs, and worker health. No raw stack traces to unauthenticated users. Wire
its health summary so A7's `/status` page can consume it (the seam between A1 and A7).

### 6. Verify the wiring is live, not theoretical
Trigger a real error on a non-money route and confirm: a Sentry event with the `requestId`, an
Axiom event for the same request, the response carrying the request-ID header, and (by forcing
a burst) exactly one spike alert. Capture the trace IDs in your completion report.

## Definition of done
Clears `00b-the-bar.md` §1 "Observability is total": **every** `api/*.js` handler emits a traced
success/failure event with a propagated request ID; **every** worker reports start/finish/fail +
heartbeat; error-rate spikes page once (deduped); a readable, auth-gated error/health surface
exists and feeds A7's status page. No `console.log` left on money/auth paths. Real triggered
error produces a correlated Sentry + Axiom + header trail (IDs in the report). Inherits the global
definition of done in `00-README-orchestration.md`. If `SENTRY_DSN`/`AXIOM_*` are absent locally,
say so and verify the code paths/no-op guards instead of claiming live capture.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs. `$THREE` is the only coin. Design tokens only
(`public/tokens.css`) for any UI. Stage explicit paths only (never `git add -A`); re-check
`git diff --staged` before commit. Own the telemetry lane — `api/_lib/sentry.js`,
`_lib/axiom.js`, `_lib/alerts.js`, `api/client-errors.js`, worker shims, `docs/ops/`. You touch
`_lib/http.js` `wrap()` additively; A2 owns that file's structure — coordinate, add named
helpers, don't reformat. Extend the existing helpers; don't rewrite them.

## When finished
Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. sample-rate control, or a
PII scrub on logged fields tied to A4's hygiene). Append a `data/changelog.json` entry (tag:
`infra`) — holders care that the platform watches itself. Then delete this prompt file
(`prompts/production-campaign/A-reliability/A1-observability-backbone.md`) and report what you
shipped, the verification trace IDs, and the health-summary seam you left for A7.
