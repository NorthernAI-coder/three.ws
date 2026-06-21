# P13 · Enforce CSRF on all cookie-authenticated mutations

> **Workstream:** Security & compliance · **Priority:** P0 · **Effort:** M · **Depends on:** none

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map).
2. three.ws monorepo: vanilla JS + Vite frontend, Vercel functions in `api/`, Cloudflare workers in `workers/`, tests via `vitest` + Playwright (`npm test`), CI in `.github/workflows/`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never reference any other coin.

## Context
- CSRF infrastructure already exists and is **partially** adopted:
  - `api/csrf-token.js` — `GET /api/csrf-token` issues a single-use token bound to the session/bearer user via `issueCsrf(userId)`.
  - `api/_lib/csrf.js` — `issueCsrf(userId)` (inserts into `csrf_tokens`, 1h TTL) and `requireCsrf(req, res, userId)` middleware. `requireCsrf` returns `true`/sends 403 + returns `false`. It exempts `Bearer ` requests, honors a `CSRF_DISABLED=1` escape hatch **only outside production** (`IS_PROD` from `VERCEL_ENV`/`NODE_ENV`), reads the token from `x-csrf-token`/`X-CSRF-Token`/`req.body._csrf`, and validates atomically via `DELETE ... RETURNING` (one-time use, user-scoped).
  - `api/_lib/auth.js` exposes `getSessionUser`, `authenticateBearer`/`extractBearer`, `isSameSiteOrigin`, plus `csrfTokenFor(req)` / `verifyCsrfToken(req, submitted)`. Cookies use the `__Host-` prefix (per `docs/security.md`).
  - `api/_lib/http.js` provides `wrap(handler)`, `cors(req, res, {methods, credentials})`, `method(req, res, [...])`, `error(res, status, code, msg)`, and sets `SameSite` cookies + `X-Frame-Options: DENY` defaults.
- `requireCsrf` is already imported in ~85 handlers (e.g. `api/agents.js`, `api/subscriptions/*`, `api/auth/[action].js`, `api/keys/*`, `api/admin/*`, `api/x/*`, `api/marketplace/*`). **But adoption is inconsistent**: many cookie-authenticated mutating handlers do not import or call it, and there is no single enforcement point — each handler must remember to call `requireCsrf` after resolving the user, which is exactly the kind of manual wiring that rots.

## Problem / opportunity
State-changing endpoints currently lean on SameSite cookies + CORS as the primary CSRF defense, with per-handler `requireCsrf` calls bolted on inconsistently. SameSite is a good layer but not sufficient alone (older browsers, `Lax` GET edge cases, subdomain quirks). The token machinery exists and works — the gap is **uniform enforcement**: a reusable wrapper so every cookie-auth POST/PUT/PATCH/DELETE verifies a CSRF token, with bearer/x402 machine calls correctly exempt, and an audit proving no mutating cookie-auth route is missed.

## Mission
Provide a reusable enforcement wrapper that verifies a CSRF token on every cookie-authenticated state-changing request (POST/PUT/PATCH/DELETE), exempts bearer-token and x402 machine-to-machine calls, adopt it across all such handlers, and add a CI/test guard that fails if a new mutating cookie-auth handler ships without it.

## Scope
**In scope:** a reusable wrapper layered on the existing `requireCsrf`/`wrap`; consistent adoption across mutating handlers; client-side fetch helper that attaches `X-CSRF-Token`; a static guard test enumerating mutating handlers.
**Out of scope:** rewriting `issueCsrf`/token storage (it works), changing cookie/session design, x402 payment-flow auth (bearer/payment-proof callers stay exempt by design).

