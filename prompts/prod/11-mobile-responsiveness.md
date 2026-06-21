# 11 — Mobile responsiveness

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 1 — Cross-cutting hardening
**Owns:** all `pages/*.html`, `src/` UI, `public/` shared UI + CSS.
**Depends on:** `02`, `13`. Pairs with `09`, `12`.

## Why this matters for $1B
Most first-touch traffic is mobile. Recent git history shows the tour and walk
companion were "effectively broken on phones" until fixed — treat that as a signal
that mobile coverage is uneven. A platform that breaks on phones can't go viral.

## Mission
Every page and flow works and looks intentional at 320px, 768px, and 1440px, with
real touch targets and no horizontal scroll.

## Map
- 125 pages in `pages/`. Mobile-sensitive surfaces flagged in git history: feature
  tour (`src/feature-tour/`), walk companion (`src/walk-companion.js`), nav
  (`public/nav.js` — mobile menu), payment modals, forge (`pages/forge.html`).
- Audio/interaction gotcha: mobile browsers block audio until a tap, and the
  permission resets per page — the tour already handles this; preserve that pattern.

## Do this
1. Sweep every page at 320 / 375 / 768 / 1024 / 1440 (Playwright device emulation +
   real-device spot checks). Capture: horizontal overflow, clipped content, unreadable
   text, overlapping elements, off-screen controls, tiny tap targets.
2. Fix layout with fluid units, fl/grid, and `clamp()` — not fixed widths. Eliminate
   every source of horizontal scroll.
3. **Tap targets ≥ 44×44px** with adequate spacing. Audit all icon buttons, tabs,
   close buttons, and dense control rows.
4. **Reachability:** confirm every desktop action has a mobile equivalent. Any control
   that lives only in a collapsing desktop nav must also appear in the mobile menu
   (this exact bug hit the walk companion — re-audit for siblings).
5. **Modals/sheets:** payment, share, settings, and tour overlays fit small screens,
   scroll internally if needed, and have phone-sized controls.
6. **3D on mobile:** model-viewer/canvases are touch-orbitable, sized to viewport,
   and don't overheat/jank low-end devices; provide a lighter path if needed.
7. **Forms/keyboards:** correct `inputmode`/`type`, no zoom-on-focus jump (16px+ font
   on inputs), visible submit above the on-screen keyboard.
8. **Safe areas:** respect notches/home indicators (`env(safe-area-inset-*)`).
9. Add mobile-viewport assertions (no overflow, tap-target size) to the Playwright
   sweep.

## Must-not
- Do not hide functionality on mobile instead of adapting it.
- Do not ship sub-44px tap targets or fixed-width layouts.
- Do not regress the tour's per-page audio-unlock handling.

## Acceptance
- [ ] Every page clean at 320/768/1440 — no horizontal scroll, no clipping/overlap.
- [ ] All tap targets ≥ 44×44px with spacing.
- [ ] Every desktop action reachable on mobile (incl. nav-collapsed controls).
- [ ] Modals/overlays and 3D canvases usable on phones.
- [ ] Forms behave with on-screen keyboards; safe areas respected.
- [ ] Mobile-overflow + tap-target assertions in CI sweep.
