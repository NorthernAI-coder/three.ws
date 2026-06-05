# R20 — Structures, snapping, and sharing

**Phase 3 (Sandbox building) · Depends on: R18, R19 · Performance-critical**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Large builds must stay performant — instance/merge static blocks.

## Goal

Level up building: a grid/snap system so blocks align into structures, a few composite pieces, a
copy/screenshot-a-build share action, and a small "featured builds" surface per coin. Building feels
satisfying and snaps cleanly; large builds stay smooth.

## Files

- `src/game/coincommunities.js` — grid/snap math, composite-piece placement, static-block
  instancing/merging, screenshot capture.
- `src/game/coincommunities-ui.js` — composite-piece palette entries, share action, featured-builds
  surface.
- `src/game/coincommunities.css` — styling for the above using `cc-*` tokens.
- `api/` / `workers/` — a "featured builds" + share endpoint reusing the R17 persistence layer (no
  new provider).

## Spec

1. **Grid/snap** — blocks snap to a grid so they align into clean structures; snapping is visible in
   the ghost preview from R18. Rotation snaps too.
2. **Composite pieces** — a few ready-made pieces (wall, floor, ramp, door) placeable as single
   units, built on the same `obj:spawn` channel.
3. **Performance** — instance or merge static blocks so large builds don't tank framerate. No
   per-block draw-call explosion; no console warnings under a big build.
4. **Share** — a copy/screenshot-a-build action (capture the canvas + a shareable reference), wired
   through the R17 persistence layer.
5. **Featured builds** — a small per-coin "featured builds" surface (designed empty/loading/error
   states) that links back into the world.

## Definition of done

- Building structures is satisfying and snaps cleanly; composite pieces place as units.
- Large builds stay performant (instanced/merged); no console warnings.
- You can share a build; the featured-builds surface is live and links back into worlds.
- Verified in a real browser with a large build. Diff self-reviewed per the R00 / CLAUDE.md DoD.
