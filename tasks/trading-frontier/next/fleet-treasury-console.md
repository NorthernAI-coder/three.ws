# Task — Fleet Treasury Console (cross-agent roll-up for one owner)

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

A power user runs *many* agents, each with its own custodial Solana wallet, positions, and snipers.
Today they must open each agent's wallet hub one at a time — there is no portfolio of portfolios.
Build a **Fleet Treasury Console**: one owner-scoped dashboard that rolls up net worth, PnL, open
exposure, and risk across **every agent the user owns**, ranks the agents by contribution, surfaces
the fleet's largest concentrations and worst drawdowns, and lets the owner drill into any agent. A
fund-manager cockpit for an army of trading agents — unique to three.ws's multi-agent model.

## Context (real, verified)

- Ownership: `agent_identities` (`user_id`, `meta.solana_address`); auth via `api/_lib/auth.js`
  (`getSessionUser`, `authenticateBearer`). The user's agents = `WHERE user_id = $1 AND deleted_at IS NULL`.
- Per-agent valuation + PnL primitives to fan out over: `api/_lib/balances.js` (`getBalances`,
  `walletUsdTotal`), `api/_lib/trader-stats.js` (`computeTraderMetrics`, `fetchTraderPositions`), and
  the portfolio service from trading-frontier 03 (`api/_lib/portfolio.js`) if present.
- Hub mount pattern + design tokens: `src/agent-wallet-hub/` (registry, tabs, util); user agent list
  surfaces already fetch from `/api/agents`.

## Goal

A fleet aggregation service (`api/_lib/fleet-treasury.js`) + `/api/me/fleet` endpoint that values and
ranks all of a user's agents, plus a Fleet Console page that visualizes the roll-up and drills into
any agent's wallet hub.

## What to build

1. **Fleet aggregation** — for the authenticated owner, enumerate owned agents with wallets, value
   each concurrently (bounded concurrency, cached), and sum to fleet net worth (SOL + USD), total
   realized/unrealized PnL, and total open exposure. Degrade per-agent failures honestly (mark, skip,
   never fail the whole roll-up).
2. **Fleet risk** — fleet-level concentration (which agent / which mint dominates), aggregate
   drawdown, and a ranked contribution table (who's making/losing the most).
3. **API** — `/api/me/fleet` owner-only, paginated for large fleets, with a lightweight summary mode
   for the nav badge.
4. **UI** — a Fleet Console page (linked from the user dashboard / agent list): net-worth header,
   a sortable agent table (value, PnL, exposure, risk flag), fleet concentration view, and a click-
   through to each agent's wallet hub. All states designed (empty for a user with one/zero funded
   agents); accessible; responsive.

## Constraints

- Strictly owner-scoped (never expose another user's fleet); real on-chain + ledger data only.
- Read-only roll-up + drill-through; no trades initiated at the fleet layer.
- Performance: bounded-concurrency valuation, caching, virtualized tables. $THREE-only rule.

## Success criteria

- An owner sees a correct, live roll-up of net worth / PnL / exposure / risk across all their agents,
  ranked by contribution, drilling into any agent.
- Fleet Console renders all states, accessible + responsive. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/fleet-treasury-console.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
