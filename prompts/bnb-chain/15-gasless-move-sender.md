# 15 — Gasless move sender (sponsored move txs)

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 02** (`megafuel.js`) and **14** (`WorldMoves.sol` deployed). Run whichever is
missing first.

## Why
Moving on-chain is only magical if it's FREE and instant. This layer turns a player's
intended move into a gasless MegaFuel-sponsored `move()` tx (self-pay fallback), so a plain
empty wallet can walk around a world writing to chain every ~0.45s with no gas. Combines the
two headline capabilities into one felt experience.

## Build — `api/_lib/bnb/world-moves.js` + a thin browser sender
- `buildMoveTx(worldId, pos, facing)` — encodes a `WorldMoves.move` call via viem + the
  deployed address (from `chains.js`/config).
- `sendMove({ account, worldId, pos, facing })` — routes through `megafuel.sendGasless`
  (prompt 02); returns `{ hash, mode }`. Rate-limit/coalesce: if the player moves faster than
  blocks confirm, debounce to at most one in-flight tx + latest-wins queue (don't spam
  hundreds of pending txs). This coalescing logic must be pure + tested.
- Browser entry: a small module the presence mode (16) imports — takes the player's local
  position stream, emits sponsored move txs at a sane cadence (target ~1 per block).

## States
Sponsorship unavailable → self-pay (still works, label it). Tx pending longer than a block →
skip intermediate positions, send only the latest (latest-wins). Wallet has no funds AND
sponsorship down → surface "moves can't be recorded on-chain right now" gracefully; local
movement still works (never freeze the game).

## Tests (`tests/bnb-world-moves.test.js`)
- `buildMoveTx` encodes the right calldata for known args.
- Coalescing: feed a burst of positions faster than confirmations → asserts only latest-wins
  txs are emitted, in-flight cap respected (pure-logic test, no network).
- `sendMove` sponsored + self-pay fallback paths (mock prompt 02).

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] REAL testnet proof: send a stream of ~20 gasless moves from a single wallet; paste a
      few tx hashes, their `mode` (ideally `sponsored` with gasPrice 0), and the block spacing.
      If sponsored, note the wallet's tBNB balance stayed flat — that's the wow.
- [ ] Docs deferred to 18.
