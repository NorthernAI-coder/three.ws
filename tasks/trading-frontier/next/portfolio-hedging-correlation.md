# Task — Portfolio Hedging & Correlation (real-time correlation matrix + auto-hedge caps)

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

A memecoin portfolio that looks diversified across ten tickers can really be one bet — ten dog coins
that all dump together. Nobody on a launchpad shows you that. Build a **real-time correlation +
hedging engine**: compute a live cross-position price-correlation matrix over the agent's holdings,
cluster positions by category/narrative, expose the true concentration behind the apparent spread,
and recommend hedges — trim the most-correlated cluster, or set correlation-aware max-exposure caps
so a single narrative can't quietly become 80% of the book. Risk management memecoin traders have
never had.

## Context (real, verified)

- Holdings: `agent_sniper_positions` and `api/agents/solana/holdings` (`[action].js` / `_handlers.js`)
  for the current position set and balances.
- Narrative grouping: `pump_coin_intel` (category/tags per coin) to cluster correlated positions by
  theme, not just by realized price co-movement.
- Realized stats for the correlation series: `api/_lib/trader-stats.js` (per-position price/PnL
  history the matrix is computed over).

## Goal

A correlation-and-hedging surface that shows the agent's true diversification, recommends concrete
hedge/trim actions, and enforces correlation-aware exposure caps across the book.

## What to build

1. **Live correlation matrix** — compute rolling pairwise price correlation across current
   `agent_sniper_positions` using the series from `api/_lib/trader-stats.js`; surface the dominant
   risk cluster and an effective-number-of-bets concentration metric.
2. **Narrative clustering** — group positions by `pump_coin_intel` category/tags so the user sees
   "you hold 6 coins but 2 themes" with the dollar weight per cluster.
3. **Hedge recommendations** — suggest the trim that most reduces portfolio variance, sized by the
   dynamic-sizing service if present, and offer a one-tap protected sell to apply it.
4. **Correlation-aware caps** — let the user set a max-exposure-per-cluster cap; warn (and optionally
   block, via the existing guard path) entries that would breach the cap on a correlated position.
5. **UI** — a portfolio risk panel: the correlation heatmap, cluster weights, concentration gauge,
   recommended hedges, and cap controls. All states designed; responsive; accessible.
6. **Cross-link** — wire the concentration metric into the portfolio dashboard (task 03) so risk is
   visible everywhere, not siloed.

## Constraints

- Hedge/trim execution honors spend guards (`api/_lib/agent-trade-guards.js`), writes custody audit
  (`agent_custody_events`), and clears the firewall (`api/_lib/trade-firewall.js`) on any buy.
- $THREE is the only promoted coin; held runtime mints are trade data only.
- No mocks, stubs, or fake correlation data — real holdings + real price series only.

## Success criteria

- Reachable in the UI from the portfolio surface; the matrix and clusters reflect the agent's real
  holdings and a recommended hedge executes as a real, guarded trade.
- Real `agent_sniper_positions` / `pump_coin_intel` / `trader-stats` data; custody-audited and
  firewall-cleared on execution.
- All states designed; responsive at 320/768/1440; accessible (ARIA, keyboard, focus, contrast,
  reduced-motion).
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entry (tags:
  feature); completionist passes; chain extended with 10 new registered prompts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/portfolio-hedging-correlation.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
