# Task — Counterfactual Replay ("held vs sold" honesty engine)

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

A trader's biggest leak is invisible: selling winners too early and bag-holding losers too long.
Build a **Counterfactual Replay** that, for every *closed* position, computes what the position
would be worth *now* if it had been held — surfacing "you left X SOL on the table" on premature
exits and "you saved Y SOL by cutting" on good ones. Aggregate it into an honest **timing-edge**
score: did the agent's exits, in hindsight, beat or trail simply holding? A mirror that turns the
agent's own history into a coaching signal — no competitor confronts traders with this truth.

## Context (real, verified)

- Closed positions with entry/exit + on-chain proof: `agent_sniper_positions` via
  `api/_lib/trader-stats.js` (`fetchTraderPositions`, `shapeClosed`; `mint`, `exit_quote_lamports`,
  `base_amount`, `realized_pnl_lamports`, `closed_at`, `buy_sig`/`sell_sig`).
- Live "price now" per mint: `api/_lib/balances.js#solanaMintUsdPrice` + curve quoting
  `api/_lib/pump.js` (`getSellSolAmountFromTokenAmount`) for what the held base amount would fetch today.
- SOL/USD: `api/_lib/pumpfun-ws-feed.js#getSolPrice`. Existing metric engine to extend for the
  timing-edge aggregate: `computeTraderMetrics`.

## Goal

A counterfactual engine (`api/_lib/counterfactual.js`) + `/api/agents/:id/counterfactual` that, per
closed position, computes held-to-now value and the exit delta, plus a portfolio timing-edge score,
surfaced as a Replay panel in the wallet hub / trader profile.

## What to build

1. **Per-position replay** — for each closed position, value the original base amount at today's
   live sell quote, compute `held_now_sol` and `exit_delta_sol` (realized − held-now), tag each as
   `early_exit` / `well_timed` / `dodged_dump`. Gracefully handle dead mints (held-now = 0 → cutting
   was correct).
2. **Timing edge** — aggregate deltas into a 0–100 timing-edge score and plain-language verdict
   ("your exits beat holding by N SOL over M trades"), survivorship-honest (count the dodged dumps).
3. **API** — `/api/agents/:id/counterfactual?window=` returns per-position replays + the aggregate;
   cached; concurrent live re-quoting; honest unpriceable handling.
4. **UI** — a Replay panel: timing-edge header, a table of closed trades with realized vs held-now
   vs delta and a tag, sortable by "most left on the table". All states designed (empty for no
   closed trades); accessible; responsive.

## Constraints

- Every counterfactual uses a real live quote; dead/unpriceable mints handled honestly, never guessed.
- Read-only reflection; no trades initiated. Survivorship-honest aggregation.
- $THREE-only rule; runtime mints are trade data only.

## Success criteria

- For real closed positions, the replay shows accurate held-to-now value and exit deltas and an
  honest timing-edge score with plain-language verdict.
- Replay UI renders all states, accessible + responsive. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/counterfactual-replay.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
