# 17 — Accessibility audit (WCAG 2.2 AA)

**Phase 4. [parallel-safe]** with 15–16 (touches markup, not pipeline).

## Where you are

`/workspaces/three.ws` — three.ws, 125 pages. Read [CLAUDE.md](../../CLAUDE.md) —
"Accessibility is not optional. Semantic HTML. ARIA labels. Keyboard navigation.
Sufficient contrast. Focus indicators." The only coin is **$THREE**.

## Objective

The platform is usable by keyboard and screen reader and meets WCAG 2.2 AA on
every primary surface: semantic landmarks, labeled controls, visible focus,
sufficient contrast, respected reduced-motion, and accessible names on the 3D/
canvas surfaces.

## Why it matters

Accessibility is both a quality signal and a market-size lever — it's a
requirement for enterprise/institutional adoption and a legal expectation at
scale. It also forces the structural correctness (semantics, focus management)
that makes the whole UI more robust. It is part of the screenshot-worthy quality
bar, not a compliance afterthought.

## Instructions

1. **Automated pass.** Run axe across the top surfaces (home, forge, marketplace,
   trending, agent profile, studio, checkout, login, settings):
   ```bash
   npx @axe-core/cli http://localhost:3000/ http://localhost:3000/forge http://localhost:3000/marketplace
   ```
   (Use the dev server, `npm run dev`.) Record violations per surface. Automated
   tools catch ~40% — do the manual pass too.
2. **Keyboard.** Tab through every surface: logical order, no traps, every
   interactive element reachable and operable with Enter/Space, visible focus
   ring on each (never `outline: none` without a replacement). Modals trap focus
   while open and restore it on close. Skip-to-content link present.
3. **Screen reader.** Verify with VoiceOver/NVDA semantics: one `<h1>` per page,
   ordered headings, landmark regions (`<nav> <main> <footer>`), buttons vs links
   used correctly, form inputs have associated `<label>`s, icon-only buttons have
   `aria-label`, live regions (`aria-live`) announce async updates (toasts, load
   results).
4. **Contrast.** Check text and UI-component contrast against AA (4.5:1 text,
   3:1 large/UI). Fix failures using the existing design tokens
   (`docs/DESIGN-TOKENS.md`) — adjust the token, not one-off overrides
   (coordinate with [20 — design system](20-design-system-consistency.md)).
5. **Motion.** Respect `prefers-reduced-motion` — disable non-essential
   animation/parallax/auto-rotate 3D for users who ask. There's a
   `theme-switcher`/media-query pattern already; reuse it.
6. **3D/canvas a11y.** Canvas content is invisible to AT — provide a text
   alternative / `aria-label` describing the avatar/scene, and ensure all
   controls (rotate, zoom, play) have keyboard equivalents and labels.
7. **Forms & errors.** Errors are programmatically associated with their field
   (`aria-describedby`), announced, and not conveyed by color alone.
8. **Add a CI a11y check** (axe in Playwright) on the top surfaces so regressions
   are caught (feeds [16](16-ci-cd-hardening.md)).

## Definition of done

- [ ] axe run on the top 8+ surfaces; violations recorded and resolved (or
      tracked with a reason).
- [ ] Full keyboard operability verified: order, no traps, visible focus, modal
      focus management, skip link.
- [ ] Screen-reader semantics correct: headings, landmarks, labels, live regions.
- [ ] All text/UI contrast meets AA, fixed via design tokens.
- [ ] `prefers-reduced-motion` honored across animations and 3D.
- [ ] 3D/canvas surfaces have text alternatives + keyboard-operable, labeled
      controls.
- [ ] Form errors are associated, announced, and not color-only.
- [ ] An automated a11y check runs in CI on the top surfaces.
- [ ] Changelog: `improvement` entry ("Accessibility improvements across the
      app").
