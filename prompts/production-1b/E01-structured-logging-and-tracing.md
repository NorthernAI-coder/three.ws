# E01 — Structured logging + request correlation + tracing

> Phase E · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
At $1B scale you cannot debug what you cannot see. Today logs are unstructured `console.*`
strings with no request correlation, and metrics cover only payments. Add structured,
correlated logging and lightweight tracing so any incident is diagnosable in minutes.

## Where this lives (real files)
- `api/_lib/http.js` — `wrap()` request envelope (inject correlation here), `serverError()`.
- `api/_lib/sentry.js` — error envelope; `api/_lib/axiom.js` — business metrics ingest (payments only today).
- 160+ scattered `console.*` call sites across `api/_lib/`.

## Build this
1. **Correlation IDs:** generate a request ID in `wrap()`, propagate it through async work (AsyncLocalStorage), and include it in every log line + error + the client-facing error ref.
2. **Structured logger:** a `api/_lib/structured-log.js` emitting JSON `{ ts, level, request_id, user_id, route, msg, ...fields }`; replace hot-path `console.*` with it (keep it cheap/fire-and-forget). Ship to Axiom.
3. **Span timing:** instrument the expensive operations (DB query, Solana RPC, LLM call, external API) with start/stop spans tagged by request ID, so a slow request shows where time went.
4. **Cost fields:** attach per-request cost signals where known (RPC units, LLM tokens, x402 spend) for later budgeting (G06/E07).
5. **No secret leakage:** reuse the existing `redactUrl()`/redaction so logs never carry keys, seeds, or coordinates.

## Out of scope
- The error dashboard + alerting (**E02**) — this produces the data it visualizes.

## Definition of done
- [ ] Every request carries a correlation ID through logs + errors + client ref.
- [ ] Structured JSON logs ship to Axiom; hot paths use the new logger; no secrets in logs.
- [ ] Key operations are span-timed; a slow request is attributable to a stage.
- [ ] `npx vitest run` green; changelog entry (infra); committed + pushed to both remotes.

## Verify
- Make a request; find its single correlation ID across the request log, a span, and (force one) an error.
