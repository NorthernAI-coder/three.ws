# 07 — Security hardening

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 1 — Cross-cutting hardening
**Owns:** `api/`, `workers/`, auth libs in `api/_lib/`, `vercel.json` (headers/routes), wallet/payment paths.
**Depends on:** `05` (secrets), `06` (error handling). Pairs with `08` (rate limiting).

## Why this matters for $1B
This platform custodies wallets and moves money (x402, $THREE, skill purchases). One
authz bug = drained funds = dead company. Security is the difference between a
fundable platform and a liability.

## Mission
Close every authn/authz gap, validate every input, set hardening headers, and ensure
money-moving paths are airtight. Run a real security review and fix what it finds.

## Map
- Auth libs: `api/_lib/auth.js`, `account-auth.js`, `zauth.js`, `irl-auth.js`,
  `world-service-auth.js`, `skill-access.js`. Ownership model:
  `agent_identities.user_id` is immutable, one agent = one owner (see
  `prompts/agent-wallets/00-README-orchestration.md`).
- Money paths: `api/x402-*`, `api/_lib/x402-*` (`x402-paid-endpoint.js`,
  `x402-spending-cap.js`, `x402-spending-ledger.js`, `x402-solana-confirm.js`),
  `api/payments/*`, `api/pump/*`, `api/_lib/agent-wallet.js`/`solana-wallet.js`,
  `api/_lib/skill-license-onchain.js`.
- `vercel.json` controls routes + can set headers. Repo has a `/security-review` skill.

## Do this
1. Run `/security-review` over the current state and triage findings by severity.
2. **AuthZ on every mutating endpoint:** confirm the caller owns the resource (via the
   `api/_lib/auth.js` session, not a client-supplied id) before any write/withdraw/
   rebrand/spend. Audit `api/` for endpoints that trust client-supplied
   `user_id`/`agent_id`. Fix every one.
3. **Input validation at boundaries:** validate/normalize every request body, query
   param, and path param (lengths, types, ranges, address formats, amount bounds)
   using the `api/_lib/http-params.js` helpers. Reject early with 400. Prevent
   injection (SQL/NoSQL/command), path traversal, SSRF (especially anywhere a URL is
   fetched on the user's behalf, incl. the Solana RPC failover path).
4. **Money-path invariants:** amount sanity bounds, idempotency keys on
   transfers/mints to prevent double-spend, replay protection on signed requests,
   server-side recomputation of prices (never trust client-sent amounts). Use the
   spending-cap/ledger libs as the source of truth.
5. **Security headers** via `vercel.json` or middleware: `Content-Security-Policy`
   (tightened, not `unsafe-inline` everywhere), `Strict-Transport-Security`,
   `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame controls
   for embeds (allow only intended embed routes).
6. **CORS:** lock API CORS to known origins; don't reflect arbitrary `Origin`.
7. **Dependency audit:** `npm audit` (and `--workspaces`); fix high/critical by
   upgrade. Document any accepted advisory with rationale.
8. **Secrets in transit/logs:** confirm prompt `05` outcomes hold; no PII/secrets in
   logs (prompt `25`).
9. Add regression tests for each fixed authz/validation hole.

## Must-not
- Do not trust any client-supplied identity, amount, or price.
- Do not weaken CSP to "make something work" — fix the inline/eval cause.
- Do not retry or replay money-moving requests without idempotency.

## Acceptance
- [ ] `/security-review` findings triaged and resolved (or risk-accepted with written rationale).
- [ ] Every mutating endpoint verifies ownership/session server-side via `api/_lib/auth.js`.
- [ ] All inputs validated at the boundary; injection/traversal/SSRF closed.
- [ ] Money paths have amount bounds + idempotency + server-side price recomputation via the spending libs.
- [ ] Hardening headers + locked CORS in place; CSP tightened.
- [ ] `npm audit` clean of high/critical (or documented).
- [ ] Regression tests cover the fixed holes; `npm test` green.
