# Task — Liquidity Aggregation Router (best-path execution across curve, PumpSwap, Jupiter)

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

Today a buy executes on exactly one venue: the pump.fun bonding curve for pre-graduation coins, or
the canonical AMM for graduated ones. That leaves money on the table — a graduated coin can be
cheaper on Jupiter's aggregated routes than on its native PumpSwap pool, and a large order is often
better split across venues than slammed into one. Build a **smart order router**: quote the same
trade simultaneously across the bonding curve, the PumpSwap AMM, and Jupiter, compare effective
price after price-impact and fees, and execute the best single path — or a slippage-minimized split
across two venues — through the existing protected submit pipeline. One buy/sell button, best
execution underneath.

## Context (real, verified)

- Bonding-curve + AMM pool state: `api/_lib/pump.js` (`getAmmPoolState` reads the migrated PumpSwap
  pool reserves; bonding-curve reserves for pre-graduation pricing).
- Quote primitives: `api/_lib/solana/sdk-bridge.js` (`getBuyQuote` / `getSellQuote`) and
  `api/agents/solana-trade.js` (`quoteTrade`) — the single-venue quote path to generalize.
- Protected execution: `api/_lib/execution-engine.js` (`submitProtected`) — the existing
  Jito/priority-fee submit path every route must funnel through; never bypass it.
- Spend + custody enforcement: `api/_lib/agent-trade-guards.js`, `agent_custody_events`.

## Goal

A venue-agnostic router that returns a ranked set of execution plans (single-venue or split) with
real post-impact effective price for each, and executes the chosen plan atomically through
`submitProtected`, audited and guarded exactly like a single-venue trade.

## What to build

1. **Multi-venue quote fan-out** — given (mint, side, size), quote the curve, PumpSwap (via
   `getAmmPoolState`), and Jupiter concurrently; normalize each to tokens-out / SOL-out, price
   impact, and total fee, surfacing which venues are eligible (e.g. curve only pre-graduation).
2. **Best-path + split solver** — rank single-venue plans by effective price; compute whether a
   two-venue split lowers total impact for large orders, and by how much; pick the optimum within a
   user slippage ceiling.
3. **Protected execution** — build the route's transaction(s) and submit through `submitProtected`,
   honoring spend guards and writing `agent_custody_events`; on partial failure of a split, never
   leave the user double-spent — settle or revert cleanly with an honest result.
4. **Router API** — `api/agents/router-quote` + `api/agents/router-execute` returning the ranked
   plans and an executed-route receipt (per-leg fills, realized price, Solscan links).
5. **UI** — a route-preview card in the trade panel: each venue's quote, the chosen path
   highlighted with the savings vs. single-venue, split breakdown, slippage control, and a
   post-trade receipt. All states designed; responsive; accessible.
6. **Honest degradation** — if Jupiter or a pool is unreachable, route over the venues that are up
   and say so; never fabricate a quote.

## Constraints

- Every buy honors spend guards (`api/_lib/agent-trade-guards.js`), writes custody audit events
  (`agent_custody_events`), and clears the firewall (`api/_lib/trade-firewall.js`) before funds move.
- All execution funnels through `submitProtected` — no venue gets a bypass path.
- $THREE is the only promoted coin; routed runtime mints are trade data only, never recommended.
- No mocks, stubs, or fake quotes — real curve/AMM/Jupiter data only, with honest failure handling.

## Success criteria

- Reachable in the UI from the trade panel; a real trade routes to (and executes on) the genuinely
  best venue or split, with the saving shown vs. single-venue.
- Real curve/PumpSwap/Jupiter quotes and on-chain execution; spend-guarded, firewall-cleared,
  custody-audited.
- All states (loading/empty/error/populated/overflow) designed; responsive at 320/768/1440;
  accessible (ARIA, keyboard, focus, contrast, reduced-motion).
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entry (tags:
  feature); completionist passes; chain extended with 10 new registered prompts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/liquidity-aggregation-router.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
