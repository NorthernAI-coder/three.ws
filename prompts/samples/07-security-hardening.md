# 07 — Security hardening (authz, validation, headers, SSRF)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

The platform moves real value: custodial wallet payouts, x402 USDC settlement, $THREE
gating, on-chain launches. One missing authorization check, one unvalidated body, one
server-side fetch that follows an attacker URL, and a $1B platform becomes a breach
headline. Security is not a phase you bolt on — it is the precondition for every dollar
that flows through three.ws. This prompt hardens the four highest-leverage classes:
authorization, input validation, response headers, and SSRF.

## Mission

Confirm every endpoint authorizes its caller, every input is zod-validated at the
boundary, security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy,
Permissions-Policy) are correct in `vercel.json`, CORS is allowlisted, and every
server-side URL/image fetch is SSRF-guarded — then run `/security-review` and fix
everything it surfaces.

## Map (trust but verify — files move)

- **Input validation (zod — ~123 files use it)** — [api/_lib/validate.js](../../api/_lib/validate.js):
  shared schemas (`email`, `slug`, `httpUrl`, `createAvatarBody`, …) + helpers
  `parse(schema, input)`, `validateQuery(req, schema)`, `isValidSolanaAddress`,
  `isValidEvmAddress`, `isUuid`. Validation 400s go through
  [api/_lib/http.js](../../api/_lib/http.js) `validationError`.
- **AuthZ helpers** — [api/_lib/auth.js](../../api/_lib/auth.js) (`getSessionUser`,
  `authenticateBearer`, `verifyCsrfToken`, `isSameSiteOrigin`, `hasScope`),
  [api/_lib/account-auth.js](../../api/_lib/account-auth.js) (`resolveAccount`),
  [api/_lib/admin.js](../../api/_lib/admin.js) (`requireAdmin`),
  [api/_lib/csrf.js](../../api/_lib/csrf.js),
  [api/_lib/x402/access-control.js](../../api/_lib/x402/access-control.js) (`installAccessControl`).
- **CORS** — [api/_lib/http.js](../../api/_lib/http.js) `cors(req, res, { origins,
  methods, credentials })` + `isAllowedOrigin` (the allowlist: `APP_ORIGIN`,
  x402scan, agentic.market, `*.ibm.com`, localhost in dev). Reuse it; do not invent.
- **SSRF guards** — [api/_lib/ssrf.js](../../api/_lib/ssrf.js)
  (`validatePublicUrl`, `assertPublicHttpsUrl`, `safeFetchJson`, `pinnedAgent`),
  [api/_lib/ssrf-guard.js](../../api/_lib/ssrf-guard.js) (`assertSafePublicUrl`,
  `fetchSafePublicUrl`, `fetchSafePublicUrlPinned`),
  [api/_lib/fetch-model.js](../../api/_lib/fetch-model.js) (`fetchModel` — the SSRF pioneer).
- **Security headers** — [vercel.json](../../vercel.json) `headers` blocks (~line 202+):
  `content-security-policy`, `strict-transport-security`, `x-content-type-options`,
  `referrer-policy`, `permissions-policy`, `x-frame-options`.
- **Skill + tests** — `/security-review` skill;
  [tests/api/security-csrf-gates.test.js](../../tests/api/security-csrf-gates.test.js),
  [tests/api/x402-security-fixes.test.js](../../tests/api/x402-security-fixes.test.js),
  [tests/api/validate.test.js](../../tests/api/validate.test.js).

## Do this

1. **AuthZ audit — every state-changing endpoint authorizes the caller.** Inventory
   `api/` POST/PUT/PATCH/DELETE handlers; confirm each calls `getSessionUser` /
   `authenticateBearer` / `resolveAccount` / `requireAdmin` (or x402 `installAccessControl`
   for paid routes) AND checks ownership (the resource belongs to the caller). Flag any
   handler that mutates without an authZ gate; close the gap. Verify CSRF via
   `verifyCsrfToken`/`isSameSiteOrigin` on cookie-auth state changes.
