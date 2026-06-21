# 06 — Error handling & resilience

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 1 — Cross-cutting hardening
**Owns:** `api/` (~960 handlers), `workers/`, `api/_lib/`, client fetch wrappers in `src/`/`public/`.
**Depends on:** `04` (no fake fallbacks).

## Why this matters for $1B
At scale, dependencies fail constantly — RPC nodes time out, providers rate-limit,
pump.fun hiccups. A $1B platform degrades gracefully and self-heals. `/CLAUDE.md`:
"No errors without solutions. Ship working fallbacks and failsafes. Lazy error
propagation is not engineering."

## Mission
Every external call has timeout, retry-with-backoff, circuit-breaking where
appropriate, and a designed failure path. Every handler returns correct status codes
and structured errors. No unhandled rejections.

## Map
- Resilience helper: **cockatiel** is the vetted choice (see existing usage in
  `api/_lib/`). Reuse it — do not hand-roll retry loops.
- Real upstreams: Solana RPC (already has "resilient Solana RPC" work — see git log),
  Pump.fun feed, OpenAI/Anthropic worker proxies, x402 facilitator.
- Recent hardening precedent: `api/x402-checkout.js` ATA-probe hardening against
  malformed RPC replies — match that rigor.

## Do this
1. Inventory every outbound call in `api/` and `workers/`. For each, confirm:
   explicit timeout, bounded retry with jittered backoff (cockatiel), and a
   circuit-breaker for hot paths that hammer a flaky upstream.
2. Standardize a shared `fetchWithResilience` / RPC-client wrapper in `api/_lib/`
   and migrate unprotected callers to it (additive — don't churn already-protected
   code, per memory guidance).
3. Validate and defensively parse every upstream response. Never assume shape;
   malformed replies must not throw raw — they map to a clean error or a safe
   default. (Generalize the x402 ATA-probe pattern.)
4. Standardize API error responses: correct HTTP status, a stable `{ error: { code,
   message } }` shape, no stack traces or secrets leaked to clients. Log full detail
   server-side.
5. Add a top-level handler wrapper that catches unhandled rejections/exceptions per
   request and converts them to a clean 5xx with a request id.
6. Client side: every `fetch` has a timeout + abort, and surfaces a designed,
   actionable error state (ties to prompt `12`). Add retry on idempotent GETs.
7. Add tests for the failure paths: simulate timeouts, 429s, malformed JSON, partial
   responses. Confirm graceful degradation, not crashes.

## Must-not
- Do not swallow errors silently or return `200` with empty data on failure.
- Do not leak stack traces, internal URLs, or secrets in error responses.
- Do not retry non-idempotent writes blindly (risk of double-spend/double-mint).

## Acceptance
- [ ] Every external call has timeout + bounded retry; hot paths have circuit-breakers.
- [ ] Shared resilient client adopted across previously-unprotected handlers.
- [ ] All upstream responses defensively parsed; malformed input handled, never thrown raw.
- [ ] Uniform structured error responses with correct status codes; no leaks.
- [ ] Failure-path tests added and green.
- [ ] No unhandled promise rejections (cross-check prompt `03`).
