# Task — Gas-Fee Forecaster & Batcher (priority-fee prediction + small-order auto-batching)

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

On Solana, the difference between a snipe that lands and one that drops is the priority fee — and
right now that fee is a static guess. Build a **priority-fee forecaster + order batcher**: forecast
near-term Solana priority fees in real time from recent on-chain fee data, recommend the fee that
maximizes land-rate per lamport for the current congestion, and auto-batch eligible small orders into
fewer transactions so the user pays one fee instead of five. It directly raises fill rate on snipes
and cuts the fee drag that quietly eats small-position PnL — execution quality nobody on a launchpad
optimizes for the user.

## Context (real, verified)

- RPC + fee data: `api/_lib/solana/connection.js` (RPC failover + `getRecentPrioritizationFees` for
  the live fee distribution the forecaster trains on).
- Protected submit path: `api/_lib/execution-engine.js` (`submitProtected`, Jito) — where the
  forecasted fee is applied and where batched bundles land.
- Sniper executor: `workers/agent-sniper/executor.js` (the existing execution loop whose fee logic
  the forecaster plugs into).

## Goal

A fee-forecasting service that outputs a recommended priority fee + congestion read, and a batcher
that coalesces eligible small orders into fewer protected submissions — both wired into the live
execution path.

## What to build

1. **Fee forecaster** — sample `getRecentPrioritizationFees` over a rolling window via
   `api/_lib/solana/connection.js`, model the near-term fee distribution + congestion regime, and
   output a recommended fee with a land-rate estimate.
2. **Adaptive fee application** — feed the recommended fee into `submitProtected` /
   `workers/agent-sniper/executor.js`, with escalation on drop (re-submit at a higher percentile)
   bounded by a user max-fee cap.
3. **Small-order batcher** — detect eligible same-block, same-side orders and coalesce them into a
   single protected submission (or Jito bundle), splitting fills back to the right positions.
4. **Fee API + telemetry** — `api/agents/fee-forecast` returning the live recommendation; record
   realized land-rate vs. forecast so the model is auditable and improves.
5. **UI** — a fee/congestion widget in the trade + snipe surfaces: live recommended fee, congestion
   gauge, expected land-rate, batch indicator, and a max-fee control. All states designed;
   responsive; accessible.
6. **Honest fallback** — if fee data is stale/unavailable, fall back to a safe conservative fee and
   say so; never silently under-fee a snipe into failure.

## Constraints

- All submissions honor spend guards (`api/_lib/agent-trade-guards.js`), write custody audit
  (`agent_custody_events`), and clear the firewall (`api/_lib/trade-firewall.js`) on buys; batching
  never merges trades across the guard/custody boundary incorrectly.
- $THREE is the only promoted coin; batched runtime mints are trade data only.
- No mocks, stubs, or fake fee data — real `getRecentPrioritizationFees` and real submits only.

## Success criteria

- Reachable in the UI from trade + snipe surfaces; a real snipe uses the forecasted fee and small
  orders batch into fewer real transactions, with realized land-rate shown.
- Real RPC fee data via `api/_lib/solana/connection.js`; real `submitProtected` execution;
  guard-honored, custody-audited.
- All states designed; responsive at 320/768/1440; accessible (ARIA, keyboard, focus, contrast,
  reduced-motion).
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entry (tags:
  feature); completionist passes; chain extended with 10 new registered prompts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/gas-fee-forecaster-batcher.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
