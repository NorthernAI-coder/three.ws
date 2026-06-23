# Order Health Monitor (why-not-firing diagnostics + auto re-arm)

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

An order that silently never fires is worse than no order. The Health Monitor reads every active
order's real state and explains, per order, why it hasn't fired — trigger not met (and how far
off), wallet frozen, daily budget exhausted, kill switch on, firewall-halted, stale price feed,
or no live data — and offers the one-click fix (unfreeze, raise budget, re-arm). It also lets
you set auto-policies: re-arm an errored order, or auto-expire stale ones.

## Context (real, verified)

- Order state: `orders` (`status`, `last_error`, `last_eval_at`, `last_price`) + `order_fills`
  (`api/_lib/orders.js`, `workers/agent-orders`).
- Spend/freeze/kill state: `agent_trade-guards.js` (`getSpendLimits`, `getTradeLimits`);
  worker liveness: `bot_heartbeat` (the orders worker writes `worker='agent-orders'`).
- The Orders tab `src/agent-wallet-hub/tabs/orders.js` already shows `last_error`.

## Goal

A `GET /api/agents/:id/orders/health` that returns per-order + global diagnostics (reason codes +
the live numbers behind them + the worker's heartbeat age), and a Health panel with one-click
remediations + auto re-arm/expire policy toggles.

## What to build

1. **Diagnoser** — for each active order, classify why it hasn't fired from real state (distance
   to trigger, freeze, budget, kill, firewall, data gap, worker liveness).
2. **Remediations** — wire the existing fixes (unfreeze, adjust caps, re-arm/cancel) behind
   one-click actions, CSRF-gated.
3. **Auto-policies** — opt-in re-arm-on-error / auto-expire, enforced by the worker.
4. **UI** — a health dashboard with clear, actionable rows; all states designed.

## Constraints

Diagnostics from REAL state only — never guess. Remediations honor the same owner-gated, audited
paths. $THREE-only; runtime mints are data.

## Success criteria

Every stuck order shows a correct, real reason + a working one-click fix; worker liveness is
visible; auto-policies work. Chain extended. Build/test clean. Changelog (feature). Completionist
passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/order-health-monitor.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
