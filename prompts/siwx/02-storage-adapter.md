# SIWX prompt 02 — Postgres-backed `SIWxStorage` adapter

## Context

three.ws workspace at `/workspaces/three.ws`. Architecture in
[prompts/siwx/PLAN.md](PLAN.md). Prompt 01 created the `siwx_payments` and
`siwx_nonces` tables in Neon Postgres.

You are implementing **step 2 of 7**: a Postgres adapter that implements the
`SIWxStorage` interface from `@x402/extensions/sign-in-with-x` so the
`paidEndpoint()` integration (prompt 03) has something concrete to write to.

The interface (from
`node_modules/@x402/extensions/dist/esm/sign-in-with-x/index.d.mts`):

```ts
interface SIWxStorage {
  hasPaid(resource: string, address: string): boolean | Promise<boolean>;
  recordPayment(resource: string, address: string): void | Promise<void>;
  hasUsedNonce?(nonce: string): boolean | Promise<boolean>;
  recordNonce?(nonce: string): void | Promise<void>;
}
```

Per upstream docs: `hasUsedNonce` and `recordNonce` MUST both be implemented
or both be omitted; implementing only one throws at startup.

## Rails (CLAUDE.md, non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs, no
  commented-out code.
- Real Neon queries via `sql` from [api/_lib/db.js](../../api/_lib/db.js).
- Errors at boundaries only — internal calls trust each other.
- `npm test` green when you're done.

## What to build

### File 1 — `api/_lib/siwx-storage.js`

ESM module exporting one factory and one helper. No class hierarchy — keep
it flat. Match the file-header style of
[api/_lib/skill-access.js](../../api/_lib/skill-access.js) (purpose comment +
inline usage example).

```js
// api/_lib/siwx-storage.js
//
// Postgres-backed SIWxStorage for the Sign-In-With-X extension.
//
// Wired into api/_lib/x402-paid-endpoint.js (prompt 03). Every paid endpoint
// that opts into SIWX shares one instance — this module's `siwxStorage`
// singleton — so the underlying connection pool stays warm across handlers.
//
// Address normalization rule: EVM addresses are stored LOWERCASED, Solana
// addresses are stored AS-IS (Base58, case-sensitive). The normalizer below
// is the only place that decides — every caller goes through it.

import { sql } from './db.js';

// Normalize an address before SELECT/INSERT. Network is the CAIP-2 string
// from the verified SIWX payload (e.g. "eip155:8453" or
// "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp").
export function normalizeAddress(network, address) {
  if (!network || !address) throw new Error('siwx-storage: network+address required');
  if (network.startsWith('eip155:')) return String(address).toLowerCase();
  if (network.startsWith('solana:')) return String(address);
  throw new Error(`siwx-storage: unsupported CAIP-2 namespace "${network}"`);
}
```

#### `siwxStorage` singleton

Export `siwxStorage` as a plain object implementing the four `SIWxStorage`
methods. Method bodies:

- `hasPaid(resource, address)`
  - Looks up `siwx_payments` by `(resource, normalizedAddress)`.
  - Returns `false` when no row.
  - Returns `false` when `expires_at IS NOT NULL AND expires_at <= now()`.
  - Otherwise returns `true` AND fires-and-forgets an
    `UPDATE ... SET last_used_at = now(), use_count = use_count + 1`
    (await it; the savings of fire-and-forget aren't worth the dropped
    audit trail).
  - **Important:** the upstream contract passes `address` already-recovered
    from the verified signature. EVM verifiers return the checksummed form,
    so we must lowercase before hitting `siwx_payments` regardless of how
    callers stored it. Apply `normalizeAddress` using the network we
    persisted at `recordPayment` time. Since the call site only gives us
    `(resource, address)`, store the network on the row and look it up
    when the call comes in: the `SELECT` matches case-insensitively for
    EVM by lowercasing the input; Solana stays exact. Implement the
    SELECT as:

    ```sql
    SELECT 1
      FROM siwx_payments
     WHERE resource = ${resource}
       AND (
         (network LIKE 'eip155:%' AND address = ${String(address).toLowerCase()})
         OR
         (network LIKE 'solana:%' AND address = ${String(address)})
       )
       AND (expires_at IS NULL OR expires_at > now())
     LIMIT 1
    ```

