# R24 — Token-gated worlds

**Phase 4 (Avatar economy) · Depends on: existing Solana rails · Server-authoritative balance check**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Gate against **real on-chain balances** via `solana-agent-sdk/` / RPC. Non-gated worlds unaffected.

## Goal

Let a coin's world optionally require holding the coin to enter. Server-side balance check at join,
a creator-set threshold per coin, and a clear, actionable client gate screen for users who don't
qualify.

## Files

- `multiplayer/src/rooms/WalkRoom.js` — on join, read the coin's gating config and check the
  joining wallet's on-chain balance; reject (with a typed reason) if below threshold.
- Gating config store — per-coin, creator-set threshold (use the existing per-coin config/economy
  store; no new provider).
- `src/game/coincommunities.js` / UI — the gate screen shown when a join is rejected.
- `solana-agent-sdk/` / RPC — the balance read.

## Spec

1. **Per-coin config** — a creator-set threshold (hold ≥ X of the coin to enter). Default is
   **ungated** — existing worlds are unaffected unless a creator opts in.
2. **Server check at join** — when a wallet joins a gated room, the server reads its **real on-chain
   balance** (via `solana-agent-sdk/` / RPC) and rejects the join with a typed reason if below the
   threshold. Never trust a client-claimed balance.
3. **Gate screen** — for users who don't qualify, a clear, helpful screen: "Hold X $THREE to enter —
   buy here", linking the existing pump swap so they can acquire the coin and retry. (Generic
   coin-agnostic worlds use the world's own coin; surface `$THREE` only where this platform's coin
   is referenced.)
4. **Retry** — after acquiring, the user can re-attempt join and pass without a reload friction wall.
5. **Robustness** — RPC failure is handled at the boundary (don't hard-fail the whole world; surface
   a retry); no false rejects from transient RPC errors.

## Definition of done

- Gating works against real on-chain balances; the gate screen is helpful and actionable (links the
  real swap); non-gated worlds are completely unaffected.
- Balance check is server-side; RPC errors handled gracefully. No console/server errors.
- Verified: a qualifying wallet enters, a non-qualifying one is gated and can buy + retry.
  Diff self-reviewed per the R00 / CLAUDE.md DoD.
