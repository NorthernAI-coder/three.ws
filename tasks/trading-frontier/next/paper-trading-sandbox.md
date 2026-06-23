# Paper-Trading Sandbox (forward-test orders & strategies on live prices)

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

Before risking real SOL, prove the setup. The Sandbox runs any order or strategy in paper mode
against LIVE prices — real quotes, no broadcast — and tracks the hypothetical fills and running
P&L over time. It's not a historical backtest (that's the NL strategy backtester); it's forward
paper trading on the real market, so what you see is what would have happened, live.

## Context (real, verified)

- The orders worker already supports paper mode: `ORDERS_MODE=simulate` → `order_fills.status =
  'simulated'` with the real quote as the paper fill (`workers/agent-orders/sweep.js`).
- `executeAgentTrade` simulate path (`api/agents/agent-trade.js`) returns real expected-out
  without signing. Distinct from next-gen-trading/05 (historical backtester).

## Goal

A per-agent paper toggle on orders/strategies that routes fills to a sandbox ledger (no funds),
marks them live against real quotes over time, and a Sandbox dashboard charting hypothetical
equity + per-order paper P&L — with a one-click "go live" promotion.

## What to build

1. **Sandbox ledger** — `paper_fills` (mirrors `order_fills`, never touches custody) recording the
   real-quote paper fill + a mark-to-market series.
2. **Paper orders** — orders flagged `paper` evaluate identically but settle to the sandbox.
3. **Equity curve** — chart hypothetical P&L from real marks; compare side-by-side to live.
4. **Promote** — clone a proven paper order/strategy to a real armed one. All states designed.

## Constraints

Paper NEVER moves funds or writes custody. Marks come from REAL live quotes only. Clearly labelled
as practice everywhere. $THREE-only; runtime mints are data.

## Success criteria

A paper order fills against live quotes, the equity curve updates from real marks, and promotion
to live works — with zero custody impact. Chain extended. Build/test clean. Changelog (feature).
Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/paper-trading-sandbox.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
