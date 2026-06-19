# Task 09 — Mission Control: Real-Time Trading Terminal (the capstone UI)

> **Operating bar (applies to the whole task).** Senior engineer + product thinker building
> three.ws to beat the best in the world. Genuinely innovative, not a clone. No mocks, no
> fake/sample data, no placeholders, no TODO/stubs, no `setTimeout` fake-loading. Wire 100%
> end-to-end with REAL APIs and real data. Every state designed. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime-supplied mints in generic trade
> plumbing are the only exception and are never promoted. After it works, self-review and ship
> the 10× improvement. `data/changelog.json` entry for every user-visible change. Run the
> **completionist** subagent. Stage only changed paths (never `git add -A`); re-check `git status`.
>
> **Depends on tasks 01, 03, 04 (and consumes 02/05/06 data where present).**

## The invention

Pump.fun traders juggle ten tabs. We give them one screen that makes them feel like they have a
superpower: a **real-time trading terminal** that fuses everything three.ws computes — the live
launch feed with intel scores + firewall verdicts + smart-money flow + pre-launch radar
precursors, the user's live positions with streaming PnL, and one-click (or one-keystroke) snipe/
exit from the agent wallet. This is the surface people screenshot and share. Bloomberg-grade
density, Linear-grade polish, zero jank, fully keyboard-driven.

## Context (real, verified)

- Live data sources to fuse (all real, all existing or built by this epic):
  - Launch feed: `api/_lib/pumpfun-ws-feed.js` (server) → expose via an SSE/stream endpoint.
  - Intel scores: `pump_coin_intel`; oracle conviction: `oracle_conviction`.
  - Firewall verdict: task 01 `GET /api/pump/safety`.
  - Smart-money: task 03 `GET /api/intel/smart-money`.
  - Pre-launch radar: task 04 `GET /api/sniper/radar` + SSE.
  - Positions + PnL: `api/sniper/stream.js` (SSE), `api/_lib/trader-stats.js`.
  - Execute: `api/agents/agent-trade.js` / `api/agents/solana-trade.js` (firewall + MEV-gated).
- UI conventions + design tokens: `src/agent-wallet-hub/index.js`, `src/agent-wallet-hub/tabs/trade.js`,
  `src/game/coin-buy.js`. SSE client patterns already used in the sniper UI.
- Frontend: vanilla JS modules + Vite. Keep it performant — virtualize lists, debounce, rAF.

## Goal

A dedicated `/terminal` (or `/mission-control`) page + `src/mission-control/` module that streams
real data into a multi-pane, keyboard-driven trading cockpit, executing real trades from the agent
wallet through the firewall + MEV engine.

## What to build

1. **Layout** — a responsive multi-pane terminal: (a) **live launch feed** (new mints streaming
   in, each row showing intel score, firewall verdict chip, smart-money count, age, market cap),
   (b) **radar** precursors (task 04), (c) **your positions** with live streaming PnL + quick exit,
   (d) a **focus/detail** pane for the selected coin (chart, intel breakdown, safety panel, smart-
   money graph, buy/sell). Collapses gracefully to a stacked mobile layout at 320/768/1440.
2. **Real-time plumbing** — consume all SSE/stream endpoints with robust reconnect/backoff, a
   shared event bus, and virtualized rendering so a fast feed never janks. No polling where SSE
   exists; no fake `setTimeout` ticks. Show connection state honestly (live / reconnecting / down).
3. **One-keystroke trading** — keyboard-first: arrow/jk to move the selection, `b` to buy preset
   size, `s` to sell, number keys for size presets, `/` to filter, `?` for a shortcut overlay.
   Every execution runs through the firewall (block disables the action) and the MEV engine, from
   the agent wallet, spend-guarded + audited. Confirm-on-first-use, then express mode.
4. **Filters + saved views** — filter the feed by intel score, firewall verdict, smart-money,
   creator pedigree, market-cap band; persist named views per user. Empty/loading/error states for
   every pane (skeletons, not spinners).
5. **Polish that makes it screenshot-worthy** — micro-interactions on new-row entry, smooth PnL
   number transitions, color-coded verdicts, a tasteful "alpha" density without clutter, focus
   rings, ARIA live regions for the streaming feed, reduced-motion support. Navigable from main nav
   and from the wallet hub. Add it to `data/pages.json` so the changelog records the new page.

## Constraints

- Every datum is real and streaming from real endpoints — no seeded rows, no demo coins, no fake
  feed. If a source is down, that pane shows an honest degraded state, not stale or fake data.
- Trades execute only through the existing guarded paths (firewall + spend guards + MEV + custody
  audit); the terminal is a fast UI over real execution, never a bypass.
- Performance is a feature: 60fps feed, virtualized lists, lazy-loaded heavy panes, debounced
  input. No memory leaks on long-lived SSE (clean up on unmount/route change).
- $THREE-only rule. The feed shows arbitrary runtime mints as market data; it promotes no token
  and never names any coin other than $THREE in chrome/copy.

## Success criteria

- `/terminal` streams real launches, intel, firewall verdicts, smart-money, radar, and live
  positions simultaneously, reconnecting cleanly; reachable from main navigation.
- Keyboard-driven buy/sell executes real firewall+MEV-gated trades from the agent wallet, audited.
- Filters + saved views work; every pane has designed loading/empty/error/populated states;
  responsive 320/768/1440; accessible; console-clean; no jank under a fast feed.
- New page added to `data/pages.json`. Build/typecheck/test clean. Changelog entry (tags: feature).
  Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/next-gen-trading/09-mission-control-terminal.md"
```

A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
