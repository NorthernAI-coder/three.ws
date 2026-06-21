# A2 — API Hardening

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** A1
(so the new boundaries you harden emit traces and request IDs).

## Why this matters for $1B
Every public endpoint is attack surface and trust surface at once. An unvalidated body that
500s, a mutating route that double-charges on a retry, or a rate-free endpoint that lets one
client exhaust an upstream — each one breaks the "trusted with money, used daily" promise.
`00b-the-bar.md` §4 is explicit: "Inputs are validated at the boundary and trusted internally.
Rate-limited where abusable. CSRF-protected where state-changing." This prompt makes that true
across all ~100 endpoints with **one** consistent shape so the platform behaves predictably
under load and abuse.

## Current state (read before you write)
- `api/_lib/http.js` is the shared boundary: `wrap()`, `json()`, `error()`, `serverError()`,
  `validationError()`, `rateLimited()`, `readJson()`, `method()`, `cors()`. Error responses
  already force `no-store` and set `x-content-type-options`/`x-frame-options`. This is your base.
- `api/_lib/rate-limit.js` wraps `@upstash/ratelimit` (`limits`, `clientIp`). `api/_lib/validate.js`
  exists. `zod@^3` is a dependency.
- **The gap (measured — verify with grep):** of 100 `api/*.js` handlers, only ~58 import
  rate-limit and only ~23 use zod/validate. Mutating routes lack **idempotency keys**. The
  error response shape is *mostly* consistent but not enforced — different handlers return
  different bodies. There is no single documented envelope contract.

## Your mission
### 1. Define and enforce ONE error-envelope shape
Pin the canonical error body in `api/_lib/http.js` (extend `error()`/`validationError()`/
`serverError()` so they're the only way to emit an error) — e.g.
`{ ok: false, error: { code, message, requestId, ref?, fields? } }` — carrying A1's `requestId`.
Document it once in `docs/API_AUDIT.md`. Migrate handlers returning ad-hoc error bodies to the
helpers. Success responses stay as-is unless trivially normalizable; do not churn working reads.

### 2. Validate input at every boundary with zod
For every handler that reads a body, query, or path params, add a zod schema and parse at the
top, returning `validationError()` (with field-level detail) on failure. Centralize reusable
schemas in `api/_lib/validate.js`. Internal code then trusts its inputs — no defensive
re-checking downstream. Prioritize: mutating routes, money routes, anything taking a wallet
address / mint / amount. Cover the ~77 currently-unvalidated handlers; track progress in
`docs/API_AUDIT.md`.

### 3. Rate-limit every abusable route
Apply `@upstash/ratelimit` via `_lib/rate-limit.js` to the ~42 routes that lack it. Tier the
limits: generous on cheap reads, tight on expensive/abusable ones (generation, LLM proxies,
mint, send, anything that spends an upstream's quota or money). On limit, return the consistent
`rateLimited()` envelope with a `Retry-After`. Use `clientIp` + (for authed routes) the
identity as the key. If Redis is unavailable, fail **open** for reads and **closed** for
money/auth routes — never crash.

### 4. Idempotency keys on every mutating route
Add idempotency to POST/PUT/PATCH/DELETE handlers that create or change state. Accept an
`Idempotency-Key` header (and/or derive a deterministic key from the operation); store
key→result in Redis with a TTL; on a repeat key, return the stored result instead of re-running.
This is the boundary contract; A3 will rely on it for the money paths specifically — so make the
helper reusable and money-path-grade. Build a small `idempotent(handler, keyFn)` helper alongside
`wrap()` and document it.

### 5. Error boundaries at every network/input edge
Audit handlers for un-awaited promises, unguarded `JSON.parse`, and upstream calls without
try/catch. Every network/input boundary must produce an actionable envelope, never a raw 500 or
hung request. Internal logic (post-validation) trusts itself — don't over-wrap pure functions.

### 6. Produce the audit ledger
Update `docs/API_AUDIT.md` into a real per-endpoint matrix: validated ✓, rate-limited ✓,
idempotent ✓ (or N/A for reads), auth-gated (defer detail to A4), envelope ✓. This is the
checklist A5 turns into tests and A4 cross-checks for authz.

## Definition of done
Clears `00b-the-bar.md` §4: all ~100 handlers validate input at the boundary, every abusable
route is rate-limited with a `Retry-After`, every mutating route is idempotent and retry-safe,
and **one** error-envelope shape is enforced through `http.js` helpers carrying A1's requestId.
`docs/API_AUDIT.md` is a complete, accurate matrix. A retried mutating request returns the same
result, not a duplicate. Inherits the global definition of done in `00-README-orchestration.md`.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs. `$THREE` is the only coin. Design tokens only for any
UI. Stage explicit paths only (never `git add -A`); re-check `git diff --staged` before commit.
**You own `api/_lib/http.js`'s structure**, `_lib/validate.js`, `_lib/rate-limit.js`, the
per-handler validation/limits, and `docs/API_AUDIT.md`. A1 adds telemetry inside `wrap()` and A4
adds headers/CSP — accept their additive helpers; don't undo them. Extend; don't rewrite working
handlers' success paths.

## When finished
Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. a body-size cap or a
content-type guard applied platform-wide via the boundary). Append a `data/changelog.json` entry
(tag: `improvement` or `security`) only if user-visible (e.g. clearer error messages). Then delete
this prompt file (`prompts/production-campaign/A-reliability/A2-api-hardening.md`) and report the
envelope shape, the idempotency helper signature (A3 depends on it), and any route you left
deliberately un-limited and why.
