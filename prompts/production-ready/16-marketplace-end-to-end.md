# 16 — Marketplace, end-to-end

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 2 — Product surface completeness
**Owns:** `marketplace/`, `pages/marketplace*.html`, skill APIs (`api/skills/*`, `api/_lib/skill-*.js`), `prompts/monetization/` outcomes.
**Depends on:** `12`, `17`, `18`. Pairs with `32`.

## Why this matters for $1B
A marketplace is a flywheel: creators list, buyers buy, both stick. Marketplace
GMV is the headline metric a $1B 3D-agent platform is valued on. It must be
trustworthy, fast, searchable, and conversion-optimized.

## Mission
A complete, polished marketplace: browse → discover → evaluate → purchase → own →
use, with sorting/filtering/search, real listings, and airtight purchase flows.

## Map
- `marketplace/` dir + `pages/` marketplace surfaces. Skill purchase + on-chain
  licenses: `api/skills/*`, `api/_lib/skill-access.js`, `skill-license-onchain.js`,
  `skill-nft.js`, `skill-price-cache.js`, `skill-pricing-rules.js`, `skill-runtime.js`;
  `contracts/skill-license/` (each purchased skill = a 1/1 SPL NFT + `SkillLicense`
  PDA). Existing monetization prompts: `prompts/monetization/`.

## Do this
1. **Discovery:** listings load from real data with sorting (price, recency,
   popularity, rating) and filtering (category, price range, chain, creator). Add
   real search with sensible relevance. `/CLAUDE.md` innovation standard: if list
   views lack sorting, add it.
2. **Listing detail:** rich, accurate detail page — 3D preview, description, price,
   creator (links to agent profile, prompt `17`), reviews/ratings if present,
   ownership state. Every claim backed by real data.
3. **Purchase flow:** end-to-end with real payments (x402 / Solana Pay, prompt `18`).
   States: prepare → pay → confirming (poll) → owned. Idempotent, replay-safe,
   server-side price via `skill-pricing-rules.js`/`skill-price-cache.js` (prompt `07`).
   On success, the buy button becomes "Owned" and the skill/asset is actually usable.
4. **Ownership & licenses:** reflect on-chain `SkillLicense` state truthfully (via
   `skill-license-onchain.js` / `skill-access.js`); gate access by the real license,
   handle pending/confirmed/failed clearly.
5. **Creator side:** list/edit/unlist flows, pricing, and creator analytics (sales,
   revenue, views) — real data, designed empty states for new creators.
6. **Trust & safety:** report/flag listings, basic content checks (ties to prompt
   `36`), and clear refund/dispute messaging where relevant.
7. **States & scale:** designed loading/empty/error (prompt `12`); paginate/virtualize
   large catalogs (prompt `10`); 0/1/many handled.
8. Add E2E tests for browse + purchase (build on `prompts/monetization/23-*`).

## Must-not
- Do not show listings from sample arrays — real data only.
- Do not trust client-sent prices; recompute server-side.
- Do not mark a purchase complete before on-chain/payment confirmation.
- Do not reference any coin other than `$THREE` in copy (runtime user-launched mints in launch feeds are the allowed exception).

## Acceptance
- [ ] Browse with working sort + filter + search over real listings.
- [ ] Listing detail accurate, with 3D preview and creator link.
- [ ] Purchase flow end-to-end with real payment, idempotent, correct states, real ownership unlock.
- [ ] License/ownership reflects on-chain truth; access gated correctly.
- [ ] Creator list/edit/unlist + analytics work with designed empty states.
- [ ] Report/flag + scale handling present; E2E purchase test green.
