# Task: Public / onboarding deposit panel — scan QR or copy address, send SOL, live confirmation

## Context

The pieces to fund an agent wallet already exist but are scattered and
owner-gated, so a first-time user has no clean "send SOL to your agent" moment:

- Zero-dep QR generator: `src/erc8004/qr.js` (`renderQRToCanvas`,
  `renderQRToSVG`). The agent-detail page also loads QRious from a CDN
  (`pages/agent-detail.html:39`) — prefer the first-party `src/erc8004/qr.js` to
  avoid a third-party CDN dependency.
- A Receive button + QR canvas + copy-address control exist, but behind
  `bindWalletActions(isOwner)` so only the owner ever sees them
  (`src/agent-detail.js:1771-1796`, `pages/agent-detail.html:419-443`).
- Live balance API (`GET /api/agents/:id/solana`, `api/agents/solana-wallet.js:251`)
  + activity feed (`…/solana/activity`) + 30s client poll
  (`src/agent-solana-wallet.js:287,310`) are ready.
- The create-agent success screen already tells the user "It now has its own
  wallet" (`pages/create-agent.html:1493`) but offers no way to fund it.

This task turns those into a polished deposit experience that lives in the wallet
hub's **Deposit** tab (built in task 01) and is surfaced on the create-agent
success screen as the natural next step.

## Goal

Any user (owner or visitor) can fund an agent: see the agent's Solana address,
scan a QR with their phone, tap a `solana:` deep-link to open a mobile wallet, or
copy the address — then watch the balance update live and get a clear "X SOL
received" confirmation the moment funds land.

## Files to Read First

- `src/erc8004/qr.js` — first-party QR renderer (use this, not the CDN)
- `src/agent-detail.js:1771-1796` — current owner-only receive/QR logic to generalize
- `pages/agent-detail.html:419-443` — current address/QR markup
- `api/agents/solana-wallet.js:251` — balance + `…/activity` endpoint shape
- `src/agent-solana-wallet.js:287-313` — `fetchAgentSolanaWallet` + poll loop to reuse
- `pages/create-agent.html:1485-1500` + `src/create-agent.js:923-1050` — success screen
- Task 01's wallet hub shell (Deposit tab placeholder) — render into it

## What to Build / Do

1. **Deposit panel** rendered in the hub's Deposit tab and reusable as a modal:
   - Agent display name + avatar thumbnail for trust ("You're funding **Nova**").
   - The Solana address shown in full + truncated, with a one-tap copy control
     (toast on success).
   - A crisp QR encoding a **Solana Pay-style `solana:<address>` URI** (with
     `?label=<agentName>`), rendered via `src/erc8004/qr.js`. Tapping/clicking it on
     mobile triggers the same `solana:` deep-link to open Phantom/Solflare/etc.
   - A short, friendly "How to fund" line: scan with your phone wallet, or copy the
     address and send SOL from any wallet/exchange.
   - Optional amount field that updates the QR/deep-link `?amount=` (SOL).
2. **Live "funds received" feedback.** Reuse the existing poll
   (`src/agent-solana-wallet.js`) to watch the balance; when it increases, show a
   celebratory but professional confirmation ("◎0.50 SOL received") and refresh the
   activity list. Before any deposit, show a calm "Waiting for your first deposit…"
   empty state, not a blank.
3. **Wire into onboarding.** On the create-agent success screen
   (`pages/create-agent.html` / `src/create-agent.js`), add a prominent
   "Fund your agent" action that opens this deposit panel, so funding is the natural
   first step after creation. Also reachable from the agent profile.
4. **Make it public-safe.** Visitors (not just owners) can view + use the deposit
   panel — funding someone's agent is a feature. No secret, no management controls
   for non-owners.

## Constraints

- First-party QR only (`src/erc8004/qr.js`); drop the QRious CDN dependency for this
  surface. No external script for core funding UX.
- Real balance/activity from the live endpoints — never simulate a deposit or fake
  the "received" event. The confirmation must fire only on a real on-chain balance
  increase.
- `solana:` URI must be valid per Solana Pay (correct scheme, base58 address,
  optional `amount`/`label`). Verify it opens a wallet on a real phone (or document
  the exact tested URI if no device is available).
- Designed states: idle/waiting (empty), polling (subtle), received (success), RPC
  error (retry, never blank). Mobile-first (the QR is scanned on a phone but shown on
  desktop and vice-versa); 320/768/1440; ARIA labels on copy/QR; focus rings.

## Success Criteria

- `npm run dev`: open the deposit panel from both the create-agent success screen
  and the agent profile; QR renders, copy works, the `solana:` deep-link is valid.
- On a devnet/testnet address, sending SOL makes the balance update live and the
  "received" confirmation fire from real on-chain state (Network tab shows the real
  balance poll).
- Empty/waiting, success, and RPC-error states all render and look premium.
- Zero console errors/warnings; no third-party CDN for the QR. `npm run typecheck` +
  `npm test` clean.
- Changelog entry (tag: feature). Run the **completionist** subagent on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/02-public-deposit-panel.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
