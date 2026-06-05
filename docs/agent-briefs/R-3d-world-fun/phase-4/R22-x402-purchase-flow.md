# R22 — x402 purchase flow

**Phase 4 (Avatar economy) · Depends on: R21 · Unblocks: R23, R25 · Real payment rail**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. **Real USDC via x402 — no fake "purchased" toasts.** Reuse `api/x402/` + `agent-payments-sdk/`.

## Goal

Wire real purchases: buying a cosmetic triggers an x402 USDC payment, and on success records
ownership to the player's account/wallet. Handle every payment state honestly at the boundary.

## Files

- `api/x402/` — a cosmetic-purchase endpoint following the existing x402 handler patterns in this
  folder (e.g. `dance-tip.js`, `asset-download.js`). Reuse `agent-payments-sdk/` for the payment
  build/verify.
- A real ownership record store — use the same persistence the rest of the economy uses (inspect;
  no new provider). Record `(account/wallet, cosmeticId)` on verified payment.
- `src/game/` shop module from R21 — invoke the x402 flow on "Buy" and react to each state.

## Spec

1. **Buy → x402** — clicking Buy initiates a real x402 USDC payment for the item's price, reusing
   `api/x402/` + `agent-payments-sdk/`. Follow the existing x402 request/verify contract (see memory
   `sdk-agentclient-x402-contract` and the sibling handlers).
2. **On success** — verify the payment server-side, then record ownership to the player's
   account/wallet in the real store. Ownership must be readable by R21 (owned state) and R23
   (inventory).
3. **Honest states at the boundary** — handle and surface: pending, success, failure, and
   insufficient-funds. No optimistic "purchased" toast before the payment verifies.
4. **No double-charge / replay** — idempotent on the payment proof (see the x402 hardening invariants
   in memory `x402-security-hardening`): proof-bound idempotency, fail-closed defaults.
5. **$THREE only** in any coin-facing copy; USDC is the payment asset via x402.

## Definition of done

- A real USDC payment unlocks the cosmetic; ownership persists and is readable downstream.
- All payment states (pending/success/failure/insufficient-funds) are handled and surfaced
  honestly; no fake toasts; idempotent against replay.
- Verified end-to-end against the real x402 rail. Diff self-reviewed per the R00 / CLAUDE.md DoD.
