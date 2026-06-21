# 09 — Accessibility (WCAG 2.2 AA)

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 1 — Cross-cutting hardening
**Owns:** all `pages/*.html`, `src/` UI components, `public/` shared UI (nav, modals, tour, walk companion).
**Depends on:** `02` (dead paths). Pairs with `11`, `12`, `13`.

## Why this matters for $1B
Accessibility is required for enterprise/government sales, reduces legal risk, and is
explicitly non-optional in `/CLAUDE.md`: "Semantic HTML. ARIA labels. Keyboard
navigation. Sufficient color contrast. Focus indicators." It also just makes the
product better for everyone.

## Mission
Bring the whole site to WCAG 2.2 AA: keyboard-operable, screen-reader-coherent,
sufficient contrast, visible focus, respects reduced-motion.

## Map
- 125 pages in `pages/`. Shared interactive UI: `public/nav.js`, payment modals
  (`public/x402*.js`), feature tour (`src/feature-tour/`), walk companion
  (`src/walk-companion.js`, `walk-sdk/`).
- Design tokens live in the global stylesheet (`public/` CSS, `style.css`) — fix
  contrast at the token level where possible (coordinate with prompt `13`).

## Do this
1. Run automated audits (axe-core / Lighthouse a11y) across every page; capture
   violations. Automated catches ~30% — also do manual keyboard + screen-reader
   passes on the top 15 flows (forge, marketplace, agent profile, wallet, checkout,
   tour, walk).
2. **Semantic structure:** one `<h1>` per page, logical heading order, landmarks
   (`<nav> <main> <header> <footer>`), lists for lists, `<button>` for actions and
   `<a>` for navigation (no `<div onclick>`).
3. **Keyboard:** every interactive element reachable and operable by keyboard in a
   logical tab order; no keyboard traps; modals/tour/menus trap focus while open and
   restore it on close; ESC closes overlays. Visible, high-contrast focus ring
   everywhere (never `outline: none` without a replacement).
4. **Screen readers:** ARIA labels/roles on icon buttons, custom controls, tabs,
   dialogs, live regions for async updates (generation progress, toasts, balances).
   `alt` text on meaningful images; `aria-hidden` on decorative.
5. **Contrast:** all text and UI states meet 4.5:1 (3:1 for large text/UI). Fix at
   the token level. Check both themes.
6. **Forms:** every input has a programmatic label; errors are announced and
   associated with their field; required/invalid states are not color-only.
7. **Motion:** honor `prefers-reduced-motion` for the tour, walk companion, 3D
   auto-orbit, and transitions.
8. **3D canvases:** provide accessible alternatives/labels for `<model-viewer>` and
   custom canvases (name, description, keyboard orbit where feasible).
9. Add an axe-core check to the Playwright page sweep so regressions fail CI.

## Must-not
- Do not remove focus outlines without an equally-visible replacement.
- Do not use color as the only signal for state/errors.
- Do not add ARIA that lies about state — incorrect ARIA is worse than none.

## Acceptance
- [ ] axe-core/Lighthouse a11y: 0 serious/critical violations across all pages.
- [ ] Top 15 flows fully keyboard-operable; focus managed in all overlays.
- [ ] Screen-reader pass on top flows is coherent (labels, roles, live regions).
- [ ] All text/UI meets AA contrast in both themes (fixed at token level).
- [ ] `prefers-reduced-motion` honored everywhere motion exists.
- [ ] axe check wired into CI page sweep.
