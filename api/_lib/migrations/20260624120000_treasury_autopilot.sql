begin;

-- Treasury Autopilot (prompts/agent-wallets/14) — the agent that funds its own
-- existence.
--
-- An agent's custodial wallet both EARNS (tips, its coin's creator fees, trading)
-- and COSTS money to run (the metered LLM/voice compute that makes it think and
-- talk). Treasury Autopilot lets the owner arm a natural-language treasury policy
-- the agent executes on its OWN wallet, autonomously and bounded: settle its own
-- compute, hold a safety buffer, dollar-cost-average a slice of income into
-- $THREE, compound its coin fees into buybacks, and sweep profit to the owner on
-- a schedule. Every action is a real, spend-policy-gated on-chain transaction.
--
-- Two tables:
--   agent_treasury_autopilot   the per-agent policy: the owner's NL text, the
--                              compiled+approved rules, and the arm/kill flags.
--                              Config side — the source of truth for "what is armed".
--   agent_autopilot_runs       the run ledger: one row per (agent, rule, period)
--                              attempt, idempotent by design so an overlapping
--                              cron tick can never double-execute. Powers the
--                              runway view and the activity trail. The custodial
--                              spend itself is ALSO written to agent_custody_events
--                              (the shared audit trail) — this table is the
--                              autopilot-specific scheduling + analytics side.

-- ── policy (config) ──────────────────────────────────────────────────────────
create table if not exists agent_treasury_autopilot (
    agent_id      uuid        primary key references agent_identities(id) on delete cascade,
    user_id       uuid        not null,                       -- owner who armed it (immutable owner of the agent)
    network       text        not null default 'mainnet',
    -- Arm state. `armed` = the owner approved the compiled rules and turned it on.
    -- `killed` = the prominent kill switch. A killed policy halts ALL execution
    -- instantly regardless of `armed`, and is the safe resting state.
    armed         boolean     not null default false,
    killed        boolean     not null default false,
    -- The owner's natural-language policy, verbatim — shown back so they always
    -- see what they wrote.
    policy_text   text,
    -- The compiled, validated, owner-APPROVED rules (the structured form the
    -- executor runs). Null until the owner approves a compile.
    rules         jsonb       not null default '{}'::jsonb,
    -- Hash of the approved rules. If a later compile differs, the UI requires a
    -- fresh approval before arming — the owner always re-consents to changes.
    rules_hash    text,
    approved_at   timestamptz,
    -- Per-rule pause map: { "<rule_kind>": true } pauses just that rule without
    -- disarming the whole policy.
    paused        jsonb       not null default '{}'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- The cron scans armed, un-killed policies on mainnet ordered by last touch.
create index if not exists agent_treasury_autopilot_active
    on agent_treasury_autopilot (network, updated_at desc)
    where armed = true and killed = false;

-- ── run ledger (idempotent execution log + analytics) ────────────────────────
create table if not exists agent_autopilot_runs (
    id               bigserial    primary key,
    agent_id         uuid         not null references agent_identities(id) on delete cascade,
    user_id          uuid,
    network          text         not null default 'mainnet',
    -- settle_compute | buffer | dca | buyback | sweep
    rule_kind        text         not null,
    -- The period bucket this run satisfies (e.g. 'dca:2026-W26', 'sweep:2026-06-26').
    -- The unique index below makes (agent, kind, period) execute at most once.
    period_key       text         not null,
    -- planned | executing | confirmed | skipped | failed
    status           text         not null default 'planned',
    -- Why it skipped/failed (e.g. 'below_buffer', 'no_income', 'no_liquidity',
    -- 'price_feed_down', 'killed') — surfaced honestly in the activity trail.
    reason           text,
    -- The on-chain tx (buy/sweep/settle). Null for skips.
    signature        text,
    amount_lamports  bigint,
    amount_usd       numeric,
    -- Free-form: { mint, route, expected_out, explorer, trigger, ... }.
    meta             jsonb        not null default '{}'::jsonb,
    created_at       timestamptz  not null default now(),
    updated_at       timestamptz  not null default now()
);

-- Idempotency: at most one run per (agent, rule_kind, period_key). The executor
-- INSERTs this row BEFORE moving funds; a duplicate insert loses the race and the
-- second runner backs off — no double-spend on overlapping ticks or retries.
create unique index if not exists agent_autopilot_runs_idem
    on agent_autopilot_runs (agent_id, rule_kind, period_key);

-- Activity trail + runway analytics: newest-first per agent.
create index if not exists agent_autopilot_runs_agent_time
    on agent_autopilot_runs (agent_id, created_at desc);

commit;
