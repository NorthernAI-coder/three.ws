# Track D — Monetization & $THREE Economy

**Goal:** turn users into **real, reconciled revenue**. Not pricing pages that don't bill,
not paid endpoints that don't settle, not "holder perks" that mean nothing on the page next
door. Every dollar this track touches is quoted to the user, charged on a real rail, settled
on-chain or through a real processor, and **reconciled** against a ledger you can audit. The
$1B thesis pillar this owns is *monetization depth*: revenue × multiple = valuation, and a
multiple only exists when the revenue is real and the books balance.

The platform already has the bones: holder tiers (`api/_lib/three-tier.js`,
`three-access.js`), a fee module (`api/_lib/fee.js`, `marketplace-platform-fee.js`), royalty
ledger (`api/_lib/royalty.js`), payouts (`api/_lib/payout.js`, `api/billing/`), an x402
catalog at `/.well-known/x402.json` (`api/wk.js`), and ~28 paid endpoints under `api/x402/`.
This track **completes and connects** them — it does not rewrite the payment plumbing.

**The only coin is `$THREE`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). It appears
nowhere as a recommendation outside that one address; no other token appears anywhere — code,
copy, tests, fixtures. Runtime user-launch mints are the sole mechanical exception (CLAUDE.md).

---

## Prompts

| # | File | Mission (one line) |
|---|---|---|
| **D1** | `D1-three-holder-value-system.md` | One $THREE-holder value system — balance → tier → perks → upgrade path — applied identically on every gating surface. Foundational. |
| **D2** | `D2-billing-pricing-metering.md` | Real billing: a pricing surface, usage metering, invoices/receipts, and the AWS Marketplace metering + entitlement path. Real charges, real reconciliation. |
| **D3** | `D3-x402-paid-endpoints-network.md` | Complete and verify the x402 paid-endpoint network + discovery indexing (CDP Bazaar / x402scan / 402index). Every paid endpoint quotes price, settles USDC, is discoverable. |
| **D4** | `D4-marketplace-economics.md` | Marketplace economics: platform fees, creator royalties, payment splits (@0xsplits/splits-sdk), creator payouts, on-chain skill licenses. Trustless where possible. |

## Run order

```
D1 (holder value system)  ← FOUNDATIONAL. Run first.
  │   one helper, one tier ladder, one upgrade UX — everything else gates and prices off it
  ├── D2 (billing / pricing / metering)   ← consumes D1 tier discounts in the priced ledger
  ├── D3 (x402 paid network + discovery)  ← consumes D1 tier discounts at quote time
  └── D4 (marketplace economics)          ← consumes D1 tiers for creator perks; D2 ledger for payouts
```

D1 is the gate: it establishes the single tier ladder, the single balance/tier helper, and
the single upgrade UX that D2's pricing, D3's quotes, and D4's creator perks all reference.
Run D1 to completion first. D2–D4 may then run in parallel; each reads D1's contracts, never
forks its own copy of "what does holding $THREE get you."

## File-ownership map

Stage explicit paths only — never `git add -A`. Shared files (`data/changelog.json`) are
append-only. Lanes:

| Prompt | Owns (edit freely) | Reads / extends (do not rewrite) |
|---|---|---|
| **D1** | `api/_lib/three-tier.js`, `three-access.js`, `three-gate.js`, a shared client gate module under `public/`, the `/account`-tier surface | `forge-tiers.js`, `holder-pass.js`, `balances.js` |
| **D2** | `api/billing/*`, a pricing page under `pages/`, `api/aws-marketplace/*`, a metering/entitlement lib in `api/_lib/` | `api/_lib/fee.js`, `api/config.js`, D1's tier helper |
| **D3** | `api/x402/*`, `api/wk.js`, `.well-known/x402.json` build path, `scripts/verify-x402-discovery.mjs`, a registration script | `public/x402*.js`, `api/x402-checkout.js`, D1's tier helper |
| **D4** | `api/_lib/royalty.js`, `payout.js`, `marketplace-platform-fee.js`, a splits lib in `api/_lib/`, `contracts/skill-license/*`, `api/_lib/skill-license-onchain.js`, `api/creators/*` | D1's tier helper, D2's ledger |

When this directory contains only `00-README.md`, Track D is done.
