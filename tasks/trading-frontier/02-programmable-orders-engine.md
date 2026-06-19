# Task 02 — Programmable Orders Engine (limit / stop / DCA / TWAP / conditional triggers)

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

Pump.fun has no native order types — you watch a chart and click frantically. We give every agent
wallet a real **programmable order layer**: limit buys/sells, stop-loss + trailing stops that
survive across sessions, **DCA** (recurring buys), **TWAP** (slice a large order over time to cut
impact), and **conditional triggers** ("buy when smart-money score > X", "sell if dev dumps",
"buy on graduation"). A worker watches the market and fires from the agent wallet automatically.
Set-and-forget institutional order tooling for memecoins.

## Context (real, verified)

- Execution + quotes: `api/agents/agent-trade.js`, `api/_lib/pump.js` (curve + AMM quotes),
  `api/_lib/pump-swap-ix.js`; spend guards `api/_lib/agent-trade-guards.js`; firewall
  `tasks/next-gen-trading/01`; MEV engine `tasks/next-gen-trading/02`.
- Worker loop + position lifecycle precedent: `workers/agent-sniper/index.js`,
  `workers/agent-sniper/positions.js` (`runPositionSweep`, `decideExit`), per-agent lock pattern.
- Trigger inputs: live price re-quote (curve/AMM), intel (`pump_coin_intel`), smart-money
  (`tasks/next-gen-trading/03`), graduation events (`api/_lib/pumpfun-ws-feed.js`).
- Custody audit: `agent_custody_events`.

## Goal

An `orders` model + a worker that evaluates triggers against live market data and executes
firewall+spend-guarded fills from the agent wallet, with a full order-management UI.

## What to build

1. **Order model** — `orders` table (id, agent_id, user_id, network, mint, type
   [limit|stop|trailing|dca|twap|conditional], side, size, limit_price/stop_price/trail_pct,
   schedule (for dca/twap: interval, slices, total), condition jsonb (for conditional triggers),
   status [active|partial|filled|cancelled|expired], filled_amount, expires_at, created_at) +
   `order_fills` audit. Dated migration.
2. **Evaluation worker** — extend `workers/agent-sniper/` (or sibling) to sweep active orders on a
   cadence: re-quote each order's mint, evaluate its trigger/schedule, and on fire, execute through
   the firewall + MEV engine + spend guards, recording fills. DCA/TWAP advance their schedule and
   partial-fill; trailing stops track the high-water mark like `decideExit`. Idempotent; per-agent
   serialized; honest on RPC failure (retry, don't double-fire).
3. **Condition language** — a safe, validated condition spec (no arbitrary code) for triggers over
   real signals: price thresholds, smart-money score, dev-dump flag, graduation, market-cap bands.
4. **API + UI** — `/api/orders` (CRUD, cancel), `/api/orders/:id` (state + fills), SSE for live
   order status. Build an **Orders** surface in the wallet hub: create order (per-type forms with
   sane presets + a live preview of the fill condition + firewall verdict), an open-orders table
   with cancel, and a fills history. All states designed; accessible; responsive.

## Constraints

- Every fill is real, firewall-gated, spend-guarded, audited; kill switch halts all orders; cancel
  is instant. Orders can never exceed daily budget or per-trade caps.
- Triggers evaluate against **real live data** only — never simulated prices. Honest on data gaps.
- No arbitrary-code conditions; validated spec only. $THREE-only rule; runtime mints are data.

## Success criteria

- Each order type (limit/stop/trailing/DCA/TWAP/conditional) fires correctly from real market data
  through the firewall + MEV engine, audited, with partials handled.
- Orders UI renders all states; cancel + kill instant. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/02-programmable-orders-engine.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
