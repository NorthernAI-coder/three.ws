-- Migration: record the quote (pairing) asset on every pump.fun trade.
-- Apply: psql "$DATABASE_URL" -f api/_lib/migrations/2026-06-14-pump-trades-quote.sql
-- Idempotent.
--
-- pump_agent_trades originally modelled SOL only: a `sol_amount` lamports column
-- and nothing recording which quote currency a trade settled in. pump.fun v2
-- coins can be USDC-paired (buy_v2/sell_v2 against a USDC curve), and our launch,
-- wallet-signed, and custodial trade paths all support that now. These columns
-- make the trade row self-describing for both quote assets:
--   quote_mint   → the quote SPL mint (WSOL mint for SOL-paired, USDC mint for USDC).
--   quote_symbol → 'SOL' | 'USDC' | 'OTHER' — a stable display label.
--   quote_amount → atomic units of the quote asset spent (buy) / received (sell).
--                  For SOL trades this equals sol_amount (lamports); for USDC it
--                  is 6-decimal USDC atomics. New code reads quote_amount.
-- sol_amount is kept (not dropped) for backward compatibility.

begin;

alter table pump_agent_trades
	add column if not exists quote_mint text;
alter table pump_agent_trades
	add column if not exists quote_symbol text;
alter table pump_agent_trades
	add column if not exists quote_amount numeric(40, 0);

-- Backfill legacy rows: every pre-existing trade is SOL-paired, so the quote is
-- wrapped SOL and the quote amount is the lamports already stored in sol_amount.
update pump_agent_trades
	set quote_mint = 'So11111111111111111111111111111111111111112',
	    quote_symbol = 'SOL',
	    quote_amount = sol_amount
	where quote_mint is null;

commit;
