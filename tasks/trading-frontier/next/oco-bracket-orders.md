# OCO Bracket Orders (one-cancels-other: take-profit + stop on a position)

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

Every serious position wants a bracket: a take-profit above and a stop-loss below, where the
first to fill cancels the other. Today you'd arm two independent orders and risk both firing.
OCO makes them atomic — one fills, the sibling is cancelled in the same transaction-of-record —
so a position is protected on both sides without ever double-selling.

## Context (real, verified)

- Orders engine: `api/_lib/orders.js` (limit + stop sells), worker `workers/agent-orders/sweep.js`
  (the atomic `claimFire` → `firing` transition is the hook for sibling cancellation).
- Custody idempotency: per-fill `idempotency_key` in `executeAgentTrade`.
- UI: `src/agent-wallet-hub/tabs/orders.js`.

## Goal

An OCO is two linked orders (a limit-sell TP + a stop-sell SL) where filling/firing one cancels
the other atomically. Build the link model, the worker-side mutual-cancel on fire, and an OCO
create flow in the Orders tab.

## What to build

1. **Link model** — an `oco_link` (group) joining the two child orders.
2. **Atomic mutual-cancel** — when one child wins the `claimFire` race, cancel the sibling in the
   same DB step BEFORE executing, so the sibling can never also fire.
3. **Recovery** — a crash mid-fire leaves both consistent (the loser stays cancelled).
4. **UI** — one OCO form (TP target + SL stop + size), shown as a single bracketed row with both
   legs, all states designed.

## Constraints

Mutual exclusion is provable (no path fires both legs). Reuses guarded fills. Cancel instant.
$THREE-only; runtime mints are data.

## Success criteria

Arming an OCO creates two linked legs; the first to trigger fills and the other is provably
cancelled; never both. UI renders all states; chain extended. Build/test clean. Changelog
(feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/oco-bracket-orders.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
