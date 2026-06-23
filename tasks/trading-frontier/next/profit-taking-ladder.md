# Profit-Taking Ladder (scale-out: staged take-profit rungs)

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

Pros never sell a winner all at once — they scale out: 25% at 2×, 25% at 5×, the rest at 10×.
The Ladder Builder turns that discipline into one action: describe the rungs (target + fraction)
and it arms a coordinated set of real limit-sell orders that fire as price climbs, each selling
its slice of the live holding. A linked OCO-style stop protects the downside. It sits ON TOP of
the programmable-orders engine — composition, not a new execution path.

## Context (real, verified)

- Orders engine: `api/_lib/orders.js` (limit sells, `sell_pct`, `trigger_metric`), the worker
  `workers/agent-orders`, and the Orders wallet-hub tab `src/agent-wallet-hub/tabs/orders.js`.
- Live holding sizing: `getHolding` in `workers/agent-orders/market.js`.
- Execution + guards: `executeAgentTrade` (`api/agents/agent-trade.js`), `agent-trade-guards.js`.

## Goal

A ladder is a group of linked limit-sell orders created atomically and managed as a unit (arm,
pause, cancel all rungs). A `POST /api/agents/:id/orders/ladder` endpoint + a Ladder builder in
the Orders tab with a live preview of each rung's expected SOL out.

## What to build

1. **Group model** — an `order_groups` row linking the child orders; cancel/pause cascades.
2. **Builder** — validate rungs (rising targets, fractions summing ≤ 100%), create child limit
   sells with `sell_pct` per rung, all referencing the group.
3. **Coordination** — fractions are of the ORIGINAL bag; the worker sizes each fill against the
   live holding so partial fills don't compound. Optional linked stop (OCO).
4. **UI** — visual ladder editor (drag rungs), preview, group controls, all states.

## Constraints

Reuses the orders engine's real guarded fills — no new fund-moving path. Fractions can't oversell.
Cancel of the group is instant. $THREE-only; runtime mints are data.

## Success criteria

A ladder arms N real linked limit sells; rungs fire in order as price rises; group cancel is
instant; partial fills size correctly. UI renders all states; chain extended. Build/test clean.
Changelog (feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/profit-taking-ladder.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
