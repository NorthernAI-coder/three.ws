# Task — Exit-Liquidity Radar (true liquidatable net worth)

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

Portfolio valuations everywhere quote *paper* value — token balance × last price. For a thin
memecoin that lie is fatal: a "10 SOL position" might net 2 SOL once you actually sell into the
curve. Build an **Exit-Liquidity Radar**: for each holding, simulate the real sell against the live
bonding-curve / AMM reserves to compute the *liquidatable* value at multiple slippage tolerances
(1% / 5% / full-exit), the max size sellable before each threshold, and a depth score. Surface a
portfolio-wide **paper value vs liquidatable value** gap. This is the honest number no competitor
shows.

## Context (real, verified)

- Curve/AMM reserves + quoting: `api/_lib/pump.js` (`getAmmPoolState` → `baseReserve`/`quoteReserve`;
  `getPumpSdkV2` → `getSellSolAmountFromTokenAmount(tokenAmount, bonding_curve)`). Pre- vs
  post-graduation handled there.
- Holdings enumeration: `api/agents/solana-wallet.js#handleHoldings` (SOL + every SPL with balance);
  per-mint mark price `api/_lib/balances.js#solanaMintUsdPrice`.
- SOL/USD: `api/_lib/pumpfun-ws-feed.js#getSolPrice`, `api/_lib/agent-trade-guards.js#lamportsToUsd`.

## Goal

A depth-aware valuation service (`api/_lib/exit-liquidity.js`) + `/api/agents/:id/liquidity` that,
per holding, returns sell-simulated proceeds at slippage tiers and a portfolio paper-vs-real gap,
surfaced as a Liquidity panel in the wallet hub.

## What to build

1. **Sell simulation** — for each holding, quote real SOL-out for graduated sizes (5%/25%/50%/100%
   of the balance) against live reserves; derive price-impact %, max size under 1%/5% impact, and a
   0–100 depth score. Gracefully mark unpriceable/dead pools as illiquid (0 liquidatable) — never crash.
2. **Paper vs real** — sum mark-price value vs simulated-liquidation value across the portfolio;
   surface the gap in SOL + USD and a per-holding "haircut %".
3. **API** — `/api/agents/:id/liquidity?network=` with brief caching (pools move fast); concurrent
   per-holding simulation; honest illiquid flags.
4. **UI** — a Liquidity panel: portfolio paper-vs-liquidatable header, a holdings table with depth
   score + haircut + max-1%-exit size, and a one-click jump to sell the liquid portion through the
   existing guarded trade path. All states designed; accessible; responsive.

## Constraints

- Every number is a real on-chain simulation; illiquid holdings are flagged, never guessed.
- Read-only analytics + jump-to-action; trades go through existing guarded paths only.
- $THREE-only rule; runtime mints are trade data only.

## Success criteria

- For real holdings, the radar shows true liquidatable value at slippage tiers and an honest paper-
  vs-real gap, with illiquid pools flagged.
- Liquidity UI renders all states, accessible + responsive. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/exit-liquidity-radar.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
