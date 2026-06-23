# Task — Agent Skill Reputation Leaderboard (multi-dimensional skill, not raw PnL)

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

Raw PnL crowns whoever got luckiest with the most capital. The existing sniper leaderboard ranks by
profit; the arena runs PvP tournaments. Neither measures *skill*. Build a **multi-dimensional agent
skill reputation**: rank agents on signal calibration (do their conviction calls actually hit?),
risk-adjusted return (Sharpe, max-drawdown), speed-to-cut-losses (how fast they exit losers), and
graduation-call accuracy (did the coins they bought pre-graduation actually graduate?). A composite,
transparent skill score that surfaces genuinely good traders to copy and gives every agent a credible
on-platform résumé — the foundation for copy-trading and the signal marketplace.

## Context (real, verified)

- Trader metrics: `api/_lib/trader-stats.js` (per-agent realized stats — the base to extend with
  risk-adjusted and behavioral dimensions).
- Trade-level data: `agent_sniper_positions` (entries/exits/holds to compute speed-to-cut-losses and
  drawdown).
- Outcome truth: `pump_coin_outcomes` (did a bought coin graduate / hit its ATH — the ground truth
  for graduation-call accuracy and conviction calibration).
- Existing ranking surface: `api/sniper/leaderboard.js` (the PnL leaderboard to add skill dimensions
  alongside, not replace).

## Goal

A skill-reputation engine that computes per-agent calibration, risk-adjusted return, loss-cutting
speed, and graduation-call accuracy, blends them into a transparent composite, and ranks agents by
skill alongside the existing PnL board.

## What to build

1. **Skill metrics** — extend `api/_lib/trader-stats.js` to compute Sharpe, max-drawdown,
   median-time-to-exit-losers, conviction calibration (predicted vs. realized via
   `pump_coin_outcomes`), and graduation-call hit rate.
2. **Composite + transparency** — a weighted skill score with each component visible and a per-agent
   breakdown explaining why the score is what it is (no opaque black box).
3. **Skill leaderboard API** — extend `api/sniper/leaderboard.js` with sortable skill dimensions and
   filters (timeframe, min sample size to avoid small-sample inflation).
4. **Profile résumé** — render the skill breakdown on agent profiles as a credible, shareable
   trading résumé, feeding copy-trade/signal-marketplace surfaces.
5. **UI** — a skill leaderboard with per-dimension sort, a radar/breakdown per agent, and
   sample-size confidence badges. All states designed; responsive; accessible.
6. **Anti-gaming** — minimum-sample gating + drawdown penalty so spray-and-pray and one-lucky-hit
   agents can't top the skill board.

## Constraints

- This is read/scoring only; any copy-trade or follow action it enables honors spend guards
  (`api/_lib/agent-trade-guards.js`), custody audit (`agent_custody_events`), and the firewall
  (`api/_lib/trade-firewall.js`) on buys.
- $THREE is the only promoted coin; mints in scored trade history are trade data only.
- No mocks, stubs, or fake stats — real trader-stats, positions, and outcomes only.

## Success criteria

- Reachable in the UI as a skill leaderboard + profile résumé; rankings reflect real, explainable
  multi-dimensional metrics over real trade history.
- Real `trader-stats` / `agent_sniper_positions` / `pump_coin_outcomes` data; any enabled trade
  action is guard-honored and custody-audited.
- All states designed; responsive at 320/768/1440; accessible (ARIA, keyboard, focus, contrast,
  reduced-motion).
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entry (tags:
  feature); completionist passes; chain extended with 10 new registered prompts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/agent-skill-reputation-leaderboard.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
