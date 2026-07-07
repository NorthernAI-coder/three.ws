# R21 — Cosmetics catalog + shop UI

**Phase 4 (Avatar economy) · Depends on: R03 · Unblocks: R22**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Real endpoint, no sample arrays. Coin references are `$THREE` only. Live preview via R03.

## Goal

Define a cosmetics catalog and a shop UI to browse it, filter by rarity, and **preview cosmetics
live on your own avatar** before buying — with correct owned vs locked states.

## Files

- A real catalog source — a JSON/API endpoint under `api/` (or the existing data pattern) covering
  the accessory GLBs in `public/accessories/` + a set of premium emotes/skins. Each item:
  `id, name, slot, price, rarity, previewImage`. No hardcoded sample arrays in the client.
- `src/game/coincommunities-ui.js` (or a dedicated shop module) — the shop UI.
- `src/game/coincommunities.css` — shop styling using the existing `cc-*` tokens.
- `src/game/coincommunities.js` — live preview hook calling R03's `equipCosmetic` / `unequip`.

## Spec

1. **Catalog** — a real endpoint returns the catalog (accessory GLBs + premium emotes/skins) with
   `id, name, slot, price, rarity, previewImage`. Client fetches it; no sample fallback array.
2. **Shop UI** — browse the catalog, filter by rarity, matching the `cc-*` design tokens. Items show
   hover/active/focus; designed empty/loading (skeletons)/error states.
3. **Live preview** — selecting an item previews it **live on your own avatar** using the R03 rig
   (`equipCosmetic`), and reverts on deselect (`unequip`). Preview does not persist a purchase.
4. **Owned vs locked** — items already owned show as owned; not-yet-owned show locked with price.
   (Ownership read is wired to real state in R23; here, read whatever ownership source exists and
   degrade gracefully if empty.)
5. **Prices** — denominated for the R22 x402 flow. Any coin reference is `$THREE` only.

## Definition of done

- Catalog loads from a real endpoint (no sample array); live preview works on your avatar and
  reverts cleanly.
- Owned/locked states correct; rarity filter works; polished empty/loading/error states.
- No console errors/warnings. Verified in a real browser. Diff self-reviewed per the R00 / CLAUDE.md DoD.
