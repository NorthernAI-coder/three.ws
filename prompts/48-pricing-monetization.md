# 48 · Pricing & Monetization Surfaces

## Mission
Make money clearly and fairly: transparent pricing, working paid tiers, creator monetization, and
$THREE perks — all consistent, all real, all converting.

## Context
- Monetization spans: Forge quality tiers + pay-per-generation (x402), $THREE holder perks (prompt 30),
  skill licenses + pay-what-you-want + creator payouts + affiliate breakdown (recent commits),
  marketplace (prompt 19), MCP paid tools (prompt 31).

## Tasks
1. **Pricing page:** a clear, honest pricing/plans page (free vs $THREE-holder vs pay-per-use) with
   what each unlocks; reachable from nav/footer; no contradictory prices across surfaces.
2. **Paid tiers:** every paid feature's purchase/unlock path works end-to-end (x402 USDC); receipts;
   immediate entitlement. No paywall that dead-ends.
3. **Creator monetization:** listing, pay-what-you-want, payouts, and affiliate breakdown are accurate
   and reconcile with real settlement; creators can see + withdraw earnings.
4. **$THREE perks:** consistent with prompt 30; the value of holding is clearly communicated where
   relevant without overpromising.
5. **Consistency:** one canonical price source per item; the same price everywhere it's shown.
6. **Conversion:** upgrade/upsell moments are well-placed + non-annoying; instrument them (prompt 45).

## Acceptance
- A clear pricing page; every paid path works with USDC + receipts + immediate entitlement.
- Creator earnings/affiliate/payouts reconcile with real settlement; prices consistent everywhere.
- $THREE perk value communicated accurately; upsells instrumented; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No fake prices/mock checkouts; settle in USDC. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/48-pricing-monetization.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
