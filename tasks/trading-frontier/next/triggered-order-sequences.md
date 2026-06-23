# Triggered Order Sequences (chain orders: when one fills, auto-arm the next)

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

A single order is a point; a real trade plan is a sequence. Triggered Order Sequences let you chain
orders by dependency: *when this one fills, automatically arm the next.* "Limit-buy 0.5 SOL at
$30k mcap → once filled, arm a take-profit ladder and a stop." "DCA in over 6 slices → when the
last slice fills, arm a trailing stop on the whole bag." It's the missing control-flow layer over
the programmable-orders engine — sequential dependency, distinct from OCO (mutual cancel) and the
profit-taking ladder (parallel rungs). Set the whole plan once; the worker advances it as fills land.

## Context (real, verified)

- Orders engine: `api/_lib/orders.js` (every order type + `order_fills`), the evaluation worker
  `workers/agent-orders/sweep.js` (fills are recorded + advanced here — the natural place to fire
  the next step), and the Orders wallet-hub tab `src/agent-wallet-hub/tabs/orders.js`.
- Execution + guards: `executeAgentTrade` (`api/agents/agent-trade.js`), `agent-trade-guards.js`.
- Custody audit: `agent_custody_events`. Distinct from OCO (`next/oco-bracket-orders.md`) and the
  ladder (`next/profit-taking-ladder.md`).

## Goal

A sequence model where child orders carry an `arm_on` dependency (parent order + event = `filled`),
a worker step that arms the next child when its parent fills, and a sequence builder + visual
dependency view in the Orders tab.

## What to build

1. **Sequence model** — `order_sequences` + a `depends_on`/`arm_on` link on child orders; children
   start in a `staged` (not-yet-armed) state and become `active` only when the parent event fires.
2. **Advancer** — in the fill path, when an order reaches `filled`, atomically arm its dependents
   (idempotent; a crash can't double-arm or skip). Cancelling/expiring a parent cascades to staged
   children.
3. **Composition** — support common templates (entry → bracket, DCA → trailing) as one-click chains
   built from real child orders.
4. **UI** — a sequence builder showing the dependency graph, per-step status, and group controls;
   all states designed (staged, active, fired, cancelled).

## Constraints

Reuses the orders engine's real, guarded, audited fills — no new fund-moving path. Staged orders
never fire before their trigger. Dependency advance is idempotent + crash-safe. Cancel of the
sequence is instant. $THREE-only; runtime mints are data.

## Success criteria

A multi-step sequence arms its first order, advances to the next when that fills, and cascades a
cancel — all through real guarded fills, fully audited. UI renders the graph + all states; chain
extended. Build/typecheck/test clean. Changelog (feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/triggered-order-sequences.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
