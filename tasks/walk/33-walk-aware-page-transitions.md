# Task 33 — Walk-Aware Page Transitions: Themed Per Destination

## Priority: MEDIUM

## Objective
Make the transition between pages thematically match the destination — e.g., walking to `/walk` triggers a "stepping into the world" zoom, walking to `/pricing` triggers a brief "store opening" effect. Subtle but memorable.

## Scope
- Module: `src/walk-companion-transitions.js` — registered by `src/walk-companion.js`
- Per-route transition presets (config table):
  - `/walk` → camera-zoom-into-avatar effect: avatar grows to fill viewport, then crossfades to walk page canvas
  - `/pricing` → curtain-pull from top
  - `/agent/*` → spotlight expand from where the link was clicked
  - `/marketplace` → corridor depth zoom
  - `/dashboard` → softer fade with subtle glow
  - default → simple fade + slide from task 32
- Each preset is a function: `(fromEl, toEl, avatarEl) => Promise<void>` that runs the animation
- Use Web Animations API (`element.animate`) — no jQuery, no framer-motion
- Respect `prefers-reduced-motion`: all presets degrade to simple fade
- Settings UI in nav toggle area: "Themed transitions on/off"

## Definition of Done
- Click `/walk` link → camera-zoom transition plays
- Click `/pricing` link → curtain-pull plays
- `prefers-reduced-motion: reduce` → all degrade to fade
- No console errors
- No layout shift after transitions complete

## Rules
Complete 100%. No stubs. No fake data. Real animations, real preference detection. Wire end-to-end.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/walk/33-walk-aware-page-transitions.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
