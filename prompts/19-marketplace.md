# 19 · Marketplace — Agents, Skills, Avatars

## Mission
A trustworthy, liquid marketplace where users discover and buy access to agents, skills, and avatars
from other creators — with real listings, real prices, real purchase flows, and clear ownership.

## Context
- Marketplace surfaces under `src/` + `pages/`; purchases settle via x402 (USDC) and/or on-chain
  skill licenses; creator payouts + affiliate breakdowns exist (recent commits).
- Item types: agents, skills (1/1 SPL NFT license), avatars/accessories.

## Tasks
1. **Listings:** real data from the catalog APIs; pagination, sorting, filtering, search within the
   marketplace; every card links to a real detail page (no dead links — prompt 02).
2. **Detail pages:** complete info (preview, price, creator, reputation, reviews), with a working
   buy/access CTA and all states (loading/empty/error/sold/owned).
3. **Purchase flow:** x402 USDC purchase + on-chain skill license mint where applicable; idempotent,
   no double-charge; clear receipts; ownership reflected immediately after purchase.
4. **Creator side:** list/manage items, see sales + affiliate breakdown + payouts; pay-what-you-want
   pricing where supported.
5. **Reviews + reputation:** real reviews; ERC-8004 reputation surfaced; no fake/seed reviews shipped.
6. **Cross-links:** marketplace ↔ agent profiles, gallery, launches (second-order wiring per CLAUDE.md).

## Acceptance
- Browse → detail → buy → owned round-trips with real USDC/x402 + license mint; no double-charge.
- Creator dashboard shows real sales/affiliate/payout data; reviews + reputation real.
- All states designed; no dead links; clean console; responsive; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs (no seeded reviews/listings in prod). $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — purchases settle in USDC; never reference any other token. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
