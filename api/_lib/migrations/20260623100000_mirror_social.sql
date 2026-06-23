-- Migration: the Mirror / Copy-Trade Social Graph (task 09, invention layer).
--
-- This is the CUSTODIAL agent-to-agent mirror layer — distinct from the existing
-- non-custodial copy_* tables (which only record intents a human acts on from any
-- wallet). Here, an owner subscribes ONE of THEIR agents (a custodial wallet) to
-- mirror ANOTHER public agent's real on-chain trades. When the leader trades, the
-- follower's agent executes the proportional move automatically — real tx, signed
-- with the follower's custodial key, clamped to the follower's spend policy.
--
-- Two tables:
--   mirror_subscriptions — the relationship + the follower's mirror policy. The
--                          policy is bounded by, and can never exceed, the agent's
--                          existing spend policy (meta.spend_limits / trade_limits);
--                          it is the follower's own, narrower risk dial.
--   mirror_fills         — the audit trail: every mirrored execution (filled,
--                          skipped, or failed) with the leader reference + trigger,
--                          traceable end to end alongside the custody ledger.
--
-- A leader's opt-out of being copyable lives in agent_identities.meta.copyable
-- (default copyable), so no schema change is needed for that — the engine reads it.
begin;

-- ── mirror_subscriptions ─────────────────────────────────────────────────────
-- follower_agent_id (the owner's custodial agent) mirrors leader_agent_id (any
-- public agent). One subscription per (follower_agent, leader_agent, network).
-- follower_user_id is denormalized for the owner-only ownership check on every
-- read/write without a join back to agent_identities.
create table if not exists mirror_subscriptions (
    id                 uuid        primary key default gen_random_uuid(),
    follower_agent_id  uuid        not null references agent_identities(id) on delete cascade,
    follower_user_id   uuid        not null references users(id) on delete cascade,
    leader_agent_id    uuid        not null references agent_identities(id) on delete cascade,
    network            text        not null default 'mainnet',   -- mainnet | devnet
    status             text        not null default 'active',     -- active | paused | stopped

    -- Allocation: how the follower's order is sized from the leader's move.
    --   proportional : leader's SOL spend × proportion (e.g. 0.5 = half the leader)
    --   fixed        : a flat fixed_sol per copied buy
    --   pct_balance  : pct_balance % of the follower's own SOL balance
    allocation_mode    text        not null default 'proportional',
    proportion         numeric     not null default 1.0,          -- multiplier vs leader (proportional)
    fixed_sol          numeric,                                   -- fixed mode
    pct_balance        numeric,                                   -- pct_balance mode (0–100)

    -- The follower's own caps. Hard ceilings, re-clamped to the agent's spend
    -- policy server-side at execution time (the spend policy always wins).
    max_per_trade_sol  numeric     not null default 0.25,
    max_per_day_sol    numeric     not null default 1.0,
    min_order_sol      numeric     not null default 0.001,        -- skip dust below this
    slippage_bps       int         not null default 300,          -- clamped to trade_limits.max_slippage_bps

    -- Asset gating. allow_mints non-empty ⇒ only those mints are mirrored.
    -- deny_mints always blocks. $THREE is never special-cased here — this is
    -- coin-agnostic plumbing keyed on whatever mint the leader actually traded.
    allow_mints        text[]      not null default '{}'::text[],
    deny_mints         text[]      not null default '{}'::text[],
    copy_sells         boolean     not null default true,         -- mirror leader exits

    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),

    constraint mirror_sub_uniq unique (follower_agent_id, leader_agent_id, network),
    constraint mirror_no_self  check (follower_agent_id <> leader_agent_id),
    constraint mirror_alloc_mode check (allocation_mode in ('proportional','fixed','pct_balance')),
    constraint mirror_status_ck  check (status in ('active','paused','stopped'))
);

-- "Who does this agent follow" (follower lens) and "who follows this agent"
-- (leader/discovery lens) are both hot reads; index each direction.
create index if not exists mirror_sub_follower
    on mirror_subscriptions (follower_agent_id, status);
create index if not exists mirror_sub_leader
    on mirror_subscriptions (leader_agent_id, network, status);
create index if not exists mirror_sub_user
    on mirror_subscriptions (follower_user_id, status);

-- ── mirror_fills ─────────────────────────────────────────────────────────────
-- One row per (subscription, leader trade, direction). The partial unique index
-- makes the fanout idempotent: a re-run over the same leader trade can't fire a
-- second mirrored order. leader_custody_event_id is the discretionary-trade
-- trigger; leader_position_id is the sniper trigger (mutually exclusive).
create table if not exists mirror_fills (
    id                      uuid        primary key default gen_random_uuid(),
    subscription_id         uuid        not null references mirror_subscriptions(id) on delete cascade,
    follower_agent_id       uuid        not null,
    follower_user_id        uuid        not null,
    leader_agent_id         uuid        not null,
    network                 text        not null default 'mainnet',

    -- Trigger references (exactly one set).
    leader_custody_event_id bigint,                              -- agent_custody_events.id (discretionary)
    leader_position_id      uuid,                                -- agent_sniper_positions.id (sniper)
    leader_signature        text,                                -- leader's on-chain tx (attribution)

    mint                    text        not null,
    symbol                  text,
    direction               text        not null,                -- buy | sell
    planned_sol             numeric,                             -- sized order (null when skipped pre-size)

    status                  text        not null,                -- filled | skipped | failed
    skip_reason             text,                                -- why a copy/sell was not executed
    follower_signature      text,                                -- the mirrored tx signature
    follower_custody_event_id bigint,                            -- agent_custody_events.id of the mirror
    usd                     numeric,
    detail                  jsonb       not null default '{}'::jsonb,

    created_at              timestamptz not null default now(),

    constraint mirror_fill_dir check (direction in ('buy','sell')),
    constraint mirror_fill_status check (status in ('filled','skipped','failed'))
);

-- Idempotency: one fill per (subscription, leader trigger, direction). Two partial
-- indexes because the trigger source is either a custody event or a sniper position.
create unique index if not exists mirror_fill_custody_uniq
    on mirror_fills (subscription_id, leader_custody_event_id, direction)
    where leader_custody_event_id is not null;
create unique index if not exists mirror_fill_position_uniq
    on mirror_fills (subscription_id, leader_position_id, direction)
    where leader_position_id is not null;

-- Owner-facing audit feed: a follower's mirror history, newest first.
create index if not exists mirror_fills_follower_time
    on mirror_fills (follower_agent_id, created_at desc);
-- Leaderboard / leader social proof: a leader's downstream mirror activity.
create index if not exists mirror_fills_leader_time
    on mirror_fills (leader_agent_id, created_at desc);

commit;
