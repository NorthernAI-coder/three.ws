# R25 — Creator revenue splits + economy polish

**Phase 4 (Avatar economy) · Depends on: R22 · Real payouts**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. **Revenue splits must pay out for real** — no simulated earnings. Reuse the R22 x402 rail.

## Goal

On cosmetic sales tied to a coin, split x402 revenue to the coin creator's wallet (configurable %),
with a creator earnings view in the dashboard. Plus a platform-wide cosmetics leaderboard /
"rarest fits" flex surface to drive the Roblox-style status loop.

## Files

- `api/x402/` — extend the R22 purchase handler to split the settled payment to the coin creator's
  wallet by a configurable percentage (real on-chain transfer / settlement, reusing the existing
  payout rails in `agent-payments-sdk/` / `solana-agent-sdk/`).
- Split config store — configurable % per coin (existing per-coin config; no new provider).
- Dashboard — a creator earnings view (reuse the existing dashboard patterns; see memory
  `studio-fees-rewards` for the fee/earnings UI precedent).
- A leaderboard endpoint + a "rarest fits" surface in `/play` UI.

## Spec

1. **Split on sale** — when a cosmetic tied to a coin sells via R22, split the revenue to the coin
   creator's wallet by a configurable percentage. The split is a **real** transfer/settlement — no
   simulated balance.
2. **Configurable %** — per-coin split percentage (sane default, creator-adjustable), stored in the
   existing config layer.
3. **Creator earnings view** — a dashboard view showing real earnings from cosmetic sales, matching
   the existing dashboard design + the fee-claim precedent in `studio-fees-rewards`.
4. **Leaderboard / rarest fits** — a platform-wide cosmetics leaderboard and a "rarest fits" flex
   surface that drives status; it links back into the worlds where those cosmetics are worn.
5. **Honesty** — only real, settled numbers are shown; designed empty/loading/error states. `$THREE`
   only in coin-facing copy.

## Definition of done

- Revenue splits pay out for real to the creator wallet; the creator can see real earnings in the
  dashboard.
- The flex/leaderboard surface is live, accurate, and links back into worlds.
- All states designed; no simulated numbers. Verified end-to-end against the real rail.
  Diff self-reviewed per the R00 / CLAUDE.md DoD.
