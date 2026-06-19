# Task 07 — Universal Wallet Mirror (copy any external on-chain wallet)

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best.
> Genuinely innovative, not a clone. No mocks/fake data/placeholders/TODO/stubs/`setTimeout`
> fake-loading. Wire 100% with REAL APIs + on-chain data. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints in generic plumbing are the only
> exception, never promoted.

## ⛓ Chain protocol — STEP 0, before building

Node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before building:
read all `tasks/` + `BACKLOG.md`; invent **10 genuinely new, non-duplicate, real-codebase-grounded
feature ideas**; write each as a full prompt in `tasks/trading-frontier/next/<slug>.md` matching
this file's structure (including this Chain protocol section); append each to `BACKLOG.md` after a
dedup check. Only then build YOUR feature to the production-ready bar (epic README) and `git rm`
this file in the completion commit.

## The invention

Copy-trading on three.ws (signal marketplace, `tasks/next-gen-trading/06`) is agent-to-agent. But
the best traders on Solana aren't on our platform — yet their wallets are public. Build a
**Universal Wallet Mirror**: paste any external Solana address, and your agent watches it in real
time and mirrors its pump.fun/AMM trades from your own wallet — with your own risk scaling, your
firewall, your spend limits, and a live "how this wallet is doing" panel powered by task-03 smart-
money + task-06 creator data. Copy the on-chain elite, not just platform users. No competitor lets
you mirror an arbitrary wallet into an autonomous AI agent's risk-managed wallet.

## Context (real, verified)

- Real-time wallet activity: Helius (`HELIUS_API_KEY`) address webhooks / `getSignaturesForAddress`;
  RPC failover `api/_lib/solana/connection.js`. Tx parse patterns: `api/_lib/pump-claims.js`,
  feed `api/_lib/pumpfun-ws-feed.js`.
- Trade detection: identify pump.fun buy/sell (program id + instruction shapes already parsed in
  `pump-claims.js` / `pump-swap-ix.js`) from a watched wallet's confirmed txs.
- Mirror execution: `api/agents/agent-trade.js` + firewall (`tasks/next-gen-trading/01`) + MEV
  engine (`tasks/next-gen-trading/02`) + spend guards `api/_lib/agent-trade-guards.js`.
- Existing copy scaffolding to generalize: `copy_subscriptions` + `trader-stats.js` copier counts.
- Wallet scoring context: `wallet_reputation` (`tasks/next-gen-trading/03`).

## Goal

A mirror service: watch any external Solana wallet, detect its trades on-chain in real time, and
mirror them risk-scaled through the firewall + spend guards from the agent wallet — with a target
wallet analytics panel and a clean management UI.

## What to build

1. **Mirror model** — `wallet_mirrors` (agent_id, user_id, target_address, network, mode
   simulate|live, size_mode [fixed|proportional], max_per_trade, slippage, copy_buys, copy_sells,
   only_pumpfun, min_target_score, firewall_level, status, created_at) + `mirror_fills` audit.
2. **Watcher** — a worker that monitors each active target (Helius webhook if configured, else
   polled signatures with backoff + dedupe), detects pump.fun/AMM buys/sells from confirmed txs in
   near-real-time, and emits a mirror intent. Honest on RPC/webhook failure (pause + report, never
   miss-then-fake).
3. **Risk-scaled mirror execution** — translate the target's trade into the subscriber's sized
   trade (fixed amount or proportional to the target, clamped to caps), run the firewall, execute
   via the MEV engine from the agent wallet, record a `mirror_fill` tagged with the target + source
   tx. Simulate mode mirrors without spending. All spend guards + kill switch apply; instant stop.
4. **Target analytics** — show the target wallet's live track record (recent trades, win-rate,
   smart-money score from task 03) so users mirror with eyes open; warn on sybil/low-score targets.
5. **API + UI** — `/api/mirrors` (CRUD, pause, kill), `/api/mirrors/:id` (state + fills + target
   analytics), SSE for live mirror events. Build a **Mirror** surface in the wallet hub: add a
   target (paste address → analytics preview → configure scaling/limits → start), an active-mirrors
   list with live fills, and a kill control. All states designed; accessible; responsive.

## Constraints

- Detection from **real confirmed on-chain txs** only — never fabricate a target trade. Mirror only
  after the target's tx confirms (no front-running a third party's pending tx; we copy executed,
  public trades).
- Every mirror fill is firewall-gated, spend-guarded, audited; kill is instant; never exceed caps.
- Latency-aware but safety-first: skip a mirror if the price has moved beyond the user's slippage.
- $THREE-only rule; target addresses + mints are runtime data, never promotions.

## Success criteria

- A user can mirror an arbitrary external Solana wallet; real confirmed target trades are mirrored
  risk-scaled through the firewall + MEV engine from the agent wallet, audited; simulate mode works.
- Target analytics + sybil warnings render; kill instant. Mirror UI all states; responsive +
  accessible. Production-ready bar met; chain extended. Build/typecheck/test clean. Changelog
  (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/07-universal-wallet-mirror.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