- `recordPayment(resource, address, opts = {})`
  - `opts = { network, ttlSeconds? }`. `network` is required (so we know
    which normalization to apply). `ttlSeconds` defaults to `null` →
    permanent grant.
  - `INSERT ... ON CONFLICT (resource, address) DO UPDATE` so re-purchases
    refresh `paid_at` and extend `expires_at`.
  - Implementation:

    ```sql
    INSERT INTO siwx_payments
      (resource, address, network, expires_at)
    VALUES
      (${resource}, ${normalizeAddress(network, address)}, ${network},
       ${ttlSeconds ? sql`now() + (${ttlSeconds} || ' seconds')::interval` : null})
    ON CONFLICT (resource, address) DO UPDATE
       SET network    = EXCLUDED.network,
           paid_at    = now(),
           expires_at = EXCLUDED.expires_at
    ```

- `hasUsedNonce(nonce)`
  - `SELECT 1 FROM siwx_nonces WHERE nonce = ${nonce} LIMIT 1`.
  - Returns boolean.

- `recordNonce(nonce, opts = {})`
  - `opts = { resource, address }` (so the GC job and audit have context).
  - `INSERT ... ON CONFLICT (nonce) DO NOTHING` — safe to call twice.

#### Helpers exported for tests + cron

- `pruneExpiredPayments(graceSeconds = 7 * 24 * 3600)`
  - `DELETE FROM siwx_payments WHERE expires_at IS NOT NULL AND expires_at < now() - (${graceSeconds} || ' seconds')::interval`.
  - Returns deleted row count.
- `pruneOldNonces(maxAgeSeconds = 600)`
  - `DELETE FROM siwx_nonces WHERE used_at < now() - (${maxAgeSeconds} || ' seconds')::interval`.
  - Returns deleted row count.

### File 2 — `api/_lib/siwx-storage.test.js`

Vitest test (this project uses Vitest — confirm via `grep '"test"' package.json`
or the existing `api/_lib/*.test.js` files). The test hits the real `$DATABASE_URL`
when set, and `it.skipIf(!process.env.DATABASE_URL)` when it isn't, so CI can run
without leaking secrets and a local dev can run it after `01-db-schema.md`.

Cover:

1. `hasPaid` returns false for an unknown wallet.
2. `recordPayment` + `hasPaid` round-trips for EVM (mixed-case → lowercase
   match) on `eip155:8453`.
3. `recordPayment` + `hasPaid` round-trips for Solana (Base58 case-sensitive).
4. `recordPayment` with `ttlSeconds: 1` then `hasPaid` returns true; after
   `await new Promise(r => setTimeout(r, 1500))` it returns false.
5. `recordNonce` + `hasUsedNonce` round-trips and is idempotent.
6. `pruneOldNonces(0)` clears all nonces inserted by the test.

Each test uses a per-run resource string like
`test-resource-${crypto.randomUUID()}` so concurrent test runs don't collide.
Tear down explicitly at the end with `DELETE FROM siwx_payments WHERE resource LIKE 'test-resource-%'`
plus the equivalent for `siwx_nonces`.

### File 3 — register the singleton

Nothing global; prompt 03 imports `siwxStorage` directly from this module.
Just make sure the export is named and stable.

## Verification you must perform

```bash
# 1. Lint clean
npx eslint api/_lib/siwx-storage.js api/_lib/siwx-storage.test.js

# 2. Tests pass against the real DB
DATABASE_URL=$DATABASE_URL npx vitest run api/_lib/siwx-storage.test.js

# 3. No leftover test rows
DATABASE_URL=$DATABASE_URL node -e "
import('@neondatabase/serverless').then(async ({ neon }) => {
  const sql = neon(process.env.DATABASE_URL);
  const a = await sql\`select count(*)::int as n from siwx_payments where resource like 'test-resource-%'\`;
  const b = await sql\`select count(*)::int as n from siwx_nonces where resource like 'test-resource-%'\`;
  console.log('residual payments:', a[0].n, 'nonces:', b[0].n);
});
"
# Both must print 0.
```

## Done means

- `api/_lib/siwx-storage.js` implements the four `SIWxStorage` methods
  exactly as specified, plus the two `prune*` helpers.
- `api/_lib/siwx-storage.test.js` exercises every method with real Postgres,
  passes locally with `$DATABASE_URL` set, and cleans up after itself.
- No mocks, no in-memory fallbacks, no `process.env` defaults that silently
  bypass the DB.
- `git diff` reviewed.

Do not commit or push.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/siwx/02-storage-adapter.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
