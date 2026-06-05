-- Migration: cosmetic creator revenue splits + sales ledger + ownership (R25).
-- Apply: psql "$DATABASE_URL" -f api/_lib/migrations/20260605000000_cosmetic_economy.sql
--   (or `npm run db:migrate`). Idempotent — safe to re-run.
--
-- The /play avatar economy sells premium cosmetics for $THREE inside coin
-- communities (each /play world IS a pump.fun coin, keyed by its mint). When a
-- cosmetic sells inside a coin's world the settled $THREE splits a configurable
-- share to that coin's creator wallet — a REAL on-chain leg in the buyer's
-- single signed transaction (see multiplayer/src/game-token.js buildTokenPurchase
-- with a `creator` leg). These tables are the queryable record of:
--
--   1. cosmetic_creator_splits — per-coin config: the creator wallet that
--      receives the share and the share itself (basis points, creator-adjustable
--      within a platform-enforced ceiling). A missing row means "use the platform
--      default share, resolve the creator from launch records".
--   2. cosmetic_sales — one row per settled purchase, idempotent on the on-chain
--      signature. Carries every split leg so the creator-earnings dashboard and
--      the platform leaderboard read only real, settled numbers.
--   3. cosmetic_ownership — (wallet, cosmetic) the buyer owns, readable by the
--      boutique (owned vs. locked) and the rarest-fits flex surface.

begin;

-- Per-coin split configuration. `creator_wallet` is the Solana address that
-- receives the creator share; `split_bps` is that share in basis points
-- (0..10000). Both are clamped in application code to a sane ceiling.
create table if not exists cosmetic_creator_splits (
	mint           text primary key,                       -- base58 coin mint (the /play world)
	creator_wallet text not null,                           -- base58 Solana address that earns the share
	split_bps      integer not null
	                 check (split_bps >= 0 and split_bps <= 10000),
	updated_by     text,                                    -- wallet that last set this (the creator)
	created_at     timestamptz not null default now(),
	updated_at     timestamptz not null default now()
);

-- Settled cosmetic sales. One row per confirmed on-chain purchase. `tx_signature`
-- is unique so a replayed settle can never double-record (and the unlock grant is
-- idempotent regardless). Every split leg is stored in $THREE base units (strings
-- would lose bigint range; columns are numeric(20,0) to hold raw 6-decimal totals).
create table if not exists cosmetic_sales (
	id              uuid primary key default gen_random_uuid(),
	tx_signature    text not null unique,                   -- on-chain proof; idempotency key
	buyer_wallet    text not null,                          -- base58 buyer
	mint            text not null,                          -- coin world the sale was tied to
	cosmetic_id     text not null,                          -- catalog id (e.g. 'aura-gold')
	rarity          text not null default 'common',         -- denormalized for the leaderboard
	price_three_raw numeric(20,0) not null,                 -- total $THREE charged (base units)
	creator_wallet  text,                                   -- recipient of the creator leg (null = none)
	creator_raw     numeric(20,0) not null default 0,       -- creator leg (base units)
	treasury_raw    numeric(20,0) not null default 0,       -- treasury leg
	burn_raw        numeric(20,0) not null default 0,       -- burned leg
	split_bps       integer not null default 0,             -- creator share applied at settle time
	settled_at      timestamptz not null default now()
);

create index if not exists cosmetic_sales_creator
	on cosmetic_sales (creator_wallet, settled_at desc)
	where creator_wallet is not null;

create index if not exists cosmetic_sales_mint
	on cosmetic_sales (mint, settled_at desc);

create index if not exists cosmetic_sales_buyer
	on cosmetic_sales (buyer_wallet, settled_at desc);

create index if not exists cosmetic_sales_cosmetic
	on cosmetic_sales (cosmetic_id);

-- Owned premium cosmetics. A wallet owns a cosmetic at most once; `mint` records
-- the world the unlock was first bought in (so the flex surface can link a fit
-- back to where it was earned). Readable by the boutique (owned state) downstream.
create table if not exists cosmetic_ownership (
	buyer_wallet      text not null,
	cosmetic_id       text not null,
	mint              text,                                 -- world the unlock was first bought in
	first_acquired_at timestamptz not null default now(),
	primary key (buyer_wallet, cosmetic_id)
);

create index if not exists cosmetic_ownership_wallet
	on cosmetic_ownership (buyer_wallet);

create index if not exists cosmetic_ownership_cosmetic
	on cosmetic_ownership (cosmetic_id);

-- Auto-bump updated_at on the config table; reuse the standard trigger fn.
do $$ begin
	create trigger cosmetic_creator_splits_set_updated_at before update on cosmetic_creator_splits
		for each row execute function set_updated_at();
exception when undefined_function then null; when duplicate_object then null; end $$;

commit;
