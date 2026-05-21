-- Club dancer wallets + payout ledger (prompt 08).
--
-- Per-dancer registry: which EVM/Solana addresses receive their swept tips.
-- Payout ledger: one row per on-chain sweep tx, with an audit-grade link back
-- to the tip rows it settled. Wallets are seeded via the admin endpoint
-- (POST /api/admin/club/dancer-wallet); never commit private keys or
-- addresses into this migration.
--
-- Also (idempotently) ensures the columns the payout sweep relies on exist
-- on club_tips, so deploying this migration does not require prompt 07
-- having been applied first. If club_tips already exists (prompt 07 shipped),
-- the alter clauses are no-ops.

create table if not exists club_dancer_wallets (
	dancer text primary key,
	display_name text not null,
	bio text,
	evm_address text,
	solana_address text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists club_tips (
	id uuid primary key default gen_random_uuid(),
	ticket_id text,
	dancer text not null,
	dance text,
	clip text,
	label text,
	payer text,
	network text not null,
	amount_atomics numeric not null,
	asset text not null,
	started_at timestamptz,
	ends_at timestamptz,
	created_at timestamptz not null default now(),
	paid_at timestamptz,
	paid_tx text
);

create index if not exists club_tips_dancer_created
	on club_tips (dancer, created_at desc);

create index if not exists club_tips_unpaid
	on club_tips (dancer, network, asset)
	where paid_at is null;

-- Defensive alters in case club_tips was created by prompt 07 without the
-- payout columns. `add column if not exists` is idempotent in PG 9.6+.
alter table club_tips add column if not exists paid_at timestamptz;
alter table club_tips add column if not exists paid_tx text;

create table if not exists club_payouts (
	id uuid primary key default gen_random_uuid(),
	dancer text not null references club_dancer_wallets(dancer),
	network text not null,
	asset text not null,
	amount_atomics numeric not null,
	tx text not null,
	swept_tip_count integer not null,
	created_at timestamptz not null default now()
);

create index if not exists club_payouts_dancer_created
	on club_payouts (dancer, created_at desc);

-- Default seed: register the four built-in dancers with display names but no
-- wallets. An admin sets the addresses via /api/admin/club/dancer-wallet.
-- Until a wallet is set the sweep cron logs and skips that (dancer, network).
insert into club_dancer_wallets (dancer, display_name) values
	('1', 'Nyx'),
	('2', 'Ari'),
	('3', 'Sable'),
	('4', 'Vesper')
on conflict (dancer) do nothing;
