# Volatility-Adaptive Stops (ATR-style stop sizing from live price history)

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

A fixed 20% stop is wrong for both a sleepy coin and a 10×-a-minute rocket. This computes each
coin's realized volatility from the platform's own price-point history and recommends (or
auto-sets) a trailing/stop distance scaled to that volatility — a memecoin ATR. Tight stops on
calm coins, room to breathe on volatile ones, all from real data.

## Context (real, verified)

- Price time series: `pump_agent_price_points` (`sol_per_token`, `market_cap_lamports`, `source`),
  written by `api/cron/pump-agent-stats.js`; live stats `pump_agent_stats`.
- Stops/trailing live in `api/_lib/orders.js` (`trail_pct`, `stop_price`) + `workers/agent-orders`.
- Orders tab `src/agent-wallet-hub/tabs/orders.js` is where the recommendation surfaces.

## Goal

A volatility estimator over `pump_agent_price_points` exposed as `GET /api/agents/:id/volatility?
mint=…`, and an "adaptive stop" toggle on trailing/stop orders that sizes the distance from live
volatility (with the chosen number always shown before arming).

## What to build

1. **Estimator** — realized volatility / ATR-style measure from the recent price-point window;
   honest when too few points exist (no fabricated stop).
2. **Recommendation** — map volatility → suggested trail/stop %, with a transparent explanation.
3. **Orders integration** — an opt-in adaptive mode that fills `trail_pct`/`stop_price` from the
   estimate at create time (and optionally re-evaluates), never silently.
4. **UI** — show the coin's volatility + the suggested distance in the order builder; all states.

## Constraints

Real history only; degrade clearly when data is thin. The user always sees + confirms the chosen
stop. Fills stay guarded. $THREE-only; runtime mints are data.

## Success criteria

Stop/trail distances are sized from real per-coin volatility, shown before arming, and fire
correctly through the orders engine. Chain extended. Build/test clean. Changelog (feature).
Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/volatility-adaptive-stops.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
