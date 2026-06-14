# Task 02 — USDC denomination in the buy/sell widget

**Priority:** HIGH. **Depends on:** Task 01 (quote-aware trade recording). **Type:** frontend.

## Goal

Let a user buy and sell a **USDC-paired** agent coin in USDC from the trade widget, end to end:
input denominated in the coin's quote asset, a real quote, a signed `buy_v2`/`sell_v2`
transaction, broadcast, confirm. Today the widget is hardwired to SOL — `src/game/coin-buy.js`
has zero USDC references — so USDC coins are untradeable from our UI even though the backend
(`pump-swap-ix.js`, `pump-quote.js`, `agent-payments` fork) already supports them.

## Why this matters

A user lands on a USDC-paired agent coin's page, hits Buy, and the widget asks for SOL — wrong
asset, broken trade. The launchpad can launch USDC coins it then can't trade. That's a dead path,
and CLAUDE.md forbids dead paths.

## Context — read first

- `src/game/coin-buy.js` — current SOL-only buy widget.
- `src/pump/pump-modals.js` — buy/sell/governance/withdraw modal pipeline
  (prep → sign → broadcast → confirm) already wired for SOL.
- `src/pump/pump-swap-quote.js` — quote logic.
- Backend already done: `api/pump/[action].js` `buy-prep`/`sell-prep`/`quote`,
  `api/_lib/pump-swap-ix.js`, `api/_lib/pump-quote.js` accept/return the quote mint.
- The coin's quote asset is known from `api/pump/coin` / `curve` (`quote_mint`/`is_usdc_pair`)
  and now also from Task 01's recorded trades.

## Scope

1. **Detect the coin's quote asset** when the widget mounts (from `coin`/`curve`). Drive all
   labels, the input suffix, balance display, and slippage off that — don't hardcode "SOL".
2. **USDC input + balance.** For USDC coins: show the user's USDC balance, denominate the amount
   input in USDC, fetch the quote against the USDC quote mint, render the USDC→token preview.
3. **Idempotent quote-ATA create.** USDC sells need the quote ATA created if absent — the prep
   endpoint already prepends this (audit GAP-5); make sure the client signs/broadcasts the full
   returned transaction unchanged and doesn't strip instructions.
4. **Every state designed:** insufficient USDC balance (actionable — link to fund), no quote,
   slippage exceeded, user-rejected signature, broadcast failure. SOL coins must behave exactly
   as before (no regression).
5. **Bonding-curve vs AMM.** Respect the existing route selection (`bonding_curve` vs `amm`
   post-graduation) for USDC coins the same way it works for SOL.

## Definition of done

- [ ] On a USDC-paired coin, Buy and Sell complete a real signed transaction in a browser
      against a real RPC; the trade lands in `pump_agent_trades` with correct quote columns (Task 01).
- [ ] On a SOL-paired coin, behavior is byte-for-byte the same as before (verified, not assumed).
- [ ] Insufficient-balance, rejected-signature, and quote-failure states are all designed and tested.
- [ ] No console errors/warnings from this code; network tab shows real prep/confirm calls.
- [ ] `npm test` passes.
- [ ] Changelog entry (tag: `feature`): "Buy and sell USDC-paired agent coins directly from the
      trade widget."

## Out of scope

Server-signed/custodial USDC trades (Task 03). This task is the **user-wallet** flow only.
