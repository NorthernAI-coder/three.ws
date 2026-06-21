# 14 · Security Review & Hardening

## Mission
A platform that touches wallets, payments, and user content must be hard to abuse. Find and fix
auth gaps, injection vectors, secret leaks, SSRF, XSS, CSRF, insecure CORS/CSP, and unsafe defaults.
This is defensive security on our own codebase.

## Context
- Vercel functions in `api/`, workers in `workers/`, on-chain in `contracts/`, wallet/x402 flows.
- `api/client-errors`, CSP headers configured per-route in `vercel.json` (e.g. embed CSPs).
- Auth: session cookies (`/api/auth/me`), wallet auth, skill-license checks.

## Tasks
1. **Authn/Authz:** verify every `api/*` that mutates or returns private data checks the session /
   ownership. Test for IDOR (e.g., editing/reading another user's avatar/agent by id — confirm
   `owner_id` checks like avatar-edit's are everywhere). List endpoints + their auth requirement.
2. **Input validation:** validate + sanitize all inputs at the API edge (types, bounds, allow-lists).
   No SQL/command/path injection; safe file handling for uploads (size/type/content sniffing).
3. **XSS:** audit every place user/agent content reaches the DOM. Ensure escaping (`esc()` usage is
   consistent) and no `innerHTML` of untrusted strings; sanitize rich content.
4. **SSRF/proxy:** GLB/image proxies and any URL-fetching endpoint must allow-list schemes/hosts and
   reject internal addresses (the avatar GLB proxy, OG fetchers, page-agent fetchers).
5. **Secrets:** confirm no secrets in source, history, client bundles, or `dist/`. Server-only env
   stays server-only; rotate anything exposed. Document required env per surface.
6. **Headers:** CSP (tighten beyond embeds), HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
   `Permissions-Policy`. CORS scoped, not `*`, for credentialed endpoints.
7. **Rate-limit hooks:** confirm abuse-prone endpoints are protected (hand off specifics to prompt 35).
8. **Dependencies:** `npm audit` + review; patch high/criticals; pin/verify forked deps.

## Acceptance
- A `docs/security/review-YYYY-MM-DD.md` with findings, severity, fix status, and an endpoint→auth matrix.
- No IDOR on owned resources; uploads/proxies hardened; no secret leakage.
- Security headers present on all routes; `npm audit` shows no unaddressed high/criticals.
- Coordinate any user-visible change with a changelog `security` entry (no sensitive details).

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first (they override defaults)
- Defensive security only — harden our own code; no offensive tooling.
- No mocks / fake data / placeholders / TODOs / stubs. Real implementations only.
- $THREE is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths; re-check before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`; recover with `git restore -- api/ public/`.
- Push to BOTH remotes when asked; never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.
