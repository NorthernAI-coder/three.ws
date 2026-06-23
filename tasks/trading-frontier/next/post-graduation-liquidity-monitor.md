# Task — Post-Graduation Liquidity Monitor (track the AMM aftermath, alert on LP pulls)

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

Task 09 (AMM migration sniper) is about catching the graduation *moment*. But the most dangerous
window is the hours *after* graduation, when LP whales who provided the migration liquidity quietly
withdraw and let the price bleed out — a slow rug the snipe path never sees. Build a **post-graduation
liquidity monitor**: for every coin the agent holds or watches that has graduated to PumpSwap,
continuously track pool depth, LP-holder concentration, and price decay, and fire a high-priority
alert the instant an LP whale starts pulling liquidity — early enough to exit. It turns "I got rugged
after it graduated" into "I was out before the pool drained."

## Context (real, verified)

- AMM exit logic + pool reads: `workers/agent-sniper/amm-exit.js` (the existing post-migration exit
  worker) and `api/_lib/pump.js` (`getAmmPoolState` for live PumpSwap reserves).
- Outcome history for decay baselines: `pump_coin_outcomes` (post-graduation price/volatility decay
  to calibrate what "abnormal" looks like).
- Live position/alert stream to push into: `api/sniper/stream.js` (the existing SSE/stream surface
  the sniper UI already consumes).

## Goal

A monitor that, per held/watched graduated coin, samples pool depth + LP concentration on a cadence,
detects abnormal liquidity withdrawal and price decay against a calibrated baseline, and streams an
actionable alert (with a one-tap protected exit) before the pool drains.

## What to build

1. **Pool-depth + LP-concentration tracker** — poll `getAmmPoolState` for held/watched graduated
   coins; compute reserve depth, top-LP share, and a rolling decay curve; persist a time series.
2. **Withdrawal-detection model** — calibrate "normal" decay from `pump_coin_outcomes` and flag
   abnormal depth drops / LP-whale exits with a severity score (watch / warning / pull-in-progress).
3. **Alert + one-tap exit** — stream alerts through `api/sniper/stream.js`; each alert offers a
   protected sell of the position (honoring guards + custody audit) so the user can exit in one tap.
4. **Monitor worker** — extend the `workers/agent-sniper/` flow with a liquidity-monitor loop that
   only watches graduated coins (curve coins are out of scope here), with backoff + RPC failover.
5. **UI** — a "Liquidity health" panel per graduated holding: live depth, LP concentration, decay
   sparkline, severity badge, and the exit action. All states designed; responsive; accessible.
6. **Honest signals** — never raise a false rug alarm on normal volatility; tune thresholds against
   real outcome history and show the user why an alert fired.

## Constraints

- Exit actions honor spend guards (`api/_lib/agent-trade-guards.js`), write custody audit
  (`agent_custody_events`), and any re-buy clears the firewall (`api/_lib/trade-firewall.js`).
- $THREE is the only promoted coin; monitored runtime mints are trade data only.
- No mocks, stubs, or fake liquidity data — real PumpSwap pool reads and real outcome baselines only.

## Success criteria

- Reachable in the UI for graduated holdings; a real LP withdrawal on a real pool produces a timely,
  actionable alert with a working protected exit.
- Real `getAmmPoolState` reads + real `pump_coin_outcomes` baselines; guard-honored, custody-audited.
- All states designed; responsive at 320/768/1440; accessible (ARIA, keyboard, focus, contrast,
  reduced-motion).
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entry (tags:
  feature); completionist passes; chain extended with 10 new registered prompts.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/post-graduation-liquidity-monitor.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
