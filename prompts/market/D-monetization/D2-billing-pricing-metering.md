# D2 — Production Billing: Pricing, Metering, Invoices & AWS Marketplace

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:**
`D1-three-holder-value-system.md` — pricing applies the holder discount from D1's tier ladder.

## Why this matters for $1B

A platform is "trusted with money" only when its books balance. Right now revenue accrues in
fragments — a fee here, a royalty ledger there, a payout endpoint elsewhere — with no single
pricing surface a customer can read, no usage meter they can audit, and no invoice/receipt
they can expense. Enterprises buying through **AWS Marketplace** (the deps are installed:
`@aws-sdk/client-marketplace-metering`, `@aws-sdk/client-marketplace-entitlement-service`)
will not sign without metered billing and entitlement checks that actually call AWS. Real,
reconciled billing is the difference between "we charge sometimes" and a revenue line an
acquirer can underwrite at a multiple. This prompt makes the meter real, the invoice real, and
the AWS path real.

## Current state (read before you write)

- `api/billing/` — `fee-info.js` (public fee rate via `getFeeBps`), `revenue.js` (aggregated
  per-agent earnings dashboard), `receipts.js`, `summary.js`, `payout-wallets/`,
  `withdrawals/`. `tests/billing.test.js` exists. Read each — what's a real ledger query vs. a
  display stub.
- `api/_lib/fee.js` — `getFeeBps`, the platform fee rate. `api/config.js` — public client
  config (the pattern for surfacing capability flags to the browser).
- `api/aws-marketplace/` — `register.js`, `link.js`, `issue-key.js`, `subscription.js`; page
  `pages/aws-marketplace/welcome.html`. **Inspect:** do these actually call the AWS Marketplace
  metering/entitlement SDKs, or do they stub the entitlement/metering record? That is the gap.
- The deps `@aws-sdk/client-marketplace-metering` and `-entitlement-service` are in
  `package.json` but **grep shows no import** — wire them.
- **The gap:** no single customer-facing pricing page; usage is not metered into a queryable
  ledger that produces invoices/receipts; the AWS Marketplace path issues keys but does not
  `BatchMeterUsage`/`MeterUsage` against AWS or check entitlements via `GetEntitlements`.

## Your mission

### 1. A real pricing surface — `pages/pricing.html`
One canonical page that reads pricing from a server source of truth (not hardcoded HTML): the
per-action USDC prices (`forge-tiers.js` `priceUsdcAtomics` is already the truth for Forge;
generalize to a `/api/pricing` endpoint that returns every priced action + the platform fee +
the holder-tier discount table from D1). Render tiers, per-action prices, the live holder
discount, and a "you hold $THREE, your price" personalization when signed in. All five states
designed. This page is what a buyer reads before they spend a cent.

### 2. Usage metering into a queryable ledger
Establish one metering primitive — `api/_lib/metering.js` — that every priced action calls
after it succeeds (`recordUsage({ userId, action, units, priceUsdcAtomics, settlementRef })`)
writing to a `usage_events` table (Postgres via `api/_lib/db.js`, the pattern `royalty.js`
already uses). It must be **idempotent** on a settlement/request key so a retried charge is
never double-metered (00b reliability bar: no double-spend). Back-link each row to its
on-chain settlement (x402) or processor reference. Wire it into the existing priced endpoints
that currently charge but don't meter.

### 3. Invoices & receipts from the ledger
Turn `api/billing/receipts.js` into a real per-charge receipt (action, units, price, fee,
holder discount applied, settlement tx link, timestamp) and add a periodic **invoice** view
(`api/billing/invoices` + a `/billing` or `/account/billing` surface) that rolls usage_events
into a statement the user can read, download (PDF or printable), and reconcile against their
wallet/card. Every line item traces to a settlement ref. Design the empty state ("no usage
yet — here's what gets billed") and the populated statement.

### 4. Wire the real AWS Marketplace metering + entitlement path
In `api/aws-marketplace/`, make the metering and entitlement calls **real**: on a metered
action, call `BatchMeterUsage`/`MeterUsage` (`@aws-sdk/client-marketplace-metering`) with the
customer's AWS identifier and the dimension/units; gate entitled features by `GetEntitlements`
(`@aws-sdk/client-marketplace-entitlement-service`). Resolve the customer via the existing
`register.js`/`link.js` token flow. Handle the AWS error surface at the boundary (throttling,
expired entitlement) with an actionable state. Credentials come from `vercel env` / `.env`
(`AWS_*`, `AWS_MARKETPLACE_PRODUCT_CODE`); if absent, the path ships **inert** (like the fee
module) and never fakes a meter — never invents a metering record AWS didn't accept.

### 5. Reconciliation — the books must balance
Add a reconciliation pass (a script under `scripts/` or a worker) that cross-checks
`usage_events` settlement refs against actual on-chain USDC settlements (and AWS metering
acknowledgements) and flags any usage with no matching settlement, or settlement with no
usage. Surface the reconciliation status on the revenue dashboard so an operator can see "all
charges reconciled" vs. "N unreconciled." This is the trust bar made concrete.

### 6. Test the money paths
Extend `tests/billing.test.js`: metering idempotency (a duplicate settlement key meters once),
invoice rollup math (sum of line items = statement total, fee + holder discount applied
correctly), and the AWS metering call shape (mock the AWS client at the SDK boundary in tests
only — never a fake meter in product code). Money math has tests.

## Definition of done

Clears 00b-the-bar.md's monetization bar ("revenue surfaces … actually charge, actually
settle, actually reconcile") and the trust/correctness bar (idempotent, no double-charge,
inputs validated at the boundary). Inherits the global definition of done in
`00-README-orchestration.md`. Specifically: a pricing page reads server truth and shows the
holder price; every priced action meters idempotently into one ledger; receipts and an invoice
statement reconcile to settlements; the AWS path calls real metering/entitlement SDKs (or ships
inert without faking); `npm test` green; verified with a real charge end-to-end.

## Operating rules (override defaults)

No mocks/fake data/placeholders/TODOs/stubs. **`$THREE` is the ONLY coin** — never name,
hardcode, or recommend any other token (runtime user-launch mints are the sole mechanical
exception per CLAUDE.md). Design tokens only. Stage explicit paths only (never `git add -A`).
Own the billing lane (`api/billing/*`, `api/aws-marketplace/*`, the pricing page, the metering
lib); extend `api/_lib/fee.js` and consume D1's tier helper — don't rewrite the fee or tier
modules.

## When finished

Self-review (CLAUDE.md's five checks). Ship one improvement (e.g. an invoice PDF download, or a
"reconciled" badge on the revenue dashboard). Append a `data/changelog.json` entry
(holder-readable, tag `feature`) since pricing/invoices are user-visible. Then delete this
prompt file (`prompts/production-campaign/D-monetization/D2-billing-pricing-metering.md`) and
report what you shipped + the seam for the next agent (the `recordUsage` contract and the
`/api/pricing` shape D3/D4 meter and price against).
