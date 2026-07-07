# 14 — WorldMoves.sol (on-chain move commits)

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 01** (chain constants). Run it first if missing.

## Why
Track C's core: a contract that records player moves/state transitions as events, cheap and
tiny, designed to be written every ~0.45s (BSC's live block time) and read back as a
real-time on-chain presence feed. The point is to feel Solana-class latency with full EVM
tooling — 0.45s blocks + gasless moves make fully-on-chain movement actually usable.

## Build — `contracts/WorldMoves.sol` (Foundry)
- Minimal gas per move (this is written constantly). Design:
  - `move(uint32 worldId, int32 x, int32 y, int32 z, uint16 facing)` — emits
    `Moved(worldId, msg.sender, x, y, z, facing, block.number, block.timestamp)`. Prefer
    event-only (no SSTORE) for the movement stream to keep gas minimal; keep optional current-
    position storage behind a separate `checkpoint()` if a prompt needs queryable latest state.
  - Optional `join(worldId)` / `leave(worldId)` presence events.
- No admin, no upgradeability needed (keep it trivially auditable). Bound coordinates sanely.
- Deploy script `contracts/script/DeployWorldMoves.s.sol`. Follow `contracts/README.md`.

## States
Out-of-bounds coords → revert or clamp (pick one, document). Spam is expected — that's the
use case; ensure gas stays flat (no unbounded loops, no growing storage per move).

## Tests (`contracts/test/WorldMoves.t.sol`, `forge test -vv`)
- `move` emits `Moved` with the exact args + block metadata.
- Gas per `move` measured and asserted under a tight bound (paste the gas number).
- `join`/`leave` emit presence events.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] `forge test -vv` green; paste output INCLUDING the measured gas-per-move.
- [ ] REAL deploy to BSC testnet; record in `contracts/DEPLOYMENTS.md`; paste deploy tx +
      BscScan link. Fire ~10 real `move` txs in a row and paste the block numbers/timestamps
      showing sub-second spacing (this doubles as live 0.45s-block proof).
- [ ] Internal — docs deferred to prompt 18.
