# 26 · Structured logging + request correlation/tracing

> **Phase 5 — Observability & ops** · **Depends on:** none (enables 27) · **Parallel-safe:** yes · **Effort:** L

## Mission
The platform is **minimally observable**: Sentry is wired exception-only (a custom HTTP envelope to
avoid the heavy OTel SDK that nearly broke the Vercel build), logging is scattered `console.log`, and
there are **no correlation IDs or tracing**. The team can't answer "did forge success rate drop?" or
trace a failing payment across services. Add structured, correlated logging end-to-end — lightweight
enough to keep the deploy fast.

## Context (read first)
- `CLAUDE.md`.
- `api/_lib/sentry.js` (custom envelope — keep lightweight; do NOT pull the full `@sentry/node` OTel tree that broke the build), `api/_lib/axiom.js` (payments metrics sink), `api/_lib/http.js` (`wrap()` boundary — the natural place to inject).
- Workers in `workers/` need the same correlation propagated.

## Build this
1. **Correlation IDs** — generate/propagate a request ID at the `wrap()` boundary (accept inbound `x-request-id`, generate if absent, echo in the response header). Thread it through to downstream fetches (forward the header) and into worker invocations.
2. **Structured logger** — a tiny `api/_lib/log.js` emitting JSON lines (`{ ts, level, op, requestId, agentId?, durationMs?, ...ctx }`). Replace ad-hoc `console.log` in hot/important paths. No PII or secrets in logs.
3. **Request summary log** — one structured line per request at the boundary (method, route, status, duration, requestId) so latency/error rates are derivable from logs.
4. **Trace key flows** — emit span-like start/end events (with the correlation ID) for the multi-step flows: forge generation, x402 pay→settle→deliver, avatar create→rig. Stay lightweight (no full OTel SDK) — Axiom/structured-logs are the backend.
5. **Sentry context** — attach requestId + op + (non-PII) context to exceptions so an error links back to its request and trace.

## Files likely in play
`api/_lib/log.js` (new), `api/_lib/http.js` (`wrap()` injection), `api/_lib/sentry.js` (context), `api/_lib/axiom.js` (correlation), downstream fetch helper (`fetch-json.js` from prompt 07), workers, the key-flow files.

## Definition of done
- [ ] Every request has a correlation ID, echoed in headers and propagated downstream + to workers.
- [ ] Structured JSON logs replace ad-hoc console logging in important paths; no secrets/PII.
- [ ] One request-summary line per request (status + duration) → enables metrics (prompt 27).
- [ ] Key flows emit correlated span events; exceptions carry request context.
- [ ] No meaningful build-time/deploy-size regression (don't pull the heavy OTel SDK).
- [ ] Changelog: internal/ops → **no** entry.

## Guardrails
Follow CLAUDE.md. Keep it lightweight — the previous heavy-SDK approach nearly broke deploys. Never log secrets, keys, or full payment payloads. Push both remotes.
