# 20 — Marketplace, skills & purchase flow

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Surface completeness
**Owns:** `marketplace/`, `pages/marketplace.html`, skill purchase/license paths, `api/_lib/skill-license-onchain.js`, `contracts/skill-license/`, "My Collection".
**Depends on:** Phase 0–1.  ·  **Parallel-safe with:** 18, 19, 21–24.

## Why this matters for $1B
The marketplace is where value changes hands — buy, sell, remix agents and skills. A
trustworthy, complete purchase flow with real on-chain licensing is a direct revenue
engine and a core fundability story. Related specs: `prompts/monetization/`.

## Mission
Make discovery, purchase, ownership, and remixing of agents and skills fully real,
linked, and trustworthy — including the on-chain skill-license path.

## Do this
1. **Discovery:** marketplace listing with real data, sorting/filtering, designed
   empty/loading/error states; every card links to a real agent/skill profile.
2. **Purchase:** the skill purchase flow completes with real payment and grants access;
   verify the on-chain license (`api/_lib/skill-license-onchain.js`, the Anchor program
   in `contracts/skill-license/` minting a 1/1 SPL NFT + `SkillLicense` PDA).
3. **Ownership:** "My Collection" reflects purchases; access checks are enforced
   server-side (ties to prompt 07).
4. **Remix/sell:** remixing an agent and listing one for sale work end to end with
   correct attribution/royalties where applicable.
5. Cross-link: marketplace ↔ agent profiles ↔ launch history so the platform feels
   wired together, not siloed.
6. Edge cases: 0 listings, sold-out, payment failure mid-flow, duplicate purchase.

## Must-not
- No fake "buy" buttons; no client-trusted access grants; no orphan listings.

## Acceptance
- [ ] Buy → license → access → appears in My Collection verified with real payment.
- [ ] On-chain license mints and gates access; remix/sell flows work; states designed.
- [ ] `npm test` green; changelog `feature`/`improvement` entry.