## Implementation guide
1. **Reusable wrapper in `api/_lib/csrf.js`.** Add `withCsrf(handler)` (or extend `wrap`) that, for `POST`/`PUT`/`PATCH`/`DELETE`:
   - Resolves the caller once: `const session = await getSessionUser(req, res)`, `const bearer = session ? null : await authenticateBearer(extractBearer(req))`.
   - **Exempt** when the request is bearer/x402 machine auth: if `extractBearer(req)` returns a token (Authorization: Bearer) OR an x402 payment proof header is present (grep `x402`/`x-payment` handling in `api/x402-*.js` and `api/x/*` for the exact header names — match them), skip CSRF (the bearer token / payment proof is itself proof of intent and is not auto-attached by browsers). This preserves the existing `requireCsrf` Bearer exemption.
   - **Enforce** when the caller is cookie-session-authenticated: call `requireCsrf(req, res, session.id)`; if it returns `false` the wrapper returns (403 already sent).
   - Leaves `GET`/`HEAD`/`OPTIONS` untouched (CORS preflight + safe methods).
   - Keep the `CSRF_DISABLED=1`-only-outside-prod semantics already in `requireCsrf` — do not duplicate or weaken it.
   Compose cleanly with `wrap`: e.g. `export default wrap(withCsrf(async (req,res) => {...}))`, with `withCsrf` running after `cors()`/`method()` inside the handler, OR expose a `csrfGate(req,res)` helper handlers call right after they resolve the user. Pick the shape that requires the least churn given how the ~85 existing handlers already call `requireCsrf(req,res,userId)` post-auth, and keep that call signature working (don't break the 85 sites).
2. **Adopt across mutating cookie-auth handlers.** Enumerate every `api/**/*.js` that (a) handles a mutating method and (b) authenticates via `getSessionUser` (cookie). Grep: `grep -rln "getSessionUser" api/ | xargs grep -l "POST\|PUT\|PATCH\|DELETE"`, then subtract the ones already calling `requireCsrf`. For each gap, add the gate. Read 2-3 already-correct handlers (`api/agents.js`, `api/subscriptions/index.js`, `api/keys/index.js`) and copy their exact pattern for consistency.
3. **Client fetch helper.** Ensure the frontend attaches the token on mutations. Find the shared fetch wrapper (grep `public/` and `src/` for `csrf`, `X-CSRF-Token`, `/api/csrf-token`). If a helper exists, confirm it caches the token from `GET /api/csrf-token` and re-fetches on a 403 `csrf_invalid`/`csrf_missing` (single-use tokens expire on use — the client must refresh and retry once). If no such helper exists, add one and route mutating UI fetches through it. Design the retry so a user never sees a spurious CSRF failure on a valid action.
4. **Static guard.** Add `tests/csrf-coverage.test.js`: statically scan `api/**/*.js`, build the set of handlers that (mutating method) ∧ (uses `getSessionUser`) ∧ (NOT bearer-only), and assert each calls the CSRF gate (`requireCsrf` or `withCsrf`/`csrfGate`). Allow a tiny documented allowlist (e.g. login/refresh endpoints that mint the first token, or webhook receivers verified by signature) with a `reason`. This is the gate that stops regressions.

## Definition of done
- [ ] `withCsrf`/`csrfGate` exists in `api/_lib/csrf.js`, exempts bearer + x402, enforces on cookie-auth mutations, preserves the prod-safe `CSRF_DISABLED` semantics.
- [ ] Every mutating cookie-auth handler verifies CSRF; gaps closed; allowlist documented.
- [ ] Client mutations send `X-CSRF-Token` and transparently refresh+retry once on a CSRF 403.
- [ ] `tests/csrf-coverage.test.js` enumerates handlers and fails on an unguarded one.
- [ ] Existing tests pass (`npm test`); the 85 existing `requireCsrf` call sites still work.
- [ ] User-visible change → entry in `data/changelog.json`, then `npm run build:pages` (security work counts — tag `security`).
- [ ] `git diff` self-reviewed.

## Verification
- `npx vitest run tests/csrf-coverage.test.js` → green; temporarily strip a gate from one handler → test fails naming it.
- Manual: `npm run dev`, sign in (cookie session), then `curl -X POST http://localhost:3000/api/<a-protected-route> --cookie "<session>"` WITHOUT `X-CSRF-Token` → 403 `csrf_missing`. With a token from `GET /api/csrf-token` → succeeds; replaying the same token → 403 `csrf_invalid` (single-use).
- `curl -X POST ... -H "Authorization: Bearer <token>"` → NOT blocked by CSRF (bearer exemption intact).
- Exercise a mutating UI action in the browser → Network tab shows `X-CSRF-Token` header, no console errors, and a transparent retry if a token expired.

## Guardrails
- No mocks, fake data, stubs, `TODO`s, or commented-out code. Real APIs; handle errors at boundaries with working fallbacks.
- Stage explicit paths only; concurrent agents share this worktree — re-check `git status` before committing.
- Push only when asked, to BOTH remotes: `git push threeD main` && `git push threews main`. Never pull/fetch from `threeD`.
- Never commit secrets. Watch the `npx vercel build` trap: never commit esbuild-bundled `api/*.js` (check `head -1` for `__defProp`).
