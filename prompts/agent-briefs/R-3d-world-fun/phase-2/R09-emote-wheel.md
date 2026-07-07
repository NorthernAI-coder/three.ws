# R09 — Emote wheel (expose all 70 animations)

**Phase 2 (Social playground) · Depends on: nothing (uses existing emote broadcast + lazy-load)**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Reuse the existing emote broadcast path and the animation manager's lazy loading.

## Goal

Replace/augment the 6-button emote tray with a radial **emote wheel** that exposes all categories
from `public/animations/manifest.json` (dances, flips, poses, combat, social). Keep the quick tray
for the top 6.

## Files

- `src/game/coincommunities-ui.js` — the radial wheel UI (open/select/release), category arcs,
  labels/icons; keep the existing quick tray.
- `src/game/coincommunities.css` — wheel styling using existing `cc-*` tokens.
- `src/game/coincommunities.js` — input handling (key/long-press/gamepad) and playing+broadcasting
  the chosen clip via the existing emote path.

## Spec

1. **Wheel interaction** — hold a key / long-press to open, move to select a segment, release to
   play. Smooth open/close transitions (opacity + transform). Top 6 stay in the existing quick tray.
2. **Categories** — read `public/animations/manifest.json` and group clips into category arcs
   (dances, flips, poses, combat, social) with labels/icons. All 70 emotes must be reachable.
3. **Lazy-load** — clips load on first use (the animation manager already supports this); don't
   preload all 70.
4. **Input** — keyboard, touch, **and** gamepad friendly. Selection plays the clip and broadcasts
   via the existing emote path so others see it.
5. **Accessibility** — screen-reader labels on segments, keyboard navigation, focus indicators,
   sufficient contrast on arcs/labels.

## Definition of done

- Wheel opens smoothly; every manifest emote is reachable and categorized; selection plays and
  broadcasts via the existing emote path.
- Keyboard + touch + gamepad all work; accessible (labels, focus). Clips lazy-load.
- No console errors/warnings, no jank. Verified in a real browser. Diff self-reviewed per DoD.
