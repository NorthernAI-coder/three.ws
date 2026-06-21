# C01 — Oracle conviction engine + Arm automation production pass

> Phase C · Depends on: B03 (payment), B06 (auth) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
The Oracle (AI conviction scoring for pump.fun launches) and "Arm" (let an agent trade on
that conviction automatically) are flagship intelligence features and a retention magnet
for traders. Arm in particular moves real money with thin instrumentation today — that's a
risk. Harden both to production and make the automation trustworthy.

## Where this lives (real files)
- `src/oracle.js` (~1.7k lines) — conviction score (pedigree/structure/narrative/momentum), watchlists, wallet leaderboard, force graph.
- `src/arm.js` (~333 lines) — configure agent trading (min conviction, sizing, caps, filters, Telegram alerts, simulate vs live).
- `workers/oracle/` — settle/agent/score loops; `api/cron/oracle-*`.
- `src/activity.js` — live feed of agent actions (pair with **C02**).

## Current state & gaps
- Oracle: graph failures show a generic message with no retry; wallet leaderboard has no pagination; force-graph load timeout unhandled.
- Arm: **under-instrumented for what it does** — only ~2 catch blocks for money-moving config; no loading states; wallet state not validated before enabling live trading; cap validation, Telegram health, and simulate→live safeguards unclear.

## Build this
1. **Arm safety first:** validate wallet + balance before enabling live mode; enforce + validate position/daily/open caps server-side; require a successful simulation (or explicit acknowledgement) before going live; a prominent live-vs-simulate indicator and a kill switch.
2. **Arm reliability:** loading/empty/error states for agent load + config save; verify the Telegram alert path actually delivers (health check) before promising alerts; record every automated trade with reasoning for the activity feed.
3. **Oracle resilience:** graph/score failures auto-retry with backoff + a manual retry; force-graph has a skeleton + timeout fallback; wallet leaderboard paginates; score methodology is explained in-UI (build trust).
4. **Honesty:** never imply a score is a recommendation to buy a non-$THREE coin — present it as analytics/intelligence (CLAUDE.md: $THREE is the only coin promoted; coin records/analytics are a product feature, not endorsement).
5. **A11y + mobile + perf:** keyboard, focus, lazy-load the graph, 320px.

## Out of scope
- The activity feed surface itself (**C02**) — emit to it.

## Definition of done
- [ ] Arm cannot enable live trading without a valid wallet + caps + simulation/ack; kill switch works; every auto-trade is logged with reasoning.
- [ ] Telegram alerts verified deliverable; Arm has all states.
- [ ] Oracle graph/leaderboard resilient (retry, pagination, skeleton); methodology explained.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Try to arm live with no wallet/over-cap → blocked with a clear reason; run a simulation; trigger a test alert and confirm delivery; fail the graph fetch → retry works.
