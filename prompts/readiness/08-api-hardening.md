# 08 — API hardening: authz, validation, rate limiting

**Phase 2. [parallel-safe]** with 07, 09–11. Large surface — work in batches.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. **769 functions in
`api/`** (Vercel) plus `workers/`. Read [CLAUDE.md](../../CLAUDE.md). Rules:
**Errors handled at boundaries. No errors without solutions.** The only coin is
**$THREE**.

## Objective

Every public endpoint is: authenticated/authorized where it touches user data or
spends money, input-validated on every parameter, rate-limited against abuse,
and returns consistent, safe error responses (no stack traces, no internal
detail leaks). Build shared middleware so this is uniform, not per-file.

## Why it matters

769 endpoints is 769 doors. At a billion-dollar bar, an unauthenticated mutation,
an unvalidated mint/amount, or an un-rate-limited payment endpoint is an exploit
waiting to be found. Payments, wallet ops, and on-chain actions especially must
be airtight.

## Instructions

1. **Inventory endpoints and classify** by sensitivity:
   ```bash
   find api -name '*.js' | grep -v _lib | grep -v node_modules | wc -l
   grep -rln "export default\|module.exports" api/ | grep -v node_modules
   ```
   Tag each: **public-read** (cacheable, no auth), **auth-read** (needs session),
   **mutation** (writes data), **money/chain** (payments, mint, transfer, x402,
   pump). Money/chain is highest priority.
2. **Shared middleware (build once, apply everywhere)** under `api/_lib/`:
   - `withAuth(handler, { require: 'session'|'optional' })` — verifies SIWE/email
     session; reuse the existing auth layer (see `api/auth/`,
     `src/wallet-auth.js`), don't reinvent.
   - `withValidation(schema)` — validates query/body against a schema (zod or
     equivalent already in deps); rejects with 400 + field-level message.
     Validate types, ranges, addresses (base58/EVM), amounts (positive, bounded).
   - `withRateLimit({ key, limit, window })` — per-IP and per-session limiting on
     a shared store (the project already uses KV/Upstash-style storage — reuse
     it). Strict limits on money/chain and LLM-proxy endpoints.
   - `safeError(err)` — maps internal errors to safe client responses; never
     leak stack traces or secrets.
3. **Apply in priority order:** money/chain → mutations → auth-read →
   public-read. Commit per batch with explicit paths (concurrent agents share
   this worktree — never `git add -A`).
4. **Validate money paths hardest.** For any endpoint that mints, transfers,
   pays, or launches: re-verify amount bounds, ownership, idempotency (a retried
   request must not double-spend), and that the mint is the user-supplied runtime
   value (never a hardcoded foreign coin — $THREE rules apply).
5. **CORS & methods.** Confirm each endpoint restricts methods (no accidental
   GET-mutations) and that CORS is as tight as the feature allows.
6. **Tests.** Add request-level tests under `tests/api/` for: unauthorized
   access rejected, invalid input rejected with 400, rate limit triggers 429,
   and the happy path still works. Follow existing patterns in `tests/api/`.

## Definition of done

- [ ] Shared `withAuth` / `withValidation` / `withRateLimit` / `safeError`
      middleware exists in `api/_lib/` and is reused (not duplicated per file).
- [ ] 100% of money/chain and mutation endpoints enforce auth + validation +
      rate limiting; auth-read endpoints enforce auth; the split is documented in
      `docs/API_AUDIT.md`.
- [ ] No endpoint returns stack traces or internal detail on error.
- [ ] Idempotency verified on every spend/mint/transfer path.
- [ ] New `tests/api/` cases cover authz-reject, validation-reject, rate-limit,
      and happy path; `npm test` passes.
- [ ] Changelog: `security` entry in `data/changelog.json` (plain language, e.g.
      "Hardened API request validation and rate limiting").
