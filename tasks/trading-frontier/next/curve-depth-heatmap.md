# Bonding-Curve Depth & Slippage Heatmap (pre-trade impact visualizer)

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

Before any trade, the one number that matters is "how much will my size move the price?" — and
pump.fun shows nothing. The Depth Heatmap samples the live bonding curve / AMM pool across a
range of trade sizes and renders the real marginal-impact curve: spend 0.1 / 0.5 / 1 / 5 SOL,
see the price impact and tokens-out for each, and the size where impact crosses your comfort
threshold. It turns blind sizing into an informed decision.

## Context (real, verified)

- Quotes: `api/_lib/pump.js` (`quoteForBuy`/`quoteForSell`, `getAmmPoolState`),
  `workers/agent-sniper/amm-exit.js` (`quoteAmmSell`). Impact field: `priceImpactPct`.
- Charting precedent: `lightweight-charts` is already a dependency; trade UI in
  `src/agent-wallet-hub/tabs/trade.js`.

## Goal

A `GET /api/agents/:id/depth?mint=…` (or a public mint endpoint) returning a sampled
size→impact→out curve from live state, and a visual heatmap/curve in the Trade + Orders tabs
with an "optimal size for ≤X% impact" marker.

## What to build

1. **Sampler** — quote a configurable size ladder against live reserves (curve or AMM), returning
   impact + tokens-out + effective price per size; cache briefly per mint.
2. **Optimizer** — surface the largest size keeping impact under the user's ceiling.
3. **UI** — a real chart (lightweight-charts) of the depth curve, wired into the Trade size input
   and the Orders builder so picking a size shows its live impact. All states designed.
4. **Honesty** — graduated coins sample the AMM; a quote gap shows a clear empty/error state.

## Constraints

Read-only — no funds move. Real live quotes only, never interpolated/fake. Bounded sampling
(rate-limit the quote fan-out). $THREE-only; runtime mints are data.

## Success criteria

The heatmap renders a real size→impact curve for any mint, marks the optimal size, and feeds the
trade/order size inputs. UI renders all states; chain extended. Build/test clean. Changelog
(feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/curve-depth-heatmap.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
