# 08 — Live Spend Feed with a Real Clawback Window

> Read `00-README.md` first. Obey every rule there. Delete this file only when
> fully done + self-improved.

## The problem worth solving

Autonomous wallets spend without a human in the loop — that's the point — but it
means the owner finds out *after* the money is gone, by digging through a custody
list. There is **no real-time visibility** and, critically, **no chance to stop a
questionable spend before it settles.** For people's money, "you can review it
later" is not good enough.

## The game-changing feature

Give owners **a live, real-time feed of everything their agent is doing with
money** — and, for high-stakes actions, a short, owner-configurable **hold
window during which they can cancel before broadcast/settlement.** A genuine
*undo* for autonomous money: the agent proposes a high-value spend, the owner is
pinged instantly, and unless they cancel within N seconds (or explicitly
approve), it proceeds. No agent-wallet platform offers a real clawback window on
autonomous spends.

## What to build (wire all of it, for real)

1. **Real-time spend stream.** Stream custody events to the owner as they happen
   over a real transport (SSE — the platform already uses SSE in `x402-pay.js`;
   reuse the pattern — or WebSocket if justified). Every trade / snipe / x402 /
   withdraw appears live with amount, asset, counterparty (with allowlist badge),
   the policy/anomaly verdict that let it through, and a status that updates as it
   confirms on-chain. Real data from the real ledger + RPC.
2. **Hold-and-confirm for high-value actions.** Owner sets a threshold and a hold
   duration ("hold any spend over $50 for 30s and ping me"). When an autonomous
   action exceeds it, the spend path **reserves but does not broadcast**: it
   writes a `pending` custody event, notifies the owner in real time, and waits.
   - **Cancel within the window** → the reservation is released (reuse
     `releaseSpendReservation`), nothing is broadcast, audited as owner-cancelled.
   - **Approve** (or the window elapses, per the owner's chosen default) → it
     proceeds and settles. Approving teaches nothing dangerous; the default for an
     elapsed window is owner-chosen (auto-proceed *or* auto-cancel).
   This must integrate cleanly with the reserve/settle pattern already in
   `reserveSpendUsd` so there is no double-spend and no broadcast-then-regret.
3. **Real push notifications.** Wire genuine delivery so the owner is reachable
   off-page: Web Push (Push API + service worker + VAPID) and/or the existing
   notify channels (`api/_lib/notify.js`, Telegram). A held spend that needs a
   decision must reach the human, not just sit in a tab.
4. **One-tap actions from the alert.** The notification / feed row offers
   Approve, Cancel, and "Freeze wallet" (reuse the freeze) inline — the owner
   acts in one tap from wherever they are.

## UX / UI

- A live "Activity" stream in the wallet hub (real-time, not a manual-refresh
  list), newest first, with held items pinned at top showing a live countdown and
  Approve / Cancel. Calm when nothing's happening; unmistakable when a decision
  is needed. All states: connecting, live, reconnecting (honest), empty, held,
  resolved. Reduced-motion friendly; fully keyboard-operable; ARIA live regions
  for the incoming events.
- Connection resilience: auto-reconnect with backoff, and never show stale data
  as live. If the stream drops, say so — funds are still safe and governed
  server-side regardless of the feed.

## Architecture guidance

- Streaming endpoint reusing the SSE plumbing; authenticated + owner-scoped.
- The hold/clawback lives in the shared spend path: extend the
  reserve→(wait)→settle/release flow so a held action is a first-class state, not
  a bolt-on. Coordinate with `reserveSpendUsd` / `releaseSpendReservation` /
  `updateCustodyEvent` in `agent-trade-guards.js` (shared hot file — additive,
  well-commented). The hold must be race-safe and idempotent: a cancel and an
  approve arriving together resolve to exactly one outcome.
- Service worker + VAPID for Web Push wired for real (keys via env); degrade to
  in-app + existing channels when push isn't granted — never silently drop a
  decision request.

## Security & correctness

- Only the owner sees their feed and can approve/cancel; verify ownership on the
  stream and on every action.
- A held spend that is never resolved follows the owner's explicit default
  (auto-proceed or auto-cancel) — never an ambiguous limbo that locks funds.
- No double-broadcast, no settle-after-cancel; the reservation state machine is
  the single source of truth.

## Testing

- Unit/integration: reserve→hold→cancel releases and never broadcasts;
  reserve→hold→approve settles exactly once; window-elapsed honors the owner
  default; concurrent cancel+approve resolves to one outcome; ownership gating on
  stream + actions.
- A real devnet run: trigger a high-value autonomous spend, see it appear held in
  the live feed, cancel it, and assert nothing settled on-chain; repeat with
  approve and assert exactly one settlement.

## Deliverables

Real-time spend SSE feed, hold-and-confirm clawback integrated into the
reserve/settle path, real Web Push + existing-channel delivery, one-tap
approve/cancel/freeze, live Activity UI with all states, tests, changelog
(feature/security).

## Before you finish

Then improve it: surface the policy/anomaly reason inline on each event (wire to
`02`/`03` if present), and make the held-item countdown + one-tap decision feel
instant and trustworthy. Verify the cancel-before-settle guarantee on devnet in
the browser, review your diff, then **delete this prompt file.**

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/wallet-innovation/08-live-feed-clawback.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
