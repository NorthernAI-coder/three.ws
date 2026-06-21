# 24 — Monetization completeness

**Phase 6. [parallel-safe]** with 22–23, 25–26.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform with real monetization
surfaces: x402 paid endpoints (`api/x402*`, `public/x402*.js`), MCP paid tools,
skill-license NFTs, pump.fun launches, the `monetize-service` / `pay-for-service`
skills, and an existing `prompts/monetization/` series. Read
[CLAUDE.md](../../CLAUDE.md). The only coin is **$THREE**
(`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); USDC is a payment rail only.

## Objective

Every money path is complete, correct, and reconcilable end-to-end: pricing is
real and consistent, checkout (x402 + any fiat onramp) works flawlessly, creators
get paid accurately, the platform's take is transparent, and every transaction is
recorded, idempotent, and auditable. No half-wired billing.

## Why it matters

Revenue is the numerator of the valuation. Investors underwrite a $1B platform on
real, growing, defensible revenue with clean unit economics — not on a checkout
that sometimes double-charges or a payout that doesn't reconcile. Money code must
be the most correct code in the repo.

## Instructions

1. **Inventory money flows.** List every way value moves: x402 pay-per-call,
   skill purchase/subscription, skill-license NFT mint, pump launches, agent
   wallet ops, SNS pay-by-name, MCP paid tools. For each, trace: quote → pay →
   verify → settle → grant access → record → (payout to creator) → reconcile.
2. **Pricing as a single source of truth.** Prices must come from one server-side
   source, never trusted from the client. Confirm the amount charged equals the
   amount quoted equals the amount in the signed payload (ties to
   [09 — security](09-security-review.md)). Support the currencies the existing
   monetization prompts define; $THREE rules apply to anything token-denominated.
3. **Checkout completeness.** The x402 checkout flow has every state designed
   (insufficient funds, rejected signature, network failure mid-payment, success)
   — coordinate with [18 — state design](18-state-design-sweep.md). If a fiat
   onramp is in scope (`prompts/monetization/25-fiat-on-ramp-integration.md`),
   verify it end-to-end, not stubbed.
4. **Idempotency & receipts.** Every settlement is idempotent (a retry never
   double-charges or double-grants — ties to
   [08](08-api-hardening.md)/[10](10-resilience-external-calls.md)). Every
   transaction produces a durable receipt the user can see and the platform can
   audit.
5. **Creator payouts.** If creators earn (skill sales, etc.), confirm payout
   accounting is correct to the lamport/cent: balances, the platform fee
   (transparent %), payout execution, and a reconciliation check that on-chain/
   ledger totals match recorded totals. Build the earnings dashboard if the
   monetization prompts specify one and it's not wired.
6. **Subscriptions / gating.** If subscriptions or token-gating exist, verify
   access is granted/revoked correctly on renew/expire/cancel, and that gating
   checks are authoritative (on-chain `SkillLicense` PDA or a verified server
   check — not a spoofable client flag).
7. **Reconciliation job.** A scheduled job that reconciles recorded revenue vs
   on-chain settlement and flags discrepancies — surfaced via
   [11 — observability](11-observability.md).
8. **Test the money paths hardest** (ties to [15 — coverage](15-test-coverage.md)):
   happy path, double-submit, partial failure, refund/clawback if supported.

## Definition of done

- [ ] Every money flow traced and complete end-to-end (quote→settle→grant→record→
      payout→reconcile); none half-wired.
- [ ] Pricing is server-authoritative; charged = quoted = signed, verified.
- [ ] x402 checkout (+ fiat onramp if in scope) has every state designed and
      works end-to-end with real payments — no stubs.
- [ ] Settlements are idempotent; every transaction yields a user-visible,
      auditable receipt.
- [ ] Creator payouts reconcile to the smallest unit; platform fee is transparent;
      earnings dashboard wired if specified.
- [ ] Subscription/gating access transitions are correct and authoritative.
- [ ] A reconciliation job flags revenue/settlement discrepancies.
- [ ] Money-path tests cover happy + double-submit + partial-failure; `npm test`
      passes.
- [ ] Changelog: `feature`/`improvement` entry for any user-facing monetization
      change ($THREE-compliant copy only).
