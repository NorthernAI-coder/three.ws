-- Treasury Ledger — the durable, append-only accounting + audit record for every
-- SOL movement the economy master wallet (api/_lib/economy-master.js) makes.
--
-- WHY: the treasury-topup cron auto-refills engine signers from the ONE master
-- (Www…WwW). That moves real money on a schedule. Telegram alerts + an ephemeral
-- HTTP response are not an accounting record: you cannot reconcile a month, prove
-- to a regulator/auditor where funds went, or detect a breach after the fact.
-- This table is that record — one row per transfer/skip/reject, plus a `summary`
-- row per sweep carrying the before/after master balance, the caps in force, the
-- reconciliation result, and a tamper-evident hash chain over the summary rows.
--
-- Ground truth is still the chain: every `transfer` row carries the on-chain
-- `tx_signature`, independently verifiable on Solscan forever. This table is the
-- queryable index over that truth plus the off-chain context (which run, which
-- caps, which reconciliation) the chain does not hold.
--
-- APPEND-ONLY: our code only ever INSERTs. Rows are never updated. The
-- prev_hash/row_hash chain over `summary` rows makes any retroactive edit or
-- deletion detectable (a broken link). Consumers: api/cron/treasury-topup.js
-- (writer), api/ops/treasury-ledger.js (owner/accounting reader + CSV export).

create table if not exists treasury_ledger (
    id                  bigserial primary key,
    ts                  timestamptz not null default now(),
    -- Groups every row emitted by one sweep run.
    sweep_id            uuid not null,
    -- Monotonic sweep counter; orders the hash chain deterministically.
    seq                 bigint not null default 0,
    -- 'transfer' | 'skip' | 'reject' | 'summary'
    kind                text not null,
    master              text not null,
    network             text not null default 'mainnet',
    -- Line rows (transfer/skip/reject): which engine and how much.
    engine_name         text,
    engine_pubkey       text,
    amount_lamports     bigint,
    amount_sol          numeric(20,9),
    -- funded | failed | rejected | skipped | ok | breach
    status              text not null,
    reason              text,
    tx_signature        text,
    -- Summary rows only: the run's balances, caps, and reconciliation.
    master_sol_before   numeric(20,9),
    master_sol_after    numeric(20,9),
    spent_sol           numeric(20,9),
    reserve_sol         numeric(20,9),
    per_topup_max_sol   numeric(20,9),
    run_cap_sol         numeric(20,9),
    expected_after_sol  numeric(20,9),
    -- Breach signal: SOL that left the master beyond what this cron sent (fees
    -- excluded). Non-zero means the master key moved funds out of band.
    unexplained_sol     numeric(20,9),
    breach              boolean not null default false,
    -- Provenance: the deployed commit that produced this row.
    git_sha             text,
    -- Tamper-evident chain over summary rows (sha256(prev_hash || canonical row)).
    prev_hash           text,
    row_hash            text,
    meta                jsonb not null default '{}'::jsonb
);

create index if not exists treasury_ledger_ts     on treasury_ledger (ts desc);
create index if not exists treasury_ledger_sweep  on treasury_ledger (sweep_id);
create index if not exists treasury_ledger_engine on treasury_ledger (engine_name, ts desc);
create index if not exists treasury_ledger_breach on treasury_ledger (breach) where breach = true;
