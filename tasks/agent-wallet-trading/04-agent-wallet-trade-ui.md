# Task: Agent-wallet pump.fun trade UI — buy & sell from the agent's own wallet

## Context

The discretionary trade endpoint from task 03 (`POST /api/agents/:id/trade` +
quote/preview) lets a funded agent wallet buy and sell pump.fun tokens, server-
signed, fully guarded. The existing buy/sell widget (`src/game/coin-buy.js`) is
**SOL-only and user-wallet-only** — it signs with the visitor's external wallet,
not the agent's custodial wallet. This task builds the agent-wallet trading UI in
the wallet hub's **Trade** tab (shell from task 01), to the `CLAUDE.md` UX bar.

## Goal

From the agent's funded wallet, the owner can buy and sell a pump.fun token with a
polished trade panel: live quote (expected out, price impact, fees, slippage),
confirm, real on-chain execution via task 03, and an updated balance + position —
every state designed.

## Files to Read First

- Task 03 endpoint + quote/preview shape (`POST /api/agents/:id/trade`)
- `src/game/coin-buy.js` — existing buy/sell widget patterns (SOL-only) to learn
  from and improve on (sorting/states gaps noted in `CLAUDE.md`)
- Task 01 wallet hub shell (Trade tab placeholder) — render into it
- `src/agent-solana-wallet.js:287-313` — balance fetch/poll to reflect post-trade
- `api/sniper/history.js` / `…/positions` source — so discretionary trades show in
  the same unified history the sniper UI uses
- Existing design tokens + modal/toast patterns used across `src/`

## What to Build / Do

1. **Trade panel** in the hub Trade tab:
   - Token selector / mint input with metadata + price (real data; resolve mint to
     name/symbol/icon via the existing pump metadata path).
   - Buy/Sell toggle; amount entry in SOL or token (denom switch, matching the
     endpoint's `denom`); quick-amount chips (25/50/75/Max based on real balance).
   - **Live quote** from the task-03 preview: expected output, price impact (warn at
     high impact), fees, slippage control (bps), minimum received. Debounce input;
     re-quote on change.
   - Confirm step showing exactly what will happen; on submit, call the trade
     endpoint with an idempotency key; show in-flight → confirmed (with explorer
     link) → balance/position refresh.
2. **Positions / holdings view**: the agent's current token holdings and a unified
   trade history (discretionary + sniper) reading the same ledger task 03 writes to.
   Realized/unrealized value where available.
3. **Every state designed**: empty (no holdings — prompt to fund/trade), loading
   (skeleton, not spinner), quoting, submitting, success (toast + explorer link),
   error (guard rejection reasons from task 03 surfaced verbatim and actionable —
   "over daily budget", "price impact too high", "insufficient SOL for fees"),
   insufficient-balance (link to the deposit panel from task 02).
4. **Owner-only writes.** Visitors see read-only holdings/history; only the owner
   sees the trade controls. Reflect `walletReady` (task 01) — if the wallet is still
   provisioning, show that, not a broken form.

## Constraints

- Real quotes, real execution through task 03 — no client-side fake fills, no
  optimistic balances that aren't confirmed on-chain. The balance/position updates
  only after the tx confirms.
- Reuse the task-03 endpoint for all signing; the UI never holds or sends a key.
- Surface guard rejections as designed, recoverable states — never a raw error or a
  silent failure. Tie "insufficient funds" to the deposit flow (task 02).
- Mobile-responsive (320/768/1440), keyboard-operable, ARIA on controls, focus
  rings, hover/active states. Animations on opacity/transform only.
- Coin-agnostic: the trade UI accepts any runtime-supplied mint (a product
  capability), but must never name, hardcode, market, or recommend any token other
  than $THREE in copy, defaults, examples, or placeholders.

## Success Criteria

- `npm run dev`: from a funded agent wallet, complete a buy and a sell on devnet
  through the UI; balance + holdings update from real on-chain state; explorer links
  resolve.
- Quote (impact/fees/min-received/slippage) is live and matches the endpoint preview.
- Empty, loading, quoting, submitting, success, and every error/guard state render
  and look premium; "insufficient funds" routes to deposit.
- Zero console errors/warnings. `npm run typecheck` + `npm test` clean.
- Changelog entry (tag: feature). Run the **completionist** subagent on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/04-agent-wallet-trade-ui.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
