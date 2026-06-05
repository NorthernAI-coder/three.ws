# R18 — Build mode + placement UI

**Phase 3 (Sandbox building) · Depends on: R01, R02 · Unblocks: R19, R20**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Reuse the R02 object channel + `kind` registry. Placement is `obj:spawn kind:'block'`.

## Goal

A "Build" toggle in `/play` that opens a palette of placeable props/blocks. Ghost-preview the piece
at a snapped position under the cursor/reticle, rotate it, place it, and delete your own pieces.
Clean enter/exit between movement and build cursor.

## Files

- `src/game/coincommunities-ui.js` — Build toggle + palette UI.
- `src/game/coincommunities.css` — palette + ghost-preview styling using `cc-*` tokens.
- `src/game/coincommunities.js` — build-mode state machine, ghost preview, raycast placement,
  rotate, place (`spawnObject kind:'block'`), delete-own.
- `src/game/world-objects.js` — register block/prop mesh factories in the R02 `kind` registry.

## Spec

1. **Build toggle** — enters build mode: switches from movement controls to a build cursor/reticle,
   shows the palette. Exiting restores normal movement. The transition is unambiguous (cursor,
   HUD hint).
2. **Palette** — a handful of primitives + a few GLB props (reuse accessory/prop loading patterns).
   Owned/selected states; hover/active/focus on items.
3. **Ghost preview** — show a translucent preview of the selected piece at a **snapped** position
   under the cursor/reticle. Rotate with a key. The preview clearly indicates a valid vs blocked
   placement.
4. **Place** — sends `obj:spawn kind:'block'` (via R02 `community-net.spawnObject`); the piece
   appears for everyone through object sync.
5. **Delete** — remove **your own** pieces (full server-side ownership enforcement is R19; here,
   only offer delete on pieces you placed).
6. **Touch + desktop** — placement, rotate, and delete all work on desktop and touch.

## Definition of done

- You can place, rotate, and remove pieces; preview is clear; placements appear for everyone via
  object sync. Feels good on desktop and touch.
- Clean enter/exit of build mode (movement vs build cursor never conflict).
- No console errors/warnings, no leaks. Verified with two clients. Diff self-reviewed per DoD.
