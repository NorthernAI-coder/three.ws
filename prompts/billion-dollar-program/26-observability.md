# 26 — Observability (logging, metrics, error tracking)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

You cannot scale what you cannot see. When the Forge hangs, a payment silently
fails, or a cron stops firing at 3am, the difference between a five-minute fix and
a five-hour outage is whether the right structured log, metric, and alert already
exist. At $1B scale every minute of operator blindness is revenue, trust, and
$THREE-holder confidence bleeding out. Observability is the nervous system that lets
a small team run a large platform.

## Mission

Make every hot path emit structured, correlated, PII-free logs; record metrics on
generation/payment/RPC paths; and ensure every server error reaches Sentry + a
deduped ops alert with a traceable ref — without leaking secrets or vendor internals.

## Map (trust but verify — files move)

- **Client logger** — [src/shared/log.js](../../src/shared/log.js) — gated logger
  (`error` always emits; `warn/info/debug` gated by DEV / `?debug` / `localStorage['tws:debug']`),
  exports `log` + `createLogger(tag)`.
- **HTTP boundary + correlation IDs** — [api/_lib/http.js](../../api/_lib/http.js) —
  `correlationId()`, `serverError()` (emits `[server-error <ref>]`, calls Sentry + alert),
  `wrap()`, and `redactUrl()` which strips `lat/lng/token/devicetoken` before logging.
- **Generation metrics** — [api/_lib/forge-events.js](../../api/_lib/forge-events.js) —
  `recordGenerationEvent()` (JSON line `evt:"forge_gen"` + Redis hourly rolling counters),
  `readGenerationMetrics()`; consumed by [api/_lib/forge-health.js](../../api/_lib/forge-health.js).
- **Payment/business metrics** — [api/_lib/axiom.js](../../api/_lib/axiom.js) —
  `recordPaymentMetric()`, `ingestEvent()` (no-op when `AXIOM_TOKEN`/`AXIOM_DATASET` unset).
- **Error tracking** — [api/_lib/sentry.js](../../api/_lib/sentry.js) —
  `captureException()`, `captureMessage()` (fetch-based envelope, 2.5s abort, no-op without `SENTRY_DSN`).
- **Ops alerts** — [api/_lib/alerts.js](../../api/_lib/alerts.js) — `sendOpsAlert(title, detail, opts)`,
  per-signature dedup (1h) + 20/hr global ceiling (Telegram).
- **x402 audit trail** — [api/_lib/x402/audit-log.js](../../api/_lib/x402/audit-log.js).
- **Tests** — [tests/api/healthz.test.js](../../tests/api/healthz.test.js),
  [tests/api/forge-health.test.js](../../tests/api/forge-health.test.js),
  [tests/api/audit-log.test.js](../../tests/api/audit-log.test.js).

## Do this

1. **Inventory the boundaries.** Read `http.js` end-to-end. Confirm every `api/`
   handler that can 5xx routes through `serverError()`/`wrap()` so it gets a `ref`,
   a Sentry capture, and an alert. Grep for raw `res.status(500)` /
   `console.error` that bypass the boundary and route them through `http.js`.
2. **Standardize log levels.** Audit `console.*` calls across `api/` and `src/`.
   Client code must use `src/shared/log.js` (no raw `console.log` shipping to prod);
   server code emits one structured JSON line per significant event with a stable
   `evt` key (mirror `forge_gen`). No free-text-only logs on hot paths.
3. **PII/secret redaction is non-negotiable.** Extend `redactUrl()` and any log
   payload builder to strip wallet secrets, bearer tokens, API keys, email, and
   precise geo. Add a test asserting a crafted error with a token in the URL +
   body never appears verbatim in the logged/captured payload.
4. **Metrics on hot paths.** Confirm `recordGenerationEvent()` fires on every forge
   lifecycle phase (start/done/failed). Wire `recordPaymentMetric()` (Axiom) on
   every x402 settle/verify/refund outcome if any path is missing it. These must be
   fail-open (a metrics hiccup never blocks the request).
5. **Correlation end to end.** Ensure the `ref` from `serverError()` is returned in
   the JSON error body AND attached to the Sentry/alert context, so a support ref
   maps to one log line. Add `ref` to the user-facing error copy where surfaced.
6. **Alert hygiene.** Verify `sendOpsAlert` dedup + 20/hr ceiling work (read
   `alerts.js`); confirm health crons (`world-health`, `redis-health`, `llm/health`)
   alert on degradation, not on every probe. No alert storms.
7. **Verify graceful no-op.** With `SENTRY_DSN`, `AXIOM_TOKEN`, and
   `TELEGRAM_*` unset locally, the whole stack must stay silent and non-throwing.
   Run the relevant tests and a local request to confirm.
8. Run `npx vitest run tests/api/healthz.test.js tests/api/forge-health.test.js
   tests/api/audit-log.test.js` plus any new redaction test. Add a `data/changelog.json`
   entry only if a user-visible surface changed (e.g. a `ref` shown on error pages),
   then `npm run build:pages`.

## Must-not

- Never log secrets, private keys, bearer tokens, raw wallet payloads, full emails,
  or precise geo — redact at the boundary.
- Never surface a vendor's billing/credit/quota message or raw stack to an end user;
  raw detail lives in server logs and Sentry only.
- Never make a request block on a metrics/alert/Sentry call — all are fire-and-forget.
- Do not pull/fetch/merge from the `threeD` remote (push-only mirror).
- No mocks, stubs, or TODOs; finish every path you touch. The only coin is `$THREE`.

## Acceptance (all true before claiming done)

- [ ] Every 5xx in `api/` produces a correlation `ref`, a Sentry capture, and a
      deduped ops alert; the same `ref` is in the response body and the log line.
- [ ] Hot paths (forge phases, x402 settle/verify/refund) emit structured metrics;
      all metric/alert/Sentry calls are fail-open and non-blocking.
- [ ] A redaction test proves tokens/secrets/PII never appear in logged or captured
      payloads (URL and body).
- [ ] With all observability env vars unset, the stack is silent and never throws.
- [ ] `tests/api/healthz`, `forge-health`, `audit-log` and any new test pass.
- [ ] Changelog updated only if user-visible; `npm run build:pages` is clean.