2. **Input validation everywhere.** Every handler that reads `req.body`/query/params
   must run it through a zod schema (reuse `validate.js`, add a `.strict()` schema where
   missing) and return `validationError` on failure. `grep -rn "req.body" api/` and
   confirm each is validated, not dot-accessed raw. No unbounded strings, no unchecked
   numbers feeding limits/pagination.
3. **SSRF on every server-side fetch of a user/DB URL.** `grep -rnE "fetch\(" api/` and
   find any call whose URL comes from user input or the DB (image render, GLB fetch,
   webhook, metadata, proxy). Route it through `fetchSafePublicUrl` /
   `fetchSafePublicUrlPinned` / `safeFetchJson` — pinned variant for anything whose
   response is forwarded or executed. No raw `fetch(userUrl)` may remain.
4. **CORS allowlist, not wildcard.** Confirm `cors()` callers pass an explicit
   `origins` allowlist (or rely on `isAllowedOrigin`); flag any `origins: '*'` on a
   credentialed or state-changing route and tighten it. Public read-only APIs may stay
   `*` — document why.
5. **Security headers complete and correct.** Verify `vercel.json` sets CSP, HSTS
   (`max-age` + `includeSubDomains` + `preload`), `x-content-type-options: nosniff`,
   `referrer-policy`, `permissions-policy`, and `x-frame-options`/`frame-ancestors` for
   every served surface. Tighten CSP where `'unsafe-inline'`/`'unsafe-eval'` can be
   dropped without breaking a real page (test in browser before removing).
6. **Run the security review.** Invoke the `/security-review` skill on the working
   tree. Triage every finding to root cause and fix it — no "accepted risk" without an
   explicit, written reason. Re-run until clean.
7. **Validate live + tests.** `npm run dev`; confirm headers land (`curl -I`), CORS
   preflight behaves, an unauthorized mutation is rejected, a private-IP URL fetch is
   blocked. Run `npx vitest run tests/api/security-csrf-gates.test.js
   tests/api/x402-security-fixes.test.js tests/api/validate.test.js` and add cover for
   any newly-closed gap.
8. **Changelog if user-visible.** Security hardening that changes behavior gets a
   `data/changelog.json` entry (tag `security`); run `npm run build:pages`.

## Must-not

- Do not weaken an existing control to "make it work" — fix the caller, not the guard.
- Do not add `origins: '*'` to a credentialed/state-changing route, and do not loosen
  the SSRF IP blocklist (metadata, RFC1918, loopback, CGNAT must stay blocked).
- Do not trust client-supplied IDs/ownership — re-check ownership server-side.
- Do not dismiss a `/security-review` finding without a root-cause fix or written
  justification.
- Do not break working pages by over-tightening CSP — verify each removal in a browser.
- Do not reference any coin other than `$THREE`.

## Acceptance (all true before claiming done)

- [ ] Every state-changing `api/` endpoint authorizes the caller and verifies resource
      ownership; CSRF enforced on cookie-auth mutations — verified by audit.
- [ ] Every handler that reads body/query/params validates it via zod and returns a
      clean `validationError` on bad input; no raw unvalidated `req.body` access remains.
- [ ] Every server-side fetch of a user/DB-supplied URL goes through the SSRF guard;
      `grep` shows no raw `fetch(userUrl)`.
- [ ] CORS is allowlisted on credentialed/mutating routes; any `*` is read-only and
      justified.
- [ ] `vercel.json` sets correct CSP, HSTS, X-Content-Type-Options, Referrer-Policy,
      Permissions-Policy, and X-Frame-Options for every served surface (confirmed via
      `curl -I`).
- [ ] `/security-review` runs clean (or every finding has a root-cause fix).
- [ ] Security/CSRF/validate tests pass with cover for any closed gap; user-visible
      changes logged in `data/changelog.json` and `npm run build:pages` is clean.
