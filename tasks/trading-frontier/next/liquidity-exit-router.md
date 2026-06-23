# Liquidity Exit Router (slippage-minimizing sell across curve + AMM)

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

Dumping a large bag in one click craters the price — and once a coin has graduated, half its
liquidity is on the curve and half on the AMM pool. The Exit Router takes ONE "sell X% of my
bag, best execution" intent and computes the slippage-minimizing plan: how many micro-slices,
what size each, which venue (bonding curve vs AMM), and what spacing — then executes them as a
real, guarded sequence. It's not TWAP (time-based, blind to depth); it's depth-aware routing
that reads live reserves and picks sizes where marginal price impact stays under a ceiling.

## Context (real, verified)

- Sell quotes + venues: `api/_lib/pump.js` (`quoteForSell`, `getAmmPoolState`),
  `workers/agent-sniper/amm-exit.js` (`quoteAmmSell`, `buildAmmSellInstructions`, `isGraduated`).
- Execution core: `executeAgentTrade` in `api/agents/agent-trade.js` (quote→firewall→guards→
  custody→sign), and the programmable-orders engine `api/_lib/orders.js` + `workers/agent-orders`.
- Price-impact breaker: `checkPriceImpact` in `api/_lib/agent-trade-guards.js`.
- Custody audit: `agent_custody_events`; per-fill receipts pattern: `order_fills`.

## Goal

A `POST /api/agents/:id/exit-router/plan` that returns a real, depth-derived sell plan (slices,
sizes, venues, expected total out vs naive one-shot), and an `execute` path that runs the plan
through the existing guarded sell pipeline, recording each slice. A wallet-hub surface to
configure (impact ceiling, max slices, urgency) and watch progress.

## What to build

1. **Planner** — sample `quoteForSell`/`quoteAmmSell` at increasing sizes to build the live
   marginal-impact curve, then solve for the slice schedule that keeps each slice's impact under
   the ceiling while minimizing total slippage; choose venue per slice (curve vs AMM).
2. **Executor** — run slices through `executeAgentTrade` (sell), honoring spend guards + the
   firewall, recording an `exit_router_fills` receipt per slice with realized out + impact.
3. **Comparison** — always show realized vs naive-one-shot SOL out so the saving is provable.
4. **UI** — an Exit Router panel in the wallet hub: bag size, impact ceiling, urgency slider,
   live plan preview, run + progress, all states designed.

## Constraints

Every slice real, firewall-checked, spend-guarded, audited. Honest on a quote/RPC gap (pause +
resume, never mis-size). Never exceed the daily budget or per-trade caps. $THREE-only; runtime
mints are data.

## Success criteria

A large sell routes into N real guarded slices across the right venues, beats the naive one-shot
on realized SOL out, and is fully audited. UI renders all states; chain extended.
Build/typecheck/test clean. Changelog (feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/liquidity-exit-router.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
