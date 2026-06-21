# Task 08 — Complete checkout (EVM, receipts, retry) + one coherent pricing surface

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track C —
> Revenue.** Pairs with `02` (funding/upsell), `06`/`07` (creator/attribution). Touches the
> x402 payment path — coordinate with `10` (payments integrity) so you don't conflict on
> idempotency/settlement.

## The thesis

Checkout is where intent becomes revenue, and three.ws's is half-built: Solana-only, no
receipt, no failed-payment recovery, no abandonment signal. Meanwhile pricing is scattered
across three subsystems with no single place a buyer (or a finance team) can understand what
things cost. A $1B business has a frictionless, recoverable checkout and one legible price
surface. Build both.

## What exists today (read first)

- **Checkout prep** — [api/x402-checkout.js](../../api/x402-checkout.js): prepares/encodes
  **Solana** transactions only. No EVM path, no email receipt, no retry-on-failure, no
  abandonment tracking. (There's a prepare test:
  [tests/x402-checkout-prepare.test.js](../../tests/x402-checkout-prepare.test.js).)
- **x402 paid endpoints + checkout core** — [public/x402.js](../../public/x402.js),
  [public/x402-pay-core.js](../../public/x402-pay-core.js), [api/_lib/x402.js](../../api/_lib/x402.js)
  and `api/_lib/x402/*`.
- **Pricing is fragmented:** Forge tiers in [api/_lib/forge-tiers.js](../../api/_lib/forge-tiers.js)
  (USDC atomics), skill pricing in [api/_lib/skill-pricing-rules.js](../../api/_lib/skill-pricing-rules.js)
  / `agent_skill_prices`, subscriptions in [api/subscriptions.js](../../api/subscriptions.js),
  holder discounts in [api/_lib/three-tier.js](../../api/_lib/three-tier.js). The public
  `pages/pricing.html` only describes seat tiers, not per-API/skill pricing.
- **Email framework exists** — [api/_lib/email.js](../../api/_lib/email.js) (Resend) already
  sends referral/verification mail; reuse it for receipts.

## What to build

1. **EVM checkout path.** Add Base/EVM payment support alongside Solana in the checkout flow
   (the platform already supports EVM payout wallets and x402 on Base — wire the buyer side).
   Real transaction prep/verify/settle; no stub.
2. **Receipts.** On confirmed payment, send a real email receipt via
   [email.js](../../api/_lib/email.js) and persist a retrievable receipt record (buyer can view
   past purchases). Real amounts, real tx links.
3. **Failed-payment recovery.** Detect failed/expired/abandoned payment attempts and offer a
   real retry path; don't leave the buyer stranded on an error. Coordinate idempotency with
   `10` so a retry can't double-charge.
4. **Abandonment tracking.** Emit `CHECKOUT_STARTED` / `CHECKOUT_ABANDONED` /
   `CHECKOUT_COMPLETED` to [src/analytics.js](../../src/analytics.js) so cart abandonment is
   measurable (it currently isn't).
5. **One pricing surface.** Build a single, accurate pricing page/section that reflects the
   **real** numbers from all four pricing subsystems (Forge tiers, skill pricing, subscriptions,
   holder discounts) — computed, not hand-copied, so it can't drift. Show the buyer their actual
   $THREE-holder discount when signed in.

## Hard rules specific to this task

- Money is real: amounts, fees, discounts, balances all from real config/chain/DB.
- **$THREE only** in token copy. USDC is settlement plumbing — fine to name as the currency.
- Don't weaken the x402 verify/settle ordering or idempotency — align with `10`.

## Definition of done

README DoD, plus: a buyer can complete a real purchase on **both** Solana and EVM, receives a
real receipt, can recover a failed attempt without double-charging, and the pricing surface
shows accurate computed prices including the holder discount; abandonment events fire. Tests
extend [tests/x402-checkout-prepare.test.js](../../tests/x402-checkout-prepare.test.js) to cover
EVM prep + the retry/idempotency guard. Changelog (`feature`). Self-review, then improve the
weakest path (likely the failure/retry UX).

Delete this file when done.
