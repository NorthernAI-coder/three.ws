# B03 — Payment modal + Jupiter swap production pass

> Phase B · Depends on: A11 (shared modal) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
These two flows handle real money: the skill/asset payment modal and the token swap.
Any rough edge here is a direct revenue leak and a trust hit. Harden both to bank-grade
reliability and clarity across wallets, networks, and failure modes.

## Where this lives (real files)
- `src/payment-modal.js` (~728 lines) — skill purchase, wallet connect, USDC balance, settle.
- `src/swap-jupiter.js` (~962 lines) — one-click swap (USDC ↔ assets), multi-chain.
- `api/x402/` + `api/_lib/x402/` — settlement.
- `src/wallet-auth.js` — wallet/session.

## Current state & gaps
- Payment: wallet-connect errors are generic; no retry UI; insufficient-funds flow not validated across all wallets; no timeout handling for a hung payment.
- Swap: network-switch errors not surfaced; quote timeout/refresh missing; cross-chain bridge failures can show a blank state; slippage warnings missing on volatile pairs.

## Build this
1. **Payment modal:** specific, recoverable errors (network vs balance vs rejected); explicit retry / switch-wallet; insufficient-funds → top-up; bounded timeout with a clear "still pending / cancel" state; success shows a verifiable receipt.
2. **Swap:** quote freshness with auto + manual refresh and a countdown; explicit network-switch handling; bridge/cross-chain failures surface a real error + retry, never a blank; slippage + price-impact warnings; min-received shown.
3. **Wallet matrix:** verified on Phantom + Solflare (and document any wallet-specific quirks); graceful path when no wallet is installed.
4. **A11y + mobile:** focus trap, ESC to close, keyboard operable, amount entry usable at 320px.
5. **Telemetry:** record payment/swap attempts + outcomes (success/fail/reason) for G06.

## Out of scope
- The universal 402 handler structure (A11) — this hardens the modal internals it reuses.

## Definition of done
- [ ] Every error is specific + recoverable; timeouts handled; receipts verifiable.
- [ ] Swap shows fresh quotes, slippage/impact, min-received; bridge failures handled.
- [ ] Verified on Phantom + Solflare, desktop + 320px, keyboard-only.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Pay with: empty balance, rejected signature, network mismatch, and success — each shows the right state.
- Swap a volatile pair: see slippage warning + min-received; force a stale quote → refresh works.
