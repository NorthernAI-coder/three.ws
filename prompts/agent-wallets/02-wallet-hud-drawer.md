# Task 02 — The Wallet HUD (the full wallet, reachable from anywhere)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** for the
> ownership model, tokens, real APIs, hard rules, definition of done, and the
> "improve then delete this file" close-out. Coordinate with **task 01** — this HUD
> opens from the wallet identity chip/popover it builds.

## Mission

Build the **Wallet HUD** — a single, gorgeous, full-featured wallet surface that
slides over any agent from anywhere in the app. The chip (task 01) is the glance;
this is the cockpit. It must feel like the best wallet experience in crypto:
faster than Phantom, clearer than a CEX, designed like Linear.

One shared component (`src/shared/agent-wallet-hud.js` or similar under
`src/shared/`), opened from any wallet chip/popover with an agent id. It adapts to
the viewer's role (owner / visitor / logged-out) per the ownership model.

## What the HUD contains

A drawer/overlay (slide-in panel on desktop, full-sheet on mobile) with these
sections, all backed by real APIs:

1. **Header** — avatar thumbnail, agent name, vanity address (mono, copyable),
   ownership marker ("Yours" / "by @creator"), total portfolio value in USD,
   24h change. Real data via `GET /api/agents/:id/solana` +
   `/api/agents/:id/solana/holdings`.
2. **Balances by chain & asset** — Solana (SOL, USDC, $THREE, other SPL) and EVM
   (native + tokens). Each row: token, amount (mono), USD value, % of portfolio.
   Real on-chain reads. $THREE is the only coin you ever *name/feature*; other
   holdings render generically from runtime data.
3. **Deposit** (all viewers) — show the wallet address + a real QR code (use a real
   QR lib already in the tree or add one properly), chain selector, copy. This is
   how a wallet gets funded; make it frictionless.
4. **Withdraw / Sweep** (owner only) — `POST /api/agents/:id/solana/withdraw`.
   Destination input with address validation, asset + amount (with MAX), live
   USD preview, CSRF token, spend-policy awareness. Confirm step. Real tx, real
   signature link to explorer on success.
5. **Activity** — recent transactions from `GET /api/agents/:id/solana/activity`
   (owner) and/or public signatures: inflows (tips, deposits), outflows
   (withdrawals, trades, skill payments). Link each to the explorer. Real data.
6. **Spend limits / policy** (owner only) — `GET/PUT /api/agents/:id/solana/limits`:
   daily USD cap, per-tx ceiling, allowlist, freeze toggle. This is the safety rail
   that makes autonomous agent trading trustworthy — present it as a feature, not a
   settings dump.
7. **Custody trail** (owner only) — `GET /api/agents/:id/solana/custody`: every key
   recovery / withdraw / limit change with reason + timestamp. Frame it as
   "your wallet's security log." Real audit rows.
8. **Tip** (visitor) — `POST /api/agents/:id/solana/tip`. A delightful one-tap tip
   flow for non-owners. Real record; if it involves an on-chain transfer from the
   visitor's connected wallet, wire that for real.
9. **Vanity entry point** — link/launch into the Vanity Studio (task 03) for owners.
10. **Trade / Snipe entry point** — link/launch into the trading co-pilot (task 05)
    for owners. Coordinate the handoff.

## Innovation mandate

- **The HUD is the same everywhere** — open it from the galaxy, from a trending row,
  from the agent's profile: identical, instant, context-aware. That ubiquity is the
  product.
- **Real-time feel** — when a tip lands or a trade fills, the balance and activity
  update live (poll cheaply, or a real event source). No fake animation without a
  real event behind it.
- **Portfolio intelligence** — allocation donut, biggest mover, "since you opened
  this" delta. All from real holdings + real prices.
- **Keyboard-first** — `Esc` closes, focus trap, arrow-nav the asset list, a command
  to copy the address. Designed for power users.
- Invent beyond this list where it raises the bar — but every pixel is backed by
  real data.

## Real APIs (see orchestration README for the full list)

`api/agents/solana-wallet.js` exposes balance / holdings / activity / withdraw /
tip / limits / custody. CSRF tokens are required on writes — reuse the existing
CSRF pattern (recent commit "integrate CSRF token handling"); do not bypass it.
Ownership = `agent_identities.user_id === auth.userId`. If you need a new endpoint
for an innovative panel, build it for real (auth, CSRF, audit, spend-limit
enforcement, real chain calls) — never fake it.

## States & edge cases (all designed)

- Loading: skeleton rows, not spinners. Empty wallet: a warm empty state that tells
  the owner how to fund it (deposit) and tells a visitor they can tip / fork.
- Withdraw errors (insufficient balance, bad address, over spend limit, network
  fail): actionable inline messages, never a raw stack.
- 0 / 1 / many assets; very long token names; dust balances; an agent with no EVM
  wallet yet (offer to provision); expired session mid-action (re-auth gracefully).
- Visitor must never see withdraw/limits/custody controls — enforce in UI **and**
  rely on server-side owner checks (defense in depth).

## Definition of done

Per the orchestration README. Plus: the HUD opens from at least the chip on the
profile, trending, and galaxy surfaces; a real withdraw on devnet (or a real tip)
completes end-to-end with an explorer link; owner-only panels are invisible to
visitors; no console errors; responsive at 320/768/1440; `Esc`/focus-trap work.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file**
(`prompts/agent-wallets/02-wallet-hud-drawer.md`).
