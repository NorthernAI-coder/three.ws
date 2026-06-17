# Task: Automatic AMM exit for graduated positions

## Context

When a sniped (or discretionary) position's coin **graduates** off the pump.fun
bonding curve onto the AMM, the current sell path throws `CoinGraduatedError`,
which the executor catches and parks the position: it marks
`error='graduated:awaiting_amm_exit'`, `exit_reason='graduated'`, and leaves it
open indefinitely (`workers/agent-sniper/executor.js:161`). The README flags this
as a known fast-follow. Result: a winning position can become unsellable through
the automated path and sit stuck — unacceptable for "zero error, production ready,"
since real user funds are trapped in an open position with no automatic exit.

The instruction builders already understand both venues: bonding-curve and AMM
(`api/_lib/pump-swap-ix.js`, `api/_lib/pump.js`). What's missing is the executor
detecting graduation and routing the sell through the AMM pool instead of giving up.

## Goal

A position whose coin has graduated is sold automatically through the pump AMM
pool — no position parks in `awaiting_amm_exit`. Exit rules (stop-loss/trailing/
take-profit/timeout) continue to apply post-graduation. The discretionary trade
endpoint (task 03) routes graduated sells the same way.

## Files to Read First

- `workers/agent-sniper/executor.js:140-206` — `executeSell`, the
  `CoinGraduatedError` catch (`:161`), how positions are marked + PnL recorded
- `workers/agent-sniper/positions.js:20-96` — position sweep, re-quote, exit triggers
- `api/_lib/pump.js:130` + `api/_lib/pump-swap-ix.js` — buy/sell builders; confirm
  which already target the AMM (`pump-swap` / pool) vs bonding curve
- `workers/agent-sniper/trade-client.js:29` — `signAndSend` (venue-agnostic submit)
- `@pump-fun/pump-swap-sdk` usage anywhere in the repo (the AMM-side SDK)
- Task 03's shared guardrail module (graduated sells must pass the same guards)
- `api/pump/[action].js` sell-prep/confirm — how the user-driven path already
  handles post-graduation AMM sells (reuse that logic, don't reinvent)

## What to Build / Do

1. **Detect graduation deterministically** — before/within `executeSell`, determine
   whether the mint is on the bonding curve or graduated to the AMM (via the SDK /
   on-chain pool lookup), instead of relying on a thrown error mid-flight. Keep the
   `CoinGraduatedError` catch as a backstop.
2. **AMM exit path** — build and sign the sell against the AMM pool
   (`@pump-fun/pump-swap-sdk` / `pump-swap-ix`), with slippage protection and the
   same `signAndSend` submission. Quote from the pool for the exit price.
3. **Unify the sweep** — `runPositionSweep` must re-quote graduated positions from
   the AMM pool (not the dead bonding curve) so stop-loss / trailing / take-profit /
   timeout still fire and PnL is computed against the real post-graduation price.
4. **Backfill parked positions** — provide a re-runnable path (sweep handles them, or
   a one-shot script under `scripts/`) that picks up existing
   `error='graduated:awaiting_amm_exit'` positions and exits them via the AMM. No
   position should remain parked after this ships.
5. **Wire task 03** — the discretionary `POST /api/agents/:id/trade` sell uses the
   same graduation detection + AMM routing (via the shared builders), so a manual
   sell of a graduated coin also works.
6. **Clear the error semantics** — on successful AMM exit, clear the stale
   `error`/`exit_reason='graduated'` and record the real realized PnL + signature.

## Constraints

- Real AMM quotes + real submission; honor `SNIPER_MODE=simulate` for tests (paper
  exit), live by default. No fabricated exit fills.
- Graduated sells pass the same guardrails (task 03 shared module) as any other
  trade — price-impact breaker especially matters on thin pools.
- Idempotent: re-running the sweep/backfill must not double-sell or double-record.
- Don't regress bonding-curve exits; the common case must still work unchanged.
- Errors handled at the boundary; a failed AMM exit retries with backoff and alerts
  (task 05 alerting) rather than silently re-parking.

## Success Criteria

- On devnet, a position whose coin graduates is sold automatically through the AMM;
  the position closes with real realized PnL + a confirmed signature, not parked.
- `runPositionSweep` re-quotes graduated positions from the AMM and still fires
  stop-loss/trailing/take-profit/timeout.
- The backfill clears all pre-existing `awaiting_amm_exit` positions (verified: zero
  remain).
- The discretionary sell endpoint (task 03) sells a graduated coin correctly.
- Sniper unit tests still pass; new tests cover graduation detection + AMM exit.
- `npm run typecheck` + `npm test` clean. Changelog entry (tag: fix). Run the
  **completionist** subagent on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/07-graduated-position-amm-exit.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
