# Task 01 — Quote-aware trade recording + portfolio subtotals

**Priority:** HIGH — blocks 02, 03. **Type:** backend + schema.

## Goal

Make `pump_agent_trades` and the portfolio API correct for **USDC-paired** agent coins.
Today the table only models SOL: a `sol_amount` lamports column and nothing that says which
quote asset the trade actually used. Pump.fun launched USDC-paired coins (post 2026-05-21,
`buy_v2`/`sell_v2` with explicit `quote_mint`), and our launch + curve code already supports
them — but every trade we record for a USDC coin lands in `sol_amount` as if it were lamports,
so prices, volumes, and portfolio subtotals are wrong for those coins.

## Why this matters

A trader on a USDC-paired agent coin sees nonsense P&L and the agent-profile token widget
reports a fake market cap. This is a data-integrity bug, not cosmetics. The v2 audit
(`docs/pumpfun-program/AUDIT-2026-06-11.md`, "remaining productization") explicitly listed
`quote_amount`/`quote_mint` columns and portfolio per-quote subtotals as the unfinished work.

## Context — read first

- `api/_lib/migrations/2026-04-29-pump-trades.sql` — current schema (SOL-only).
- `api/_lib/pumpfun-ws-feed.js:207-275` — `classifyQuote()` already returns
  `{ quote_mint, quote_symbol, is_usdc_pair }`. Reuse it; do not reinvent.
- `api/_lib/pump-quote.js` — quote-mint classification (SOL vs USDC) used by the trade path.
- INSERT sites that must be updated:
  - `api/pump/helius-webhook.js:47`
  - `api/agents/pumpfun/[action].js:211` and `:1003`
  - any buy-confirm / sell-confirm path in `api/pump/[action].js` that writes a trade
- Consumers that must read the new columns:
  - `api/pump/[action].js` → `portfolio`, `coin-trades`, `dashboard`
  - `src/pump/dashboard.js`, `src/pump/agent-token-widget.js` (display)

## Scope

1. **Migration.** New file `api/_lib/migrations/2026-06-14-pump-trades-quote.sql`:
   - `quote_mint text` — the quote SPL mint (WSOL or USDC mint string).
   - `quote_symbol text` — `'SOL' | 'USDC' | 'OTHER'`.
   - `quote_amount numeric(40,0)` — atomic units of the quote asset spent (buy) / received (sell).
   - Backfill: set `quote_mint = <WSOL mint>`, `quote_symbol = 'SOL'`,
     `quote_amount = sol_amount` for all existing rows (every legacy row is SOL-paired).
   - Keep `sol_amount` (don't drop) for backward compat; new code reads `quote_amount`.
   - Idempotent: `add column if not exists`, wrapped in a transaction, follows the existing
     migration file conventions in that directory.
2. **Wire every INSERT site** to populate the three new columns using `classifyQuote()` /
   the resolved quote mint from `pump-quote.js`. For SOL trades, `quote_amount === sol_amount`.
3. **Portfolio per-quote subtotals.** `portfolio` action returns holdings grouped/subtotaled by
   quote asset (SOL subtotal, USDC subtotal) instead of summing lamports across mismatched units.
4. **Display.** `coin-trades` / `dashboard` responses expose `quote_symbol` + a correctly-scaled
   amount; the dashboard and token widget render `"X USDC"` vs `"Y SOL"` rather than assuming SOL.

## Definition of done

- [ ] Migration runs cleanly on a fresh DB and on the existing DB (idempotent, backfill correct).
- [ ] Every trade INSERT writes `quote_mint`, `quote_symbol`, `quote_amount`; no path left on
      the SOL-only assumption (grep the codebase to prove it).
- [ ] A recorded USDC-paired trade shows the right amount + symbol in `coin-trades`, `dashboard`,
      and the agent-profile widget. SOL trades unchanged.
- [ ] `portfolio` returns separate SOL and USDC subtotals; no cross-unit summing.
- [ ] `npm test` passes; add/extend a test that records a USDC trade and asserts the columns.
- [ ] Changelog entry (tag: `fix` + `feature`): "USDC-paired agent coins now record and display
      correct trade amounts."

## Out of scope

Buy/sell **UI** denomination (Task 02) and custodial USDC signing (Task 03). This task is the
data layer they both depend on.
