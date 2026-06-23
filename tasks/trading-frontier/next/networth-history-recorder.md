# Task — Net-Worth History Recorder (real equity curve + true drawdown)

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best in the
> world. Genuinely innovative, not a clone. No mocks, no fake/sample data, no placeholders, no
> TODO/stubs, no `setTimeout` fake-loading. Wire 100% end-to-end with REAL APIs and real on-chain
> data. The only coin is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints
> in generic trade plumbing are the only exception and are never promoted.

## ⛓ Chain protocol — do this as STEP 0, before building

This task is a node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before you
build the feature below:
1. Read all of `tasks/` (every epic) + `tasks/trading-frontier/BACKLOG.md`. Know what exists/planned.
2. Invent **10 genuinely new, non-duplicate feature ideas**, each innovative, grounded in the real
   three.ws codebase (cite real files/APIs/tables), advancing sniping/trading/launching/buying/selling.
3. Write each as a full prompt in `tasks/trading-frontier/next/<slug>.md`, matching this file's
   structure exactly — including this Chain protocol section, so the chain continues.
4. Append one line per new prompt to `BACKLOG.md` after confirming it isn't a duplicate.
5. Only then build YOUR feature to the **production-ready bar** in the epic README, and `git rm`
   this file in the completion commit.

## The invention

Portfolio Command (trading-frontier 03) computes net worth *right now*, and its sparkline only lives
for the current session — when you close the tab, the history is gone, and its "max drawdown" is
limited to the sniper realized equity curve, not the wallet's actual net worth over time. Build a
**Net-Worth History Recorder**: a scheduled snapshotter that persists each funded agent wallet's
real net worth (SOL + USD) on an interval into a time-series, so the platform can finally show a
*true* equity curve, real net-worth (not just realized-PnL) drawdown, time-windowed return (24h/7d/
30d), and a high-water mark — the foundation every serious portfolio chart needs.

## Context (real, verified)

- Live valuation already exists: `api/_lib/portfolio.js` (`getPortfolio`, `valuateHoldings`) and
  `api/_lib/balances.js` (`getBalances`, `walletUsdTotal`). Reuse them — do not re-implement pricing.
- Owned funded wallets: `agent_identities` (`meta.solana_address`). Cron/worker pattern exists for
  the sniper + signals (`workers/`, Vercel cron in `vercel.json`); SSE + DB via `api/_lib/db.js`.
- The Portfolio tab + `/api/agents/:id/portfolio` are the consumer surfaces to extend with history.

## Goal

A new `agent_networth_snapshots` time-series + a recorder (cron/worker) that snapshots each funded
agent's net worth on an interval, and a history API + chart that turn it into a real equity curve,
true net-worth drawdown, and windowed returns in the wallet hub.

## What to build

1. **Snapshot schema + recorder** — a migration for `agent_networth_snapshots` (agent_id, network,
   ts, net_worth_sol, net_worth_usd, sol_usd, holdings_count) and a scheduled job that values every
   funded agent (bounded concurrency, reusing `getPortfolio`) and appends a row. Idempotent per
   interval; skips empty wallets honestly; degrades per-agent failures without poisoning the batch.
2. **History API** — `/api/agents/:id/portfolio/history?window=` returns the down-sampled series +
   derived stats (true max drawdown from the net-worth curve, high-water mark, windowed return %).
3. **Retention** — sane down-sampling/retention so the series stays bounded (e.g. fine-grained
   recent + daily older), documented and enforced.
4. **UI** — a real equity-curve chart in the Portfolio header (replacing the session-only sparkline)
   with window toggles, plus true-drawdown + windowed-return stats. All states designed (empty until
   the first snapshots accrue, with a helpful "history is building" message); accessible; responsive.

## Constraints

- Every snapshot is a real valuation; no backfilled/fabricated points (history starts when recording
  starts — say so). Read-only analytics; no trades.
- Bounded cost: concurrency caps, down-sampling, retention. $THREE-only rule; runtime mints are
  holdings data only.

## Success criteria

- Funded agents accrue a real net-worth time-series; the Portfolio chart shows a true equity curve,
  real net-worth drawdown, and windowed returns, with an honest "building history" empty state.
- Build/typecheck/test clean. Changelog entry (tags: feature, infra). Completionist passes. Chain extended.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/networth-history-recorder.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
