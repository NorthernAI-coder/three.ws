# Task — Dynamic Position Sizing (regime + conviction-weighted automatic sizing)

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

Right now the size of a trade is whatever the user types. That is the single biggest preventable
source of blowups — over-sizing low-conviction, high-volatility coins and under-sizing the rare
strong setups. Build a **dynamic position-sizing engine**: given the agent's risk regime, the
oracle's conviction for the coin, and the coin's historical volatility, compute a recommended trade
size using a volatility-target / fractional-Kelly model, clamped by the spend guards. Expose it as a
single shared service the copilot, the orders engine, and the snipe tab all call, so every entry
across the platform is sized by the same disciplined logic instead of a guess.

## Context (real, verified)

- Conviction signal: the `oracle_conviction` table (per-coin conviction the oracle already produces).
- Historical risk inputs: `pump_coin_outcomes` (realized `ath_multiple`, volatility/decay history
  used to estimate per-coin risk and edge).
- Live exposure: `agent_sniper_positions` (current holdings to compute incremental risk and
  portfolio-level caps).
- Hard ceiling: `api/_lib/agent-trade-guards.js` (per-trade and cumulative spend caps the sizing
  output must never exceed).

## Goal

A `sizePosition` service that returns a recommended notional + the reasoning (regime, conviction,
volatility estimate, fraction of bankroll), always clamped to the spend guards, callable from every
entry surface on the platform.

## What to build

1. **Sizing model** — volatility-target sizing with a fractional-Kelly edge term derived from
   `oracle_conviction` and the realized win/return distribution in `pump_coin_outcomes`; configurable
   risk regime (conservative / balanced / aggressive) that scales the target volatility.
2. **Bankroll + exposure awareness** — read current `agent_sniper_positions` and wallet balance so
   recommendations account for existing exposure and never recommend beyond available capital.
3. **Guard clamp** — the recommended size is always min'd against `api/_lib/agent-trade-guards.js`
   caps; the UI shows when the model wanted more than the guard allows.
4. **Shared service + API** — `api/agents/size-position` returning notional + transparent rationale;
   wire it as the default size source in the copilot (task 01), orders engine (task 02), and snipe tab.
5. **UI** — an inline sizing chip on every entry: recommended size, a one-line "why", a slider to
   override within guards, and the regime selector. All states designed; responsive; accessible.
6. **Backtest the sizing** — show, on historical `pump_coin_outcomes`, how the model's sizing would
   have shaped drawdown vs. flat sizing, so the user trusts it.

## Constraints

- Recommendations honor spend guards (`api/_lib/agent-trade-guards.js`); every executed trade still
  writes custody audit (`agent_custody_events`) and clears the firewall (`api/_lib/trade-firewall.js`)
  when buying.
- $THREE is the only promoted coin; runtime mints in sizing inputs are trade data only.
- No mocks, stubs, or fake data — real conviction, outcomes, and position data only.

## Success criteria

- Reachable in the UI on every entry surface (copilot, orders, snipe) with a live, explainable size.
- Real `oracle_conviction` / `pump_coin_outcomes` / `agent_sniper_positions` data; guard-clamped;
  custody-audited and firewall-cleared on execution.
- All states designed; responsive at 320/768/1440; accessible (ARIA, keyboard, focus, contrast,
  reduced-motion).
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entry (tags:
  feature); completionist passes; chain extended with 10 new registered prompts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/dynamic-position-sizing.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
