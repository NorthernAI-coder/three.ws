# 18 — World E2E demo + docs

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 16** (and transitively 14, 15). Finish them first if incomplete — this prompt
proves the track end-to-end and documents it.

## Why
Prove the real-time on-chain world works with two real participants on testnet, and write the
doc that explains the mechanism and lets anyone reproduce it.

## Do — full E2E on BSC testnet (no mocks)
1. Two wallets join the same `worldId` in on-chain presence mode (16).
2. Both walk; confirm gasless `move` txs fire (15) and each sees the other's ghost update at
   sub-second latency (14's 0.45s blocks).
3. Capture: a sequence of real `move` tx hashes from both wallets with block timestamps
   showing ~0.45s spacing, and the `mode` (sponsored ideally) proving gas-free movement.

## Build — `docs/bnb-world.md`
Zero-context reader: what the on-chain world is, exactly why it's only practical on BNB Chain
(0.45s blocks + gasless EOA sends, both verified in 00-CONTEXT), the architecture
(`WorldMoves.sol` events + MegaFuel sponsorship + event-subscription presence), the reproducible
walkthrough with the real deployed testnet address, and the honest caveats (MegaFuel is one
operator; sponsorship policy-gated; self-pay fallback). Link from `docs/start-here.md`.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] PROGRESS: the full two-wallet trail — deployed `WorldMoves` address, move tx hashes from
      both wallets with block timestamps (sub-second spacing shown), `mode` per tx, and a note
      that ghosts tracked live. Track-C proof-of-life.
- [ ] `docs/bnb-world.md` complete; every address/hash real and from your run.
- [ ] `data/changelog.json`: entry (tag `feature`) — "Real-time on-chain 3D world live on BNB Chain testnet".
- [ ] Any step that couldn't run on real testnet is named explicitly with the reason.
