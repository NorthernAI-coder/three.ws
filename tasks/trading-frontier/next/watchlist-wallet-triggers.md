# Watchlist Wallet Triggers (fire orders when a tracked wallet moves)

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best.
> Genuinely innovative, not a clone. No mocks/fake data/placeholders/TODO/stubs/`setTimeout`
> fake-loading. Wire 100% with REAL APIs + on-chain data. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints in generic plumbing are the only
> exception, never promoted.


## ⛓ Chain protocol — STEP 0, before building

Node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before building:
read all `tasks/` + `BACKLOG.md`; invent **10 genuinely new, non-duplicate, real-codebase-grounded
feature ideas**; write each as a full prompt in `tasks/trading-frontier/next/<slug>.md` matching
this file's structure (including this Chain protocol section); append each to `BACKLOG.md` after a
dedup check. Only then build YOUR feature to the production-ready bar (epic README) and `git rm`
this file in the completion commit.


## The invention

The sharpest signal in memecoins is what a specific wallet does. This adds a personal watchlist
of on-chain wallets and a NEW conditional-order signal: "fire when any wallet on my watchlist
has net-bought (or net-sold) this coin." Pair it with the orders engine and you get
"auto-buy 0.2 SOL when <smart wallet> enters" — without copying a whole wallet (that's the
external mirror); this is a targeted, per-order trigger over real ledger data.

## Context (real, verified)

- Per-coin per-wallet ledger: `pump_coin_wallets` (buy/sell lamports, `is_creator`); wallet
  reputation: `smart_wallet_reputation`; reader: `api/_lib/smart-money.js` (`getSmartMoneyForMint`).
- Conditional signals live in `api/_lib/orders.js` (`CONDITION_SIGNALS`) + evaluated in
  `workers/agent-orders/market.js` (`getSignals`). The Orders tab builds conditions.
- Distinct from the external Universal Wallet Mirror (trading-frontier/07).

## Goal

A per-agent `wallet_watchlist` + a new `watchlist_buy` / `watchlist_sell` conditional signal the
orders worker evaluates from `pump_coin_wallets`, plus watchlist management + use in the Orders
condition builder.

## What to build

1. **Watchlist model** — `wallet_watchlist` (agent_id, address, label) + CRUD endpoint, validated
   Solana addresses.
2. **Signal** — extend the closed condition vocabulary with `watchlist_buy`/`watchlist_sell`
   (bool), computed by joining the order's mint against `pump_coin_wallets` for watchlisted
   addresses; honest null when the ledger has no data yet.
3. **UI** — manage the watchlist; the Orders condition builder offers the new signals.
4. **Backfill** — ensure `pump_coin_wallets` is populated for the mints in question (document the
   ingestion path; never fabricate rows).

## Constraints

Signals from REAL ledger data only; never fire on absent data. Validated, code-free conditions.
Fills stay firewall + spend-guard gated. $THREE-only; runtime mints are data.

## Success criteria

A watchlisted wallet net-buying a coin fires a conditional order through the guarded path; the
watchlist UI works; signals never fire on gaps. Chain extended. Build/test clean. Changelog
(feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/watchlist-wallet-triggers.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
