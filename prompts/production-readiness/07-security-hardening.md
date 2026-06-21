# 07 — Security hardening

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** authn/authz across `api/`, input validation, security headers in `vercel.json`, CORS, money-path invariants.
**Depends on:** `05` (secrets), `06` (errors). **Pairs with:** `08` (rate limits), `44` (money safety).

## Why this matters for $1B
This platform custodies wallets and moves money (x402, $THREE, skill purchases, pump.fun). One authz bug = drained funds = dead company. Security is the difference between a fundable platform and a liability. Run a real review; fix what it finds.

## Map — real anchors
- Auth/ownership: agent identities have an immutable owner; only the owner may withdraw / set limits / rebrand. Money paths: `api/x402*`, `api/x402/*`, `api/payments/*`, `api/pump/*`, `api/_lib/agent-wallet.js`, `api/_lib/skill-license-onchain.js`.
- `api/_lib/http.js` — already sets nosniff, frame-ancestors deny, strict CSP defaults on responses.
- `vercel.json` — global CSP/HSTS/permissions-policy + per-route frame-ancestors. CSP currently allows `'unsafe-inline'`/`'unsafe-eval'` for scripts with a CDN allow-list.
- `/security-review` skill — run it.

## Do this
1. Run the repo's `/security-review` over the current branch; triage findings by severity.
2. **AuthZ on every mutating endpoint:** confirm the caller owns the resource before any write/withdraw/rebrand/spend. Audit `api/` for endpoints trusting a client-supplied `user_id`/`agent_id` without verifying the session. Fix every one.
3. **Input validation at boundaries:** validate/normalize every body, query, and path param (length, type, range, address format, amount bounds). Reject early with 400. Close injection (SQL/NoSQL/command), path traversal, and SSRF (anywhere a URL is fetched on the user's behalf — forge image inputs, avatar URL import).
4. **Money-path invariants:** amount sanity bounds; idempotency keys on transfers/mints (see `44`); replay protection on signed requests; **server-side price recomputation** — never trust client-sent amounts.
5. **Security headers:** tighten CSP toward removing `'unsafe-inline'`/`'unsafe-eval'` where feasible (move inline handlers to modules); keep HSTS, nosniff, referrer-policy, permissions-policy. Confirm embed routes relax frame-ancestors **only** for intended embed surfaces.
6. **CORS:** lock API CORS to known origins; never reflect arbitrary `Origin`.
7. **Dependency audit:** `npm audit` + `npm audit --workspaces`; fix high/critical by upgrade; document any accepted advisory with rationale.
8. Add regression tests for each fixed authz/validation hole.

## Must-not
- Never trust client-supplied identity, amount, or price.
- Do not weaken CSP "to make something work" — fix the inline/eval cause.
- Do not replay money-moving requests without idempotency.

## Definition of done
- [ ] `/security-review` findings resolved or risk-accepted with written rationale.
- [ ] Every mutating endpoint verifies ownership/session server-side.
- [ ] All inputs validated at the boundary; injection/traversal/SSRF closed.
- [ ] Money paths: amount bounds + idempotency + server-side price recompute.
- [ ] Headers tightened, CORS locked; `npm audit` clean of high/critical (or documented).
- [ ] Regression tests added; `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
