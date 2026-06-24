# 30 · $THREE Holder Gating — Consistency & Correctness

## Mission
$THREE holder perks (e.g. Forge high-quality, free-generation multipliers, premium features) must be
gated consistently and correctly everywhere, with a clean unlock/upsell path and a wallet-aware access matrix.

## Context
- $THREE CA: `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Perks appear in Forge (quality tiers,
  "hold for up to 10× free generations"), and likely other premium surfaces.
- Wallet-aware access matrix drives perk lines + connect-wallet CTAs (e.g. `updatePerkLine` in forge).

## Tasks
1. **Inventory perks:** list every feature gated by $THREE holding (threshold, benefit). Confirm each
   reads from one canonical access-matrix/util, not ad-hoc per-surface logic.
2. **Correct balance checks:** holdings read from the real on-chain balance (Solana); thresholds
   correct; caching sane; refresh on wallet change.
3. **Unlock + upsell UX:** non-holders see a non-blocking upsell + a reachable connect-wallet path;
   holders who haven't connected can reveal their perk; states never dead-end.
4. **Pay-per-use alternative:** where a perk is also pay-per-use (e.g. Forge high quality), the x402
   path works as an alternative to holding.
5. **Consistency:** identical thresholds + messaging across surfaces; no surface that ignores gating or
   gates differently.
6. **Tests:** unit-test the access matrix (holder/non-holder/threshold-edge/disconnected); never
   reference any non-$THREE token.

## Acceptance
- One canonical gating util used everywhere; thresholds + copy consistent across all gated surfaces.
- Holder/non-holder/pay-per-use paths all work; perk lines + connect CTAs correct and reachable.
- Access-matrix tests green; clean console; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference another token. No mocks of balance/gating logic. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/30-three-holder-gating.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
