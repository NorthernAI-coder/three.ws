# 06 — Error handling & resilience

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

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
- Resilience helpers already exist: **`api/_lib/resilience.js`** (cockatiel —
  retry/circuit-breaker/timeout policies) and **`api/_lib/db-retry.js`** for DB. Reuse
  and extend these — do not hand-roll retry loops.
- Error shaping/sanitizing exists: `api/_lib/x402-errors.js`,
  `api/_lib/mcp-error-sanitize.js`. Build the uniform error contract on these.
- Real upstreams: Solana RPC (recent hardening: "never forward an unvalidated Solana
  RPC body through failover" — see git log; `api/solana-rpc.js`), Pump.fun feed,
  OpenAI/Anthropic worker proxies, x402 facilitator (`api/_lib/x402-*`).
- Precedent: `api/x402-checkout.js` ATA-probe hardening against malformed RPC replies
  — match that rigor.

## Do this
1. Inventory every outbound call in `api/` and `workers/`. For each, confirm:
   explicit timeout, bounded retry with jittered backoff (`resilience.js`), and a
   circuit-breaker for hot paths that hammer a flaky upstream.
2. Migrate unprotected callers to the shared `resilience.js`/`db-retry.js` policies
   (additive — don't churn already-protected code, per memory guidance). Add a shared
   resilient RPC/fetch wrapper in `api/_lib/` if one doesn't already cover the case.
3. Validate and defensively parse every upstream response. Never assume shape;
   malformed replies must not throw raw — they map to a clean error or a safe
   default. (Generalize the x402 ATA-probe and Solana-failover patterns.)
4. Standardize API error responses on `x402-errors.js`/`mcp-error-sanitize.js`-style
   sanitization: correct HTTP status, a stable `{ error: { code, message } }` shape,
   no stack traces or secrets leaked to clients. Log full detail server-side (prompt
   `25`).
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
- [ ] Every external call has timeout + bounded retry via `resilience.js`; hot paths have circuit-breakers.
- [ ] Previously-unprotected handlers migrated to the shared resilient helpers.
- [ ] All upstream responses defensively parsed; malformed input handled, never thrown raw.
- [ ] Uniform sanitized error responses with correct status codes; no leaks.
- [ ] Failure-path tests added and green.
- [ ] No unhandled promise rejections (cross-check prompt `03`).
