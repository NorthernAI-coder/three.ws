# 06 — Error handling & failsafes

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** error boundaries across `api/` + `src/`; the shared HTTP error helpers; user-facing error states.
**Depends on:** `01`, `03`. **Pairs with:** `09` (external-call resilience).

## Why this matters for $1B
CLAUDE.md: "No errors without solutions. There is always a correct answer — find it." A
platform earns trust by failing gracefully: every failure is caught at a boundary, logged,
and rendered to the user as something they can act on — never a blank screen, infinite
spinner, or raw stack trace.

## Map — real anchors
- `api/_lib/http.js` — `json()` / `error(res, status, code, message, extra)` / `serverError()` (auto-captures to Sentry + sends ops alert). Standard `{ error, error_description, ...extra }` shape.
- `api/_lib/sentry.js` — custom HTTP envelope (2.5s timeout so reporting never hangs).
- `public/error-reporter.js` — client-side uncaught error + rejection capture.
- Frontend surfaces in `src/` — each needs designed error UI.

## Do this
1. **Boundaries, not internals:** confirm errors are handled where the world is untrusted (network, user input, RPC, wallet, payment) and internal code trusts itself. Remove defensive noise inside trusted code; add real handling at the edges.
2. **Every API handler:** wraps its logic so unexpected throws go through `serverError()` (logged + alerted) and return a clean `{ error, error_description }` with the right status — never a leaked stack or hung request. Validate inputs early and return 400 with a specific code.
3. **Every async UI action:** has explicit `loading → success → error` handling. On failure, render a designed, **actionable** error (what failed + how to retry/recover), wired to real retry logic — not a toast that dead-ends.
4. **Failsafe fallbacks:** for non-critical features (a feed that fails, a price that won't load), degrade gracefully with a real fallback path or a clear "couldn't load — retry" affordance. No white screens.
5. **Promise rejections:** no unhandled rejections (verify via `03`'s console sweep). Every `.then()` has a `.catch`, every `await` is guarded where it can throw.
6. **Idempotent retries:** where a user can retry a failed mutation, ensure retries are safe (see `44` for money paths).

## Must-not
- No empty `catch {}` swallowing. No `console.error` as the only handling for a user-facing failure.
- No infinite spinners: every loading state has a timeout → error path.
- Do not expose internal error detail (stack, SQL, secrets) to the client.

## Definition of done
- [ ] Every `api/` handler routes unexpected errors through `serverError()` and returns a clean shape with correct status.
- [ ] Every async UI action has a designed, actionable error state wired to real retry.
- [ ] No unhandled promise rejections; no infinite spinners; no leaked internals.
- [ ] Regression tests cover the main failure paths; `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
