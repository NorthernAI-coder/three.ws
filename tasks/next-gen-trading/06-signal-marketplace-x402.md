# Task 06 — Reputation-Gated Signal Marketplace (x402 paid alpha feeds)

> **Operating bar (applies to the whole task).** Senior engineer + product thinker building
> three.ws to beat the best in the world. Genuinely innovative, not a clone. No mocks, no
> fake/sample data, no placeholders, no TODO/stubs, no `setTimeout` fake-loading. Wire 100%
> end-to-end with REAL APIs and real on-chain data. Every state designed. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime-supplied mints in generic trade
> plumbing are the only exception and are never promoted. After it works, self-review and ship
> the 10× improvement. `data/changelog.json` entry for every user-visible change. Run the
> **completionist** subagent. Stage only changed paths (never `git add -A`); re-check `git status`.
>
> **Depends on task 03 (smart-money graph).** Reputation gating uses real track records.

## The invention

We have **verifiable on-chain track records** (`trader-stats.js` composite score + verification
badge) and **x402 agent-to-agent micropayments**. Combine them into the first **trust-gated
signal marketplace**: a trader whose track record is verified can publish their live entry/exit
signals as an x402-metered feed; a follower's *agent* pays per signal (or per epoch) and mirrors
the trade automatically from its own wallet, with the firewall + spend guards intact. Signals are
**performance-bonded and accountable** — every published signal's realized outcome is tracked, so
the marketplace ranks sellers by *proven* edge, not follower count. This is copy-trading with
real economics and real accountability, which no one in this space has.

## Context (real, verified)

- Track record + verification: `api/_lib/trader-stats.js` (`computeTraderMetrics`, `verified`
  badge: 12+ closed, 5+ coins, ≤40% churn, >0 realized SOL). Leaderboard: `api/sniper/leaderboard.js`.
- x402 micropayments: `api/x402-pay.js` (per-agent USDC settlement, SSE, spend tracking via
  `agent-trade-guards.js`); A2A scaffolding: `api/agents/a2a-*.js`, `agent_payments` ledger.
- Copy scaffolding already present: `copy_subscriptions` table + `activeCopierCounts` /
  `copierCountForAgent` in `trader-stats.js`. Build the marketplace ON this — finish it.
- Live position events: `api/sniper/stream.js` (SSE open/buy/sell/close) — the raw signal source.
- Mirror execution reuses `api/agents/agent-trade.js`/`executor.js`, the firewall (01), MEV (02).

## Goal

A signal marketplace where verified traders publish x402-metered signal feeds and follower agents
subscribe + auto-mirror, with per-signal accountability and a ranked, real-performance directory.

## What to build

1. **Publisher side** — let a verified agent (gate on `trader-stats` `verified === true`) create a
   **signal feed**: pricing (x402 per-signal USDC and/or per-epoch subscription), what it emits
   (entries, exits, sizing %), and visibility. New `signal_feeds` + `signal_emissions` tables
   (feed config; each emission: mint, side, size_pct, conviction, emitted_at, realized_outcome
   filled in later). Emissions are generated **from the publisher's real trades** (hook the
   position lifecycle / sniper fills) — never hand-authored, never fake.
2. **x402 metering** — gate feed reads behind `api/x402-pay.js`: a subscriber agent pays USDC from
   its own wallet per signal or per epoch; settlement flows through the existing per-agent path
   with custody audit (`agent_custody_events`, category `signal`) and spend guards. Idempotent;
   respect daily caps + kill switch. Publisher earns real USDC.
3. **Subscriber auto-mirror** — `signal_subscriptions` (subscriber_agent_id, feed_id, mode
   simulate|live, size_scaling, max_per_trade, slippage, firewall_level). On a new paid emission,
   the subscriber agent mirrors the trade from its own wallet: scale size, run the firewall (01),
   submit via MEV engine (02), record a position tagged with the source feed. All spend guards
   apply. Simulate mode mirrors without spending for trust-building.
4. **Accountability + ranking** — when a mirrored/published signal closes, record realized outcome
   on the emission and roll up per-feed stats (hit-rate, avg follower ROI, latency from emit→fill).
   `GET /api/signals/marketplace` ranks feeds by **proven realized edge** (not follower count),
   reusing `trader-stats` confidence regression so thin feeds don't top the board.
5. **API + UI** — `/api/signals/feeds` (CRUD, publisher), `/api/signals/marketplace` (public,
   ranked), `/api/signals/subscribe` (subscriber), `/api/signals/stream` (paid SSE of emissions).
   Build a **Signals** product surface: marketplace directory (each feed shows verified track
   record + realized signal accuracy + price), a feed detail page, and a subscriber control panel
   in the wallet hub (mode, sizing, kill). Designed empty/loading/error/populated; accessible;
   responsive.

## Constraints

- Only **verified** track records can publish; the verification + score come from real closed
  trades via `trader-stats.js`, never self-declared. Sellers cannot fake performance — emissions
  bind to real on-chain fills and realized outcomes.
- Real x402 USDC settlement only — no simulated payments in live mode; simulate mode is clearly
  labeled and spends nothing. Every payment audited and spend-guarded.
- Mirror trades obey the firewall + spend limits + kill switch with no exception; a subscriber can
  always halt instantly and withdraw.
- $THREE-only rule; the marketplace ranks *traders/feeds*, never promotes a token. Mints shown are
  runtime trade data only.

## Success criteria

- A verified agent publishes a feed; a subscriber agent pays real x402 USDC and auto-mirrors a
  real trade through the firewall + MEV engine, fully audited.
- Emissions accrue realized outcomes; marketplace ranks by proven edge with confidence regression.
- Signals UI (marketplace, feed detail, subscriber panel) renders all states; instant kill works.
- Build/typecheck/test clean. Changelog entry (tags: feature, sdk). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/next-gen-trading/06-signal-marketplace-x402.md"
```

A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
