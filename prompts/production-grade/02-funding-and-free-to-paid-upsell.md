# Task 02 — Funding on-ramp + free-to-paid upsell (close the money gap)

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track A —
> Activation.** Pairs naturally with `08` (checkout) and `06`/`07` (creator revenue), but
> stands alone. Touches `src/analytics.js` and the paywall paths — coordinate on those.

## The thesis

Users hit a wall the moment money is required: free Forge/skill quotas run out, or an x402
call needs USDC the user doesn't have, and the product just… 403s. There's no "here's how to
get USDC" and no "upgrade to keep going." Every silent rejection there is lost revenue and a
lost user. A $1B funnel makes the paid step feel like the natural next move, not a brick wall.

## What exists today (read first)

- **Pricing tiers / holder discounts** — [api/_lib/three-tier.js](../../api/_lib/three-tier.js)
  (Member/Bronze/Silver/Gold/Genesis, 0–30% discount; free-quota multipliers), and Forge tier
  prices in [api/_lib/forge-tiers.js](../../api/_lib/forge-tiers.js).
- **Checkout** — [api/x402-checkout.js](../../api/x402-checkout.js) prepares/encodes Solana
  transactions only (no EVM, no receipt, no retry — that's task `08`).
- **Wallet skills** — the harness exposes `fund`, `send-usdc`, `trade`, `authenticate-wallet`
  skills; the platform has agent custodial wallets ([api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js))
  and on-ramp touchpoints. Find the existing funding/on-ramp code before adding any.
- **Analytics** — [src/analytics.js](../../src/analytics.js) has an activation funnel and a
  `$THREE` purchase funnel but **no** `QUOTA_EXCEEDED` / `UPGRADE_PROMPTED` /
  `PAYMENT_INITIATED` events. Quota walls are currently invisible to analytics.
- **The onboarding plan** explicitly lists "close the funding gap" as Phase 2
  ([docs/onboarding/ONBOARDING-PLAN-2026-06-19.md](../../docs/onboarding/ONBOARDING-PLAN-2026-06-19.md)).

## The gap

1. No in-product "get USDC" path at the moment a user needs it.
2. Free→paid transition is a hard 403 with no upgrade CTA, no "buy 10 generations," no holder
   benefit shown ("hold $THREE for up to 10× free quota").
3. Quota hits and upgrade prompts aren't instrumented, so the biggest revenue leak is unmeasured.

## What to build

1. **Funding step at the point of need.** When a paid action lacks funds, show a real,
   inline funding flow (reuse the existing on-ramp / `fund` path — do not invent a fake one).
   Show real balance, real required amount, real options. Designed loading/error/success.
2. **Upgrade / upsell surface before any 403.** When a free quota is about to be (or just
   was) exhausted, surface an actionable CTA: the relevant price, what a purchase unlocks, and
   the holder benefit from [three-tier.js](../../api/_lib/three-tier.js) (real tier, real
   multiplier — never a fake number). Link to the pricing surface (`08`) and to `$THREE`.
   This must appear on the real quota-gated paths (Forge generation, skill unlock, any
   metered x402 lane) — audit which endpoints return quota 403s and cover them.
3. **Instrument the wall.** Add `QUOTA_EXCEEDED`, `UPGRADE_PROMPTED`, `UPGRADE_CLICKED`,
   `FUNDING_STARTED`, `FUNDING_SUCCEEDED`, `PAYMENT_INITIATED` to
   [src/analytics.js](../../src/analytics.js) and fire them at the real moments. No new vendor.
4. **Holder-aware copy.** A $THREE holder hitting a wall sees their actual multiplier and the
   next tier's benefit — turning the wall into a reason to hold more, not a dead end.

## Hard rules specific to this task

- **$THREE is the only coin** anywhere in funding/upsell copy and links. USDC is settlement
  plumbing (fine); never name or link any other token. Holder benefits reference $THREE only.
- Every amount, balance, quota, and multiplier is **real** (live balance / DB quota / tier
  lookup). No fabricated "$1,234" anywhere.

## Definition of done

README DoD, plus: a user with zero USDC can reach a working funding flow from a paywall; a
user out of free quota sees a real, accurate upgrade CTA before being blocked; the new
analytics events fire (verify in Network/analytics debug); holder vs non-holder copy both
correct. Changelog (`feature`). Self-review, then improve the weakest moment in the flow.

Delete this file when done.
