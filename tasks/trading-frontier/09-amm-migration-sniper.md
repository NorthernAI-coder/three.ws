# Task 09 — AMM Migration & New-Pool Sniper

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

The bonding-curve → AMM **graduation** is one of the most reliably tradeable moments in a coin's
life: liquidity migrates, a fresh pool opens, and price often moves hard — but most snipers only
watch *new mints*, not *migrations*. Build a **migration sniper**: detect the exact graduation /
new-pool-open event in real time and snipe the AMM side on signal (only for coins our intel +
graduation predictor + smart-money flag as strong), plus detect fresh AMM pools / LP-adds for
graduated coins. A second, higher-quality snipe surface that the curve-only crowd misses.

## Context (real, verified)

- Graduation events already arrive on the feed: `api/_lib/pumpfun-ws-feed.js` (`enrichGrad`,
  graduation callback). AMM plumbing: `api/_lib/pump.js` (`getAmmPoolState`, `getPumpSwapSdk`),
  `workers/agent-sniper/amm-exit.js` (`isGraduated`, `quoteAmmSell`, `buildAmmSellInstructions`) —
  extend to two-sided AMM trading, not just exit.
- Snipe loop + scoring to extend: `workers/agent-sniper/index.js`, `scorer.js`, executor +
  positions; the existing `intel_confirmed` trigger pattern is the closest precedent.
- Quality gates: intel (`pump_coin_intel`, `pump_coin_outcomes`), graduation predictor (epic 04),
  smart-money (`tasks/next-gen-trading/03`), firewall (`tasks/next-gen-trading/01`), MEV (`02`).

## Goal

A `trigger='amm_migration'` strategy + detection that snipes the graduation/new-pool moment on the
AMM with full gating, plus a live migration feed surface.

## What to build

1. **Migration detection** — subscribe to graduation events from the feed and confirm the new
   canonical AMM pool via `getAmmPoolState`; also detect fresh AMM pools / significant LP-adds for
   already-graduated coins (poll/scan). Emit a `migration_event { mint, pool, liquidity, ts }`,
   deduped like the existing watchers.
2. **AMM buy path** — extend the trade client / AMM module with a real **AMM buy** (PumpSwap SDK)
   to complement the existing AMM sell, with quote + slippage + price-impact. This unlocks both
   migration sniping and discretionary AMM buys platform-wide.
3. **Gated snipe** — for each `amm_migration` strategy, score the migration (intel + graduation
   probability from epic 04 + smart-money + creator reputation from epic 06), run the firewall, and
   buy via the MEV engine within budget — racing the migration. All spend guards + custody audit
   apply; positions tracked + managed by the existing lifecycle (stop/trailing/take/timeout) on the
   AMM side.
4. **Schema** — add `trigger='amm_migration'` + AMM-specific gates (`min_pool_liquidity_sol`,
   `min_graduation_prob`, `require_smart_money`) to `agent_sniper_strategies`; a `migration_events`
   table. Dated migration.
5. **API + UI** — `GET /api/sniper/migrations?network=…` + SSE live migration feed. Add a
   **Migrations** view (and a strategy preset in the snipe tab) showing live graduations/new pools
   with their quality scores and whether the user's agent fired. All states designed; accessible;
   responsive.

## Constraints

- Detection from **real graduation/pool events** + real pool reads only — never fabricate a
  migration. The firewall still gates every AMM buy (no buying an AMM honeypot to be first).
- AMM buys are real PumpSwap txs, spend-guarded + audited; kill switch halts; respect price-impact.
- $THREE-only rule; mints/pools are runtime data, never promotions.

## Success criteria

- Real graduation + new-pool events are detected; a real AMM buy path exists and works.
- An `amm_migration` strategy snipes the migration through the firewall + MEV engine, gated by
  intel/graduation-prob/smart-money, audited, with positions managed on the AMM side.
- Migrations UI + SSE render all states. Production-ready bar met; chain extended. Build/typecheck/
  test clean. Changelog (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/09-amm-migration-sniper.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
