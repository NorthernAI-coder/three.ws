# Task: Schema baseline — guarantee the columns the wallet/agent code writes to exist on a fresh DB

> **Wave 0 — prerequisite. Blocks 01** (and therefore the whole epic). Every
> wallet-provisioning write targets columns that the canonical `schema.sql`
> never declares; a database initialised purely from `schema.sql` 500s on the
> first wallet write. Fix this before the foundation task runs its backfill.

## Context

Agent wallet provisioning stores everything in `agent_identities.meta`:
`generateSolanaAgentWallet()` / `provisionAgentWallets()` write
`meta.solana_address`, `meta.encrypted_solana_secret`, `meta.encrypted_wallet_key`
(`api/_lib/agent-wallet.js:325`, `:127`, `:64`), and the create path persists them
at `api/agents.js:258`. The agent record also carries a `skills` field.

But the canonical bootstrap schema does **not** declare those columns:

- `CREATE TABLE IF NOT EXISTS agent_identities (…)` at `api/_lib/schema.sql:401-415`
  has **no `meta` and no `skills` column**.
- The additive `alter table agent_identities add column if not exists …` block at
  `api/_lib/schema.sql:422-442` adds `wallet_address`, voice, farcaster, and persona
  columns — but **not `meta`, not `skills`**.
- `meta` only ever materialises through a migration that *assumes it already
  exists* — `api/_lib/migrations/2026-04-29-onchain-unified.sql` does
  `update agent_identities … meta` and `create index … on agent_identities
  ((meta->'onchain'->>'chain'))` (`:22,:43,:69-74`) without ever adding the column.

Net effect: a fresh DB provisioned only from `schema.sql` is missing `meta`/`skills`,
so **every wallet write — and task 01's backfill — fails**. Existing deployments
only work because the column was hand-added out-of-band, an unenforced deploy-order
dependency (memory: `vercel-symlink-build-trap` / manual-migration class of bugs).

Two related ordering bugs in the same file, fix them in the same pass:

1. `create index … on agent_identities(wallet_address)` at `schema.sql:419-420`
   runs **before** `alter table … add column if not exists wallet_address` at
   `:423` — on a truly fresh DB the index references a column that does not exist
   yet. Move the index after the column is guaranteed.
2. Audit the surrounding indexes/`update`s for the same "reference-before-add"
   pattern and the `is_public` note already flagged at `schema.sql:443-445`.

## Goal

`api/_lib/schema.sql` alone, applied to an empty Postgres database, produces a
schema on which agent + wallet provisioning, the task-01 backfill, trading,
sniping, and x402 all succeed with **zero** "column does not exist" errors — and
re-applying it is a no-op. No code change to the provisioning logic; this is a
schema-correctness task only.

## Files to Read First

- `api/_lib/schema.sql:401-445` — the `agent_identities` CREATE + additive ALTER
  block + index ordering + the `is_public` note
- `api/_lib/migrations/2026-04-29-onchain-unified.sql` — the migration that uses
  `meta` without adding it; confirm what shape `meta` must hold
- `api/_lib/agent-wallet.js:64,127,325` — exactly which `meta.*` keys are written
- `api/agents.js:258-292`, `:150-169` — create + bootstrap paths writing `meta`/`skills`
- A recent dated migration for the naming/format convention (e.g.
  `api/_lib/migrations/20260615020000_agent_sniper.sql`)
- How `schema.sql` is applied on bootstrap and how migrations are run (find the
  runner; confirm whether `schema.sql` is the source of truth for fresh DBs or
  whether the migration set is — fix whichever the bootstrap path actually uses)

## What to Build / Do

1. **Declare the missing columns idempotently.** Add to the additive block in
   `api/_lib/schema.sql` (and mirror in a new dated migration under
   `api/_lib/migrations/` so existing DBs converge):
   ```sql
   alter table agent_identities add column if not exists meta   jsonb not null default '{}'::jsonb;
   alter table agent_identities add column if not exists skills jsonb not null default '[]'::jsonb;
   ```
   Verify the exact type/shape `skills` is read/written as in the code before
   committing to `jsonb`/`'[]'` — match reality, don't guess.
2. **Fix the index ordering.** Move
   `create index if not exists agent_identities_wallet on agent_identities(wallet_address)…`
   to **after** the `add column if not exists wallet_address` statement so a fresh
   apply never references a not-yet-created column. Apply the same fix to any other
   index/`update` that references an additively-added column ahead of its `ADD`.
3. **Fold in the manual migration's column intent.** Whatever `meta`/`onchain`
   structure `2026-04-29-onchain-unified.sql` depends on must be guaranteed by
   `schema.sql` so that migration (and the onchain indexes) can never run against a
   missing column. Do not duplicate the data backfill — only guarantee the column
   exists first.
4. **Prove a clean-room apply.** Add a re-runnable verification (extend
   `scripts/` or a test) that applies `schema.sql` to an empty database (a
   throwaway/temp Postgres or the existing test harness), then runs the full
   migration set, and asserts `agent_identities` has `meta` and `skills` and that a
   simulated provisioning `update … set meta = …` succeeds. This is the regression
   guard against the next column drifting out of `schema.sql`.

## Constraints

- **Idempotent and additive only.** `add column if not exists`, `create index if
  not exists`; never `DROP`, never reorder existing data, safe to re-run. Do not
  rewrite the historical migration files — converge via the new migration +
  `schema.sql`.
- **No data loss / no behaviour change.** Provisioning logic in
  `api/_lib/agent-wallet.js` and `api/agents.js` is unchanged; this task only makes
  the schema match what that code already assumes.
- **Source-of-truth discipline.** Whichever artifact the bootstrap actually
  applies for a fresh DB (`schema.sql` vs the migration set) must be the one that
  ends up correct; keep both consistent so they can't diverge again.
- Respect the shared worktree: stage only the files you change
  (`api/_lib/schema.sql`, the new migration, the verification script/test), never
  `git add -A`, re-check `git status` before committing.

## Success Criteria

- `agent_identities` has `meta jsonb` and `skills jsonb` declared in
  `api/_lib/schema.sql` and in a new idempotent dated migration; re-applying either
  is a no-op.
- No index or `update` in `schema.sql` references an additively-added column before
  that column's `ADD` (the `wallet_address` index ordering is fixed).
- The clean-room verification applies `schema.sql` + migrations to an empty DB and
  confirms a simulated wallet provisioning write to `meta` succeeds — committed and
  re-runnable.
- Task 01's backfill migration can run on a clean-room DB without a
  "column meta does not exist" error.
- `npm run typecheck` + `npm test` clean. This is internal infra — **no changelog
  entry** (no user-visible change), per `CLAUDE.md`. Run the **completionist**
  subagent on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/00-schema-baseline.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
