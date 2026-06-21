# 13 — Accessibility (WCAG 2.2 AA)

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Experience quality
**Owns:** `pages/`, `src/` components, design tokens/CSS variables, the 3D viewer controls.
**Depends on:** none (run after Phase 0/1)  ·  **Parallel-safe with:** `12`, `14`, `15`, `16`, `17`

## Why this matters for $1B
`/CLAUDE.md` makes accessibility non-optional. It widens the market, is a legal
requirement in many jurisdictions, and signals the craft a $1B platform is held to. An
interface only mouse-and-sighted users can operate caps growth and invites risk.

## Mission
Bring every interactive surface to WCAG 2.2 AA — semantic HTML, keyboard nav, ARIA,
contrast, focus, and reduced-motion.

## Map
- Top surfaces: `pages/home.html` (home), `pages/forge.html`, `pages/marketplace.html`,
  `pages/trending.html`, `pages/agent-detail.html`, and an editor such as Animation
  Studio (`pages/animations.html`) or Scene Studio (`pages/scene.html` / `src/scene-studio/`).
- Shared UI + tokens: components and CSS variables under `src/`; the 3D canvas/orbit
  controls used by the viewer and editors.
- Existing gates to lean on: `npm run audit:web` (`scripts/page-audit.mjs`) and the
  page suite `npm run test:pages` (`scripts/test-pages.mjs`).

## Do this
1. Audit the top surfaces with axe and Lighthouse accessibility; record per-surface
   scores and every serious violation as the baseline.
2. Fix semantic structure: landmarks (`header`/`nav`/`main`/`footer`), one logical
   heading order, labelled controls, lists where appropriate.
3. Make everything keyboard-operable, including the 3D canvas controls and every modal:
   focus trap while open, `Esc` to close, focus returned to the trigger on close, no
   keyboard traps elsewhere.
4. Add ARIA only where native semantics cannot express the role/state — never to
   paper over a non-semantic element that should be a `button`/`a`.
5. Verify color contrast against the design tokens (4.5:1 text, 3:1 large text/UI);
   fix token values rather than one-off overrides.
6. Honor `prefers-reduced-motion` for the heavy transitions and 3D motion; ensure
   visible focus rings everywhere, meaningful `alt` text on informative images, and
   form errors that are announced (`aria-live` / `aria-describedby`).

## Must-not
- Do not add ARIA that lies about state (e.g. static `aria-expanded`).
- Do not remove focus outlines without a clearly-visible replacement.
- Do not hide content from assistive tech to "clean up" the a11y report.

## Acceptance
- [ ] axe/Lighthouse accessibility >= 95 on the top surfaces, no serious violations.
- [ ] Full keyboard walkthrough documented (tab order, modals, 3D controls, `Esc`).
- [ ] Contrast meets AA against design tokens; `prefers-reduced-motion` respected.
- [ ] `npm test` green; `npm run lint` + `npm run typecheck` clean for touched code.
- [ ] Changelog `improvement` entry (e.g. "Keyboard + screen-reader support").
