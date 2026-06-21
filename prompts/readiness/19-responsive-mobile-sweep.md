# 19 — Responsive / mobile sweep

**Phase 5. [parallel-safe]** with 18, 20–21.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform, 125 pages. Read
[CLAUDE.md](../../CLAUDE.md) — "Responsive by default. Test at 320px, 768px, and
1440px mentally. Relative units. Flex/grid over fixed widths." There is a PWA
(`generate-icons`, theme-boot). The only coin is **$THREE**.

## Objective

Every surface works and looks intentional at 320px, 375px, 768px, 1024px, and
1440px+: no horizontal scroll, no overlapping/clipped content, tap targets ≥
44px, readable type, working mobile navigation, and 3D that's usable with touch.

## Why it matters

Most of the audience for a viral crypto/AI product arrives on a phone — often via
a shared link. If the landing or forge experience is broken on mobile, the growth
loop dies at the first hop. Mobile polish is directly upstream of the $1B funnel.

## Instructions

1. **Audit at each breakpoint** in devtools device mode across the top surfaces
   (home, forge, marketplace, trending, agent profile, studio, walk, club,
   checkout, login, settings, chat). Log every issue: horizontal overflow,
   clipped text, overlapping elements, unreachable controls, tiny tap targets,
   broken 3D canvas sizing.
2. **Fix layout systemically.** Prefer fluid grids/flex, `clamp()` type,
   container queries where supported, and relative units over fixed px. Don't
   patch one viewport and break another — verify the fix holds across all
   breakpoints.
3. **Navigation.** Confirm a real mobile nav (hamburger/drawer) that's keyboard +
   touch accessible, closes on selection/escape, and doesn't trap scroll. Reuse
   the existing `nav.js`/`nav.css` — extend, don't fork.
4. **Touch.** Tap targets ≥ 44×44px with adequate spacing. Hover-only affordances
   need a touch equivalent. 3D viewers: pinch-zoom/drag-orbit work and don't
   hijack page scroll unexpectedly.
5. **Forms & modals on mobile.** Inputs use correct `inputmode`/`type` (numeric
   keypad for amounts), modals fit the viewport and scroll internally, the
   on-screen keyboard doesn't cover the active field or submit button.
6. **Safe areas & PWA.** Respect `env(safe-area-inset-*)` on notched devices.
   Verify the PWA installs and the icons/splash render. Theme-boot must not flash.
7. **Performance on mobile** overlaps with [12](12-frontend-performance.md) and
   [13](13-3d-asset-performance.md) — keep them consistent; don't regress CWV
   while fixing layout.
8. **Verify on real-ish conditions:** device emulation + at least one real phone
   if available. Test both portrait and landscape.

## Definition of done

- [ ] No horizontal scroll, clipping, or overlap on any top surface at 320 / 375 /
      768 / 1024 / 1440px (logged per surface).
- [ ] Mobile nav works (touch + keyboard), closes correctly, no scroll trap.
- [ ] All tap targets ≥ 44px; hover-only affordances have touch equivalents.
- [ ] 3D viewers usable with touch and don't hijack page scroll.
- [ ] Mobile forms use correct input modes; modals + keyboard don't obscure
      inputs/submit.
- [ ] Safe-area insets respected; PWA installs; no theme flash.
- [ ] CWV not regressed (cross-checked with prompt 12).
- [ ] `npm test` passes. Changelog: `improvement` entry ("Improved mobile
      experience across the platform").
