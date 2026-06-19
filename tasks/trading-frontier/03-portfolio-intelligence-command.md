# Task 03 — Portfolio Intelligence & Risk Command (unified cross-wallet)

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

A trader on three.ws has SOL, SPL holdings, open sniper positions, discretionary positions, and
(soon) orders/swarms — scattered. Build a **Portfolio Command**: one real-time, unified view of
everything the agent wallet holds and has done, with honest **PnL attribution** (which strategy /
signal / source made or lost money), live **risk metrics** (exposure, concentration, drawdown,
correlation to the broad pump.fun tape), and a cost-basis / realized-vs-unrealized breakdown.
Bloomberg-grade portfolio analytics for an AI agent's wallet — nothing like it exists for memecoins.

## Context (real, verified)

- Balances: `api/agents/solana-wallet.js` (SOL + SPL holdings, USDC). Live SOL price: feed util in
  `api/_lib/pumpfun-ws-feed.js#getSolPrice` / `agent-trade-guards.js#lamportsToUsd`.
- Trade truth: `agent_sniper_positions`, `agent_custody_events` (spend/withdraw/trade/snipe/x402),
  discretionary trades via `api/agents/solana-trade.js` history.
- Metrics engine to reuse/extend: `api/_lib/trader-stats.js` (`computeTraderMetrics`: PnL, ROI,
  drawdown, Sharpe, profit factor, churn). Live position updates: `api/sniper/stream.js`.
- Token valuation: curve/AMM quotes `api/_lib/pump.js` (`getAmmPoolState`).

## Goal

A portfolio service (`api/_lib/portfolio.js` + `/api/agents/:id/portfolio`) that values all
holdings live, attributes PnL by source, computes risk, and a Portfolio Command UI — all from real
on-chain + ledger data.

## What to build

1. **Valuation + holdings** — enumerate the agent wallet's SOL + every SPL holding, value each via
   live curve/AMM quotes (graceful for illiquid/dead tokens — mark unpriceable, don't crash), sum
   to a real total in SOL + USD. Cache briefly; never fabricate a price.
2. **PnL attribution** — reconcile `agent_custody_events` + positions into realized vs unrealized
   PnL, attributed by source: discretionary, each sniper strategy, signal feed (task 06 of
   next-gen), swarm, MM. Cost-basis per holding (FIFO lots) for accurate realized PnL.
3. **Risk metrics** — live exposure (% of net worth at risk), concentration (largest position
   share + a Herfindahl-style score), max drawdown, realized volatility, and correlation of the
   portfolio's moves to the broad pump.fun tape (from intel/feed aggregates). Surface plain-language
   risk flags ("78% concentrated in one illiquid position").
4. **API + UI** — `/api/agents/:id/portfolio` (holdings, valuation, attribution, risk) + SSE for
   live updates. Build a **Portfolio Command** surface in the wallet hub: net-worth header with
   live sparkline, holdings table (value, cost basis, unrealized PnL, liquidity warning), an
   attribution breakdown (what's making/losing money), a risk panel, and one-click jump to
   trade/exit any holding. All states designed (incl. a helpful empty state for a fresh wallet);
   accessible; responsive.

## Constraints

- Every value is real and live; unpriceable/illiquid holdings are honestly flagged, never guessed.
- Read-only analytics + jump-to-action; all actual trades go through existing guarded paths.
- Performance: value holdings concurrently, cache, virtualize long tables. $THREE-only rule.

## Success criteria

- Portfolio values all real holdings live in SOL + USD with cost basis and realized/unrealized PnL,
  attributed by source, with live risk metrics and honest illiquidity flags.
- Portfolio Command UI renders all states, updates live, is responsive + accessible.
- Production-ready bar met; chain extended. Build/typecheck/test clean. Changelog (tags: feature,
  improvement). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/03-portfolio-intelligence-command.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
