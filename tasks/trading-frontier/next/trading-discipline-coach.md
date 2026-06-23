# Task — Trading-Discipline Coach (behavioral pattern engine)

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

Portfolio analytics (trading-frontier 03) tells you *what* your numbers are. It never tells you
*what you keep doing wrong*. Build a **Trading-Discipline Coach**: a behavioral engine that mines
the agent's own trade history for the classic destructive patterns — the disposition effect (cutting
winners fast, holding losers long), revenge-trading after a loss, position-size escalation on tilt,
overtrading/churn, and chasing green candles — quantifies each as a measurable habit, and issues
specific, data-backed nudges ("your average winner is held 18s, your average loser 4m — you're
selling winners 13× faster"). A trading psychologist built from on-chain truth, not vibes.

## Context (real, verified)

- Trade history with hold windows + P&L: `agent_sniper_positions` via `api/_lib/trader-stats.js`
  (`fetchTraderPositions`; `opened_at`/`closed_at`, `realized_pnl_pct`, `entry_quote_lamports`,
  `exit_reason`). The existing `computeTraderMetrics` already derives win/loss hold times, churn,
  avg win/loss % — extend it; do not duplicate it.
- Inter-trade timing (revenge/tilt) from ordering by `opened_at` and the prior trade's outcome;
  discretionary fills via `api/agents/solana-trade.js`.

## Goal

A behavioral engine (`api/_lib/discipline-coach.js`) + `/api/agents/:id/discipline` that scores
named habits from real history and emits prioritized, evidence-cited nudges, surfaced as a Coach
panel in the wallet hub / trader profile.

## What to build

1. **Pattern detectors** — pure, test-pinned detectors over position rows: disposition-effect ratio
   (winner-hold vs loser-hold), revenge-trade rate (size/frequency spike right after a loss),
   size-escalation-on-tilt, overtrading/churn, and chase rate. Each yields a measured value + a
   severity.
2. **Nudges** — translate detector outputs into ranked, plain-language, evidence-backed
   recommendations with the exact numbers that triggered them; survivorship-honest, never preachy.
3. **API** — `/api/agents/:id/discipline?window=` returns the habit scores + ranked nudges; cached;
   degrades honestly when sample size is too small to judge (says so).
4. **UI** — a Coach panel: a discipline score header, habit cards (each with its measured metric +
   trend), and a prioritized nudge list. All states designed (empty/low-confidence for a fresh
   wallet); accessible; responsive.

## Constraints

- Every nudge is backed by a real computed number from the agent's history — no generic advice.
- Read-only reflection; no trades initiated. Confidence-gated like the existing score model.
- $THREE-only rule; runtime mints are trade data only.

## Success criteria

- The coach detects real behavioral patterns from history and emits specific, number-backed nudges,
  with honest low-confidence handling for small samples.
- Coach UI renders all states, accessible + responsive. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/trading-discipline-coach.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
