# Task 05 — The Agent Wallet Trading Co-pilot & Sniper (headline innovation)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** for the
> ownership model, tokens, real APIs, hard rules, definition of done, and the
> "improve then delete this file" close-out. Builds on the wallet identity layer
> (**task 01**) and HUD (**task 02**), and is gated by spend limits (**task 02**).

## Mission

This is where the agent wallet stops being a wallet and becomes a **weapon**. Every
agent has a funded, custodial wallet and a spend policy. Turn that into the best
on-platform experience for **sniping new launches, trading, and launching** — fast,
safe, and reachable from any avatar. This is the feature that makes a serious trader
choose three.ws.

**Authorization note:** this is legitimate trading tooling operating on the user's
own custodial agent wallet, with explicit owner consent and server-side spend
limits. Build it properly and safely. It is owner-only, limit-gated, and fully
audited.

## What to build

A **trading co-pilot** surface launched from any agent's wallet (chip/HUD → "Trade /
Snipe"). Owner-only. Spend-policy-enforced. Sections:

1. **Live launch radar** — a real feed of new pump.fun launches (use the existing
   pump.fun integration: [api/_lib/agent-pumpfun.js](../../api/_lib/agent-pumpfun.js)
   and the launches feed). Real-time, filterable (age, liquidity, momentum). Each
   row is a real, runtime-supplied mint — **never hardcode or promote any specific
   non-$THREE mint**; these render purely from live data. $THREE is the only coin
   the platform itself features.
2. **One-tap snipe** — from a radar row, the owner can buy with their agent wallet:
   amount input (presets + custom), live quote, slippage control, **and the spend
   policy enforced** (`GET /api/agents/:id/solana/limits` — per-tx ceiling, daily
   cap, freeze). Real swap, real signature, real fill shown with explorer link.
3. **Armed auto-snipe (the innovation)** — let the owner *arm* the agent to snipe
   launches matching real criteria (e.g. min liquidity, creator filters, max buy)
   up to a strict, owner-set budget that **cannot exceed the spend policy**. This is
   an autonomous agent acting on its owner's behalf within hard, audited limits.
   Every armed buy is recorded in the custody trail with its trigger reason. The
   owner can disarm instantly. Build the execution path for real (server-side
   watcher + signer using the existing custodial signing + spend-guard code in
   [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js) and
   `api/_lib/agent-trade-guards.js`). No simulated fills.
4. **Positions & P&L** — the agent's open positions valued at real prices, realized/
   unrealized P&L, one-tap sell. Feeds the chip/HUD sparkline from task 01.
5. **Sell / take-profit / stop** — real sell orders; optional owner-set TP/SL that
   execute for real within spend limits.
6. **Launch from the wallet** — wire the existing pump.fun launcher so an owner can
   **launch a coin** funded by the agent wallet, end-to-end, from the same surface
   (generic, coin-agnostic plumbing where the mint is supplied at runtime — this is
   the sanctioned exception in CLAUDE.md; do not hardcode or market any specific
   non-$THREE mint).

## Safety rails (non-negotiable — these make it trustworthy, not toy)

- **Spend limits are law.** Every buy/snipe/armed-buy checks the agent's policy
  server-side (`agent-trade-guards.js`). The UI shows remaining daily budget and
  per-tx ceiling live, and blocks/clamps over-limit actions with a clear message.
  Never bypass the policy, even for armed auto-snipe — especially not there.
- **Owner consent is explicit.** Arming auto-snipe requires a deliberate confirm
  with the exact budget and criteria spelled out. A visible "ARMED" state and a
  one-tap "DISARM" are always present.
- **Everything is audited.** Every trade and armed action writes to the custody
  trail (`/api/agents/:id/solana/custody`) with reason + amount + tx. The owner can
  see exactly what their agent did and why.
- **Owner-only.** Visitors and logged-out users never see trade controls — UI and
  server both enforce.
- **Real funds, real care.** Confirmations for amounts, slippage warnings on thin
  liquidity, honest error states on failed/partial fills. Never lose or
  double-spend funds; re-check on-chain state before claiming a fill.

## Innovation mandate (go big — this is the differentiator)

- **Snipe from anywhere** — the radar/snipe is reachable from the galaxy, a trending
  row, an avatar's profile. Your agent's wallet is always one tap from acting.
- **The agent as trader, with a face** — because every wallet belongs to a 3D
  avatar, visualize the agent *doing* the trade (its avatar reacts to a fill). This
  is something no other platform can do — lean into it. Drive any animation off
  **real** trade events.
- **Co-pilot intelligence** — surface real signals (liquidity, age, holder count,
  momentum) so the snipe decision is informed. Pull from real chain/feed data only.
- **Shared/forked strategies** — a snipe config is data; let owners save and (if they
  choose) share strategy presets. Real configs, owner-scoped, no fake leaderboards.
- Invent past this list. The brief is "game-changing for sniping/trading/launching."
  Every feature backed by real chain calls, real feeds, real money — within real
  limits.

## States & edge cases

- Empty radar (no launches right now), thin/failed liquidity, slippage exceeded,
  insufficient balance, over spend limit, frozen wallet, RPC failure mid-swap,
  partial fill, session expiry mid-trade, armed budget exhausted. Each designed and
  honest. Re-derive truth from chain/DB before showing outcomes.

## Definition of done

Per the orchestration README. Plus: a real buy executes on the agent wallet
(devnet/mainnet per available funds) with a real signature + fill; spend limits
demonstrably block an over-limit attempt; armed auto-snipe arms/disarms and, when
armed, executes a real limit-gated buy on a matching real launch, audited in the
custody trail; positions show real P&L; launch-a-coin path works end-to-end.
Owner-only enforced. No console errors. Responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file** (`prompts/agent-wallets/05-sniper-copilot.md`).
