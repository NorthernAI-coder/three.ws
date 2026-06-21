# A4 — Security Hardening

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** A2
(shares the `http.js` boundary where authz and headers attach).

## Why this matters for $1B
Trust is the whole valuation thesis, and security is its hard edge. One leaked server key in the
client bundle, one endpoint that lets user A move user B's funds, one CSRF hole on a state-changing
route — any of these is a single-incident, reputation-ending event for a platform that holds money
and wallets. `00b-the-bar.md` §4: "No secrets in the client. Every API key lives server-side behind
a proxy. Grep the built client bundle for key patterns as part of done." This prompt makes the
attack surface boring.

## Current state (read before you write)
- `api/_lib/http.js` already sets `x-content-type-options: nosniff`, `x-frame-options: DENY`,
  `referrer-policy: strict-origin-when-cross-origin` on responses — a base to build CSP and the
  rest on. `api/csrf-token.js` + `api/_lib/csrf.js` exist. `api/_lib/auth.js`, `_lib/account-auth.js`,
  `_lib/siwe.js`, `_lib/siws.js`, `_lib/siwx-server.js`, `_lib/zauth.js`, `_lib/privy.js`,
  `_lib/saml.js` cover auth; `src/auth/` (email-auth, walletconnect-bridge) the client side.
- `api/_lib/ssrf-guard.js` / `_lib/ssrf.js`, `_lib/secret-box.js`, `_lib/pii.js`,
  `_lib/moderation.js`, `_lib/granite-guardian.js` exist. Security docs: `docs/security/SECURITY_AUDIT.md`,
  `SECURITY_REMEDIATION.md`.
- **The gap:** CSRF and auth helpers exist but aren't provably applied on **every** state-changing
  and money/auth route; there is no committed proof that **no server secret reaches the client
  bundle**; there is no platform-wide **CSP**; per-endpoint **authorization** (does this identity own
  this resource?) is uneven. Read the helpers and the route list — verify, don't assume.

## Your mission
### 1. Grep the BUILT bundle for secrets — and gate it
Build the client (read how the repo builds; do **not** run `npx vercel build`, which corrupts
`api/*.js` — use the documented `vite`/`build:*` path) and grep the output for key patterns
(`sk-`, `SENTRY_DSN` if private, RPC keys, Privy/Helius/Birdeye/ElevenLabs/OpenAI/Anthropic keys,
`PRIVATE_KEY`, JWT secrets, `process.env.*` leaks). Any hit is a leaked secret — move it behind a
server proxy. Add a committed scanner (a script A5 wires into CI) that fails the build on a future
leak. This is a hard gate, not advisory.

### 2. CSRF on every state-changing route
Confirm `api/csrf-token.js` issues and `_lib/csrf.js` verifies a token, then enforce verification on
**every** POST/PUT/PATCH/DELETE that isn't a signature-authenticated API (where the wallet signature
is the CSRF defense). Cross-check against A2's `docs/API_AUDIT.md` matrix — add a "CSRF ✓" column.
No state-changing browser route may be unprotected.

### 3. Per-endpoint authorization — ownership checks everywhere
Validation (A2) proves the input is well-formed; authorization proves *this caller may do this*. Audit
every endpoint that reads or mutates a user-owned resource (wallet, agent, build, billing, world,
launch) and add an ownership/role check: the authenticated identity must own (or be permitted on) the
target. An IDOR — user A reading/moving user B's wallet by changing an ID — must be impossible. Use the
existing auth/identity helpers; centralize a `requireOwner`/`requireAuth` guard so it's consistent.

### 4. Security headers + a real CSP
Extend the `http.js` header block (additively — A2 owns the file's structure) and the HTML/static
layer with a real Content-Security-Policy (script/style/connect/img/font sources scoped to what the
app actually loads — no blanket `unsafe-inline` for scripts where avoidable), plus `Strict-Transport-Security`,
`Permissions-Policy`, and `Cross-Origin-Opener/Resource-Policy` where appropriate. Test that the CSP
doesn't break Three.js, wallet SDKs, or the existing pages — tighten iteratively, don't ship a CSP
that white-screens a surface.

### 5. Abuse prevention + secret hygiene
Layer on top of A2's rate limits: bot/abuse heuristics on the expensive, money-adjacent, and
auth-bruteforceable routes (login, mint, send, generation). Confirm secrets are read only via
`_lib/env.js`/`_lib/secret-box.js` server-side, never logged (coordinate with A1 so logged fields are
scrubbed of PII/secrets), and rotated-friendly. Verify SSRF guards cover every server-side fetch of a
user-supplied URL.

### 6. Update the security audit ledger
Turn `docs/security/SECURITY_AUDIT.md` into a current, accurate map: bundle-secret scan result, CSRF
coverage, authz coverage, CSP policy, abuse controls, SSRF coverage, open items with owners. This is
the document an external auditor (and Track G) reads.

## Definition of done
Clears `00b-the-bar.md` §4 security clauses: a committed scan proves **zero** server secrets in the
client bundle and gates future leaks; CSRF enforced on every state-changing browser route; an ownership
check on every user-owned-resource endpoint (no IDOR); a real CSP + security headers live without
breaking any surface; abuse controls on auth/money/generation routes; SSRF guarded on every user-URL
fetch. `docs/security/SECURITY_AUDIT.md` reflects reality. Inherits the global definition of done in
`00-README-orchestration.md`.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs. `$THREE` is the only coin. Design tokens only for any UI.
Stage explicit paths only (never `git add -A`); re-check `git diff --staged` before commit. **Do NOT
run `npx vercel build`** (it bundles `api/*.js` — `head -1` check before any `api/` commit). You own
`api/csrf-token.js`, `_lib/csrf.js`, `_lib/auth.js`, `src/auth/`, the header/CSP block in `http.js`
(additive — A2 owns structure), and `docs/security/`. Reuse existing auth/SSRF/secret helpers; don't
rewrite working auth flows.

## When finished
Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. a CSP report-only collector that
feeds A1, or auth-bruteforce lockout). Append a `data/changelog.json` entry (tag: `security`) — visible
trust signals matter to holders. Then delete this prompt file
(`prompts/production-campaign/A-reliability/A4-security-hardening.md`) and report the bundle-scan result,
the CSP policy shipped, any route you found unauthorized and fixed, and the scanner seam A5 should gate.
