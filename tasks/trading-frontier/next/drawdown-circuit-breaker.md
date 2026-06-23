# Task — Portfolio Drawdown Circuit Breaker (auto-freeze on the whole book)

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

The existing spend guards bound a *single trade*. None of them stop a bad day: an agent can lose
trade after trade and keep firing. Build a **Portfolio Drawdown Circuit Breaker**: an owner-set
rule that watches the wallet's net-worth (or realized-PnL) drawdown over a rolling window and, when
it crosses a threshold, automatically *freezes all trading* — discretionary, every sniper strategy,
copy/mirror, swarm — until the owner re-arms. A book-level kill switch that the agent itself
respects, wired into the guards every trade already passes through.

## Context (real, verified)

- Per-trade kill switch + spend policy live in `api/_lib/agent-trade-guards.js`
  (`checkKillSwitch`, `getTradeLimits`/`setTradeLimits`, `enforceSpendLimit`) and are read on every
  trade in `api/agents/agent-trade.js` and the sniper executor (`workers/agent-sniper/`).
- Drawdown + net worth to threshold against: `api/_lib/trader-stats.js` (`maxDrawdown`, realized PnL)
  and the portfolio service (trading-frontier 03, `api/_lib/portfolio.js`) for live net worth; window
  helpers `windowStartIso`. Sniper arming state: `agent_sniper_strategies`.

## Goal

A breaker service (`api/_lib/drawdown-breaker.js`) integrated into the shared guard path + a
`/api/agents/:id/breaker` config endpoint, so a crossed drawdown threshold sets a freeze that every
trade path (manual, sniper, mirror, swarm) honors until re-armed, with full audit + alert.

## What to build

1. **Breaker rule** — owner config: metric (net-worth vs realized-PnL drawdown), threshold %,
   rolling window, and action (freeze-all / freeze-buys-only). Stored on the agent policy alongside
   the existing trade limits.
2. **Enforcement** — extend the shared guard the trade/snipe paths already call so a tripped breaker
   blocks new entries (and optionally arms exits) for ALL strategies at once; tripping is recorded
   in `agent_custody_events` and emits an alert. Re-arm is an explicit owner action (CSRF-gated).
3. **API** — `/api/agents/:id/breaker` (GET status incl. current drawdown vs threshold, PUT config,
   POST re-arm). Owner-only, rate-limited.
4. **UI** — a Breaker panel in the wallet hub: live drawdown gauge vs threshold, armed/tripped state,
   config form, and a re-arm button (with the tripped reason + timestamp). All states designed;
   accessible; responsive.

## Constraints

- The breaker can only ever *restrict* trading; it never moves funds on its own beyond the
  owner-configured freeze. Tripping + re-arming are fully audited. Real net-worth/PnL data only.
- Enforcement lives in the one shared guard every trade passes — no bypass route. $THREE-only rule.

## Success criteria

- A crossed drawdown threshold demonstrably freezes new trades across manual + sniper + mirror +
  swarm paths until the owner re-arms, with audit + alert and a live gauge.
- Breaker UI renders all states, accessible + responsive. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature, security). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/drawdown-circuit-breaker.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
