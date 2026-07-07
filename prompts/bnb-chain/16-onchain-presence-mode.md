# 16 — On-chain presence mode in explore/platformer

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 15** (gasless move sender). Run it (and its chain) first if missing.

## Why
Wire the on-chain movement into a real, existing 3D surface so people can actually feel it.
We shipped platformer mode + Agora player-mode (`src/agora/player-mode.js`) on 2026-07-07.
Add an opt-in "On-chain (BNB)" toggle: when on, the local avatar's moves are also written to
`WorldMoves` gaslessly, and OTHER players' on-chain moves are read back and rendered — a
fully-on-chain presence layer riding 0.45s blocks.

## Build
- Find the existing explore/platformer/player-mode entry (grep `player-mode`, `platformer`,
  the explore surface from `git log`). Add a clearly-labeled opt-in toggle "Record on-chain
  (BNB testnet)" — OFF by default (don't surprise users with wallet prompts).
- When ON: feed local position into prompt 15's sender (gasless moves). Read remote presence
  by subscribing to `Moved` events (viem `watchContractEvent` / polling every block via
  `chains.js`) and render lightweight ghosts/markers for other on-chain players in the same
  `worldId`. Interpolate between the ~0.45s updates so motion is smooth.
- Keep it additive: with the toggle OFF, the existing experience is byte-for-byte unchanged.
  Never regress the current explore/platformer behavior.

## States
Toggle OFF → zero BNB code runs, no wallet prompt. ON but no wallet → prompt to connect (BSC
testnet), gracefully cancelable. ON, sponsorship down → self-pay note or "local-only" degrade;
never freeze movement. No other on-chain players → your own ghost only + a subtle "you're the
first one here" hint. Event backfill on join (show recent movers, bounded lookback).

## Tests
- Pure interpolation/ghost-state logic in `tests/` (feed timestamped positions → smooth
  intermediate frames; stale players time out).
- Manual browser exercise REQUIRED: `npm run dev`, toggle on with a testnet wallet, walk
  around, confirm real `move` txs fire and a second browser/wallet shows up as a ghost.
  Capture observations + zero console errors in PROGRESS.

## Definition of done
Inherit 00-CONTEXT DoD (UI items included). Additionally:
- [ ] Real proof: two sessions (two wallets) see each other move on-chain; paste tx hashes and
      a note that ghost rendering tracked them at sub-second latency.
- [ ] `data/changelog.json`: entry (tag `feature`) — "Walk on-chain: gasless real-time presence on BNB Chain".
- [ ] `STRUCTURE.md`: update the explore/platformer row to mention the on-chain mode.
