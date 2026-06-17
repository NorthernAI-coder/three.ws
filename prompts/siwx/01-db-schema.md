# SIWX prompt 01 — Postgres schema for payment-history + nonce store

## Context

You are working in the **three.ws** workspace at `/workspaces/three.ws`. This
project sells access to x402 paid endpoints (3D assets, agent skills, dance
performances) and is adding **Sign-In-With-X (SIWX, CAIP-122)** so a wallet
that has already paid for a resource can re-access it by signing a message
instead of re-paying.

Architecture overview lives in [prompts/siwx/PLAN.md](PLAN.md). Read it first.

You are implementing **step 1 of 7**: the Postgres tables that back the SIWX
storage adapter. Everything else in the plan depends on these tables existing.

## Rails (CLAUDE.md, non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs, no
  `throw new Error('not implemented')`, no commented-out code.
- Real Neon Postgres — same `sql` tag from
  [api/_lib/db.js](../../api/_lib/db.js) every other migration uses.
- Errors at boundaries only.
- Done = migration written, applied locally against the Neon database
  pointed at by `$DATABASE_URL`, both tables visible via `\dt` (or
  equivalent SELECT against `information_schema`), `git diff` reviewed.

## What to build

### File 1 — `api/_lib/migrations/2026-05-21-siwx.sql`

Match the style of existing migrations in
[api/_lib/migrations/](../../api/_lib/migrations/) (look at
`2026-05-14-x402-skus.sql` and `2026-05-10-skill-purchases.sql` for tone).
Idempotent (`IF NOT EXISTS` on every CREATE) and self-contained.

Two tables:

```sql
CREATE TABLE IF NOT EXISTS siwx_payments (
  resource     text        NOT NULL,
  address      text        NOT NULL,
  network      text        NOT NULL,                -- CAIP-2, e.g. 'eip155:8453'
  paid_at      timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,                         -- NULL = permanent grant
  last_used_at timestamptz,                         -- updated on each siwx auth
  use_count    integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (resource, address)
);

CREATE INDEX IF NOT EXISTS siwx_payments_expires_idx
  ON siwx_payments (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS siwx_nonces (
  nonce    text        PRIMARY KEY,
  resource text        NOT NULL,
  address  text        NOT NULL,
  used_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siwx_nonces_used_at_idx
  ON siwx_nonces (used_at);
```

Notes that must be true in the file:

- `address` is stored exactly as the CAIP-122 payload carries it — for EVM
  that means **lowercase hex** (NOT checksummed), for Solana that means the
  Base58 public key. The storage adapter (prompt 02) is responsible for
  normalizing before SELECT/INSERT. Document this in a 2-line comment above
  the `siwx_payments` table — the adapter relies on the storage layer's
  normalization, not a CHECK constraint.
- Composite PK (`resource`, `address`) gives us O(1) `hasPaid` lookups and
  natural upserts via `ON CONFLICT (resource, address) DO UPDATE`.
- `siwx_nonces` is intentionally separate from `siwx_payments` because nonces
  are write-heavy + garbage-collected hourly (prompt 06), while payments are
  read-mostly + long-lived.
- No FK to any other table — SIWX storage is decoupled from `users`,
  `agent_identities`, `skill_purchases`. A wallet might be SIWX-paid for a
  resource without ever creating an account.

### File 2 — `scripts/apply-siwx-migration.mjs`

A one-shot script that reads the migration file and applies it via the same
Neon HTTP client. Pattern to match:

```js
#!/usr/bin/env node
// Apply the SIWX migration against $DATABASE_URL.
// Usage: DATABASE_URL=... node scripts/apply-siwx-migration.mjs
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(url);
const text = await readFile(
  new URL('../api/_lib/migrations/2026-05-21-siwx.sql', import.meta.url),
  'utf8',
);
// Neon's HTTP API runs one statement per call. Split on semicolons that
// terminate top-level statements (no quoted/escaped ; in this migration).
const statements = text
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith('--'));
for (const s of statements) {
  await sql.query(s);
  console.log('OK:', s.slice(0, 80).replace(/\s+/g, ' '));
}
console.log('siwx tables ready');
```

Verify by running it once against the dev database. If a similar `scripts/*`
helper already exists for another migration (e.g. `scripts/apply-*.mjs`),
match its style. If not, create the file fresh.

### File 3 — wire it into the codebase

If the project has a migration registry (look for `api/_lib/migrations.js`,
`scripts/migrate.mjs`, or similar — do NOT create one if none exists), add
the new migration there in the right place. If migrations are tracked only
by file name on disk (the current pattern, per `ls api/_lib/migrations/`),
nothing else to do.

## Verification you must perform

```bash
# 1. The migration applies cleanly.
DATABASE_URL=$DATABASE_URL node scripts/apply-siwx-migration.mjs

# 2. Both tables exist with the expected columns.
DATABASE_URL=$DATABASE_URL node -e "
import('@neondatabase/serverless').then(async ({ neon }) => {
  const sql = neon(process.env.DATABASE_URL);
  const cols = await sql\`
    select table_name, column_name, data_type
      from information_schema.columns
     where table_name in ('siwx_payments','siwx_nonces')
     order by table_name, ordinal_position\`;
  console.table(cols);
});
"

# 3. Re-running the migration is a no-op (no errors).
DATABASE_URL=$DATABASE_URL node scripts/apply-siwx-migration.mjs
```

All three must succeed before you call this done. Paste the column listing
into the final status update so the next prompt can confirm the shape.

## Done means

- `api/_lib/migrations/2026-05-21-siwx.sql` exists and matches the spec above.
- `scripts/apply-siwx-migration.mjs` exists and runs idempotently.
- Both tables exist in the Neon database.
- `git diff` reviewed: nothing committed-out, nothing TODO, no stubs.

Do **not** commit or push. Surface the diff to the user; they'll call the
push when they're ready.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/siwx/01-db-schema.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
