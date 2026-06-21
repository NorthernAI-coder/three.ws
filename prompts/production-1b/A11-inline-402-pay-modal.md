# A11 — Inline "Payment Required" (402) pay modal everywhere

> Phase A · Depends on: A07 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
When a human (not an agent) hits a paid action, the experience must be a one-tap pay — not
a dead 402 or a redirect. A frictionless inline checkout is the difference between a curious
visitor and a paying user. Wire a single, reusable "Payment Required" modal that any surface
can invoke, backed by the real x402 flow and the Jupiter/USDC rails already in the app.

## Where this lives (real files)
- `x402-payment-modal/`, `x402-modal-sdk/` — existing payment-modal SDK/UI.
- `src/payment-modal.js` — in-app skill-purchase modal (wallet connect, USDC balance, settle).
- `src/swap-jupiter.js` — swap/funding flow (top-up if balance is short).
- `api/x402/*.js` + `api/_lib/x402/` — 402 challenge + settlement.
- Surfaces that gate on payment: forge high tiers, marketplace skills, cosmetics, mint-to-mesh, etc.

## Current state & gaps
- `payment-modal.js` exists but isn't a universal, drop-in handler for any 402; some surfaces redirect or error.
- Insufficient-balance flows aren't consistently wired to the funding/swap path across wallets.

## Build this
1. **Universal handler:** a single `openPaymentRequired({ challenge | endpoint, onPaid })` that: reads the 402 challenge (price from A07), connects the wallet, checks USDC balance, settles, and resolves with the unlocked result. Reuse `payment-modal.js`/`x402-modal-sdk`.
2. **Top-up path:** if the balance is short, route into `swap-jupiter.js`/the fund flow, then resume the payment — no dead end.
3. **Tier-aware price:** show the tier-adjusted price (A03) and any "hold more $THREE to save" nudge.
4. **All states designed:** connecting, quoting, insufficient funds (with top-up), confirming, success (with receipt/Solscan link), error (retry / switch wallet). Accessible + mobile.
5. **Adopt everywhere:** replace ad-hoc 402 handling on every paid human-facing surface with this handler. Audit and list the surfaces converted.

## Out of scope
- The agent (machine) payment path — that's the raw x402 + SDK, not this modal.

## Definition of done
- [ ] One reusable handler powers 402 checkout across all paid human surfaces (audit list provided).
- [ ] Insufficient balance flows seamlessly into top-up and resumes the purchase.
- [ ] Every state designed, accessible, responsive; success shows a verifiable receipt.
- [ ] Works on Phantom + Solflare; `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Trigger a paid action with an empty wallet → top-up → pay → unlock, all inline.
- Repeat on mobile width and with the keyboard only.
