# Auto-Compounding Vault (reinvest realized profits automatically)

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

Profits that sit idle as SOL are dead capital. The Auto-Compounding Vault watches realized gains
from closed orders/positions and automatically reinvests a configurable share — into $THREE, or
back into the best-performing open position — through the guarded trade path. Set a compounding
policy once and the wallet grows its own book.

## Context (real, verified)

- Realized P&L sources: `order_fills` (this engine), `agent_sniper_positions` (`realized_pnl_
  lamports`), `agent_custody_events` (the spend/settle ledger).
- Execution: `executeAgentTrade` (`api/agents/agent-trade.js`); spend policy `agent-trade-guards.js`.
- $THREE is the canonical reinvest target (CA in CLAUDE.md); winners come from open positions.

## Goal

A per-agent compounding policy (trigger: realized profit ≥ X; action: reinvest N% into target),
a worker step that detects new realized gains and fires the reinvest buy through the guarded
path, and a vault dashboard showing compounded total + history.

## What to build

1. **Policy model** — `compound_policies` (threshold, pct, target = $THREE | top_winner, caps).
2. **Detector** — track newly-realized profit from `order_fills`/`agent_sniper_positions` since
   the last compound; idempotent (never double-count a close).
3. **Reinvest** — fire the buy via `executeAgentTrade`, firewall + spend-guard gated, audited;
   record a `compound_events` receipt.
4. **UI** — vault panel: policy editor, compounded-to-date, event log, all states.

## Constraints

Only reinvests REALIZED, settled profit (never unrealized/paper). Honors daily budget + per-trade
caps + kill switch. Idempotent. $THREE-only as the default target; runtime mints are data.

## Success criteria

A realized profit triggers a real, guarded reinvest buy, audited and shown in the vault log;
never double-compounds; kill switch halts it. Chain extended. Build/test clean. Changelog
(feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/auto-compound-vault.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
