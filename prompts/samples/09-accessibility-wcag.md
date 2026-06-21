# 09 — Accessibility (WCAG 2.2 AA)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

A platform that excludes keyboard, screen-reader, and low-vision users is leaving
real users — and in many markets, legal compliance — on the table. Accessibility is
also a proxy for craft: semantic structure, focus management, and contrast are the
same primitives that make UI feel polished to everyone. A $1B platform passes WCAG
2.2 AA on its core flows without anyone having to ask.

## Mission

Bring every primary surface (home, forge, marketplace, wallet, agent profiles,
create flows) to WCAG 2.2 AA: semantic HTML, ARIA on interactive elements, full
keyboard operability, visible focus, sufficient contrast, screen-reader labels, and
honored reduced-motion.

## Map (trust but verify — files move)

- **Pages** — [pages/](../../pages) (~125 `*.html`). Start with high-traffic flows:
  `home.html`, `forge.html`, `marketplace*.html`, `agent-detail.html`,
  `create-prompt.html`, `agent-wallet.html`.
- **Shared nav** — [public/nav.html](../../public/nav.html), [public/nav.js](../../public/nav.js)
  (desktop dropdowns + mobile drawer; `aria-pressed` already on the walk toggle),
  [public/nav.css](../../public/nav.css).
- **Design tokens (focus ring, contrast)** — [public/tokens.css](../../public/tokens.css)
  (`--focus-ring-color` and friends), [DESIGN-TOKENS.md](../../DESIGN-TOKENS.md).
  Focus styles already exist in [public/buttons.css](../../public/buttons.css),
  [public/home.css](../../public/home.css), and others — extend, don't fork.
- **Reduced motion** — already honored in [public/tokens.css](../../public/tokens.css),
  [public/footer.css](../../public/footer.css), [public/features-landing.css](../../public/features-landing.css);
  many `src/` animation modules are not. Search `prefers-reduced-motion`.
- **JS components** — [src/](../../src) (~810 modules). Interactive widgets that build
  DOM (modals, tabs, menus, viewers) often ship `<div onclick>` without roles/labels.

## Do this

1. **Baseline audit.** Run an axe scan against the running app (no dep needed):
   `npm run dev`, then `npx @axe-core/cli http://localhost:3000/forge
   http://localhost:3000/marketplace http://localhost:3000/ http://localhost:3000/create/prompt`.
   Record every violation by page; this is your worklist.
2. **Semantic structure.** Each page needs one `<h1>`, a logical heading order, and
   landmark regions (`<header><nav><main><footer>`). Replace generic `<div>` wrappers
   that are really headers/nav/main with the semantic element. Add a "skip to content"
   link as the first focusable element on long pages.
3. **Interactive elements.** Every clickable `<div>`/`<span>` becomes a `<button>` or
   gets `role="button"`, `tabindex="0"`, and keydown (Enter/Space) handling. Icon-only
   controls get `aria-label`. Toggles get `aria-pressed`; tabs get `role="tab"` +
   `aria-selected`; modals get `role="dialog"`, `aria-modal`, focus trap, and Esc-to-close.
4. **Keyboard operability.** Tab through each core flow with no mouse: every control
   reachable, in a sane order, no keyboard trap, dropdowns/drawers open & close via
   keyboard. The mobile drawer in `nav.js` must trap focus while open and restore it on
   close.
5. **Visible focus.** Every interactive element shows a clear focus ring using the
   existing `--focus-ring-color` token (via `:focus-visible`). No `outline: none`
   without a replacement. Audit `src/` and `public/*.css` for naked `outline: none`.
6. **Contrast.** Verify text and UI contrast against backgrounds (4.5:1 body, 3:1 large
   text / UI components) in both light and dark themes. Fix failing pairs by remapping to
   compliant tokens in `tokens.css` — never hardcode a one-off hex.
7. **Screen reader & forms.** Every input has an associated `<label>` (or `aria-label`);
   error messages are announced (`aria-describedby` / `aria-live`); decorative images get
   `alt=""`, meaningful images get real `alt`. Async status (forge progress, save
   results) uses an `aria-live` region.
8. **Reduced motion.** Wrap non-essential `src/` animations (loops, parallax, auto-play
   3D spin) in `@media (prefers-reduced-motion: reduce)` or a JS check, degrading to a
   static/instant state.
9. **Re-audit & test.** Re-run the axe scan — zero serious/critical violations on the
   targeted pages. Run `npm test` (vitest + playwright) and add/extend a Playwright check
   asserting skip-link presence, focus visibility, and drawer focus trap on at least the
   home and forge routes. Add a changelog entry; `npm run build:pages`.

## Must-not

- Do not add ARIA that lies about state (e.g. static `aria-expanded="true"`); ARIA must
  reflect live state or be omitted.
- Do not remove focus outlines without a stronger visible replacement.
- Do not hardcode colors to "fix" contrast — remap design tokens so both themes stay correct.
- Do not regress working interactions while making them accessible; verify each in a browser.
- Do not reference any coin other than `$THREE` in any new copy or label.

## Acceptance (all true before claiming done)

- [ ] axe scan on home, forge, marketplace, agent-detail, create/prompt shows zero
      serious/critical violations.
- [ ] Every core flow is fully keyboard operable with no trap; visible focus on every control.
- [ ] One `<h1>` and correct landmarks per audited page; skip-to-content link works.
- [ ] Text/UI contrast passes 4.5:1 / 3:1 in both light and dark themes.
- [ ] Inputs are labeled; async status and errors are announced via `aria-live`.
- [ ] Reduced-motion is honored across `src/` animations on the audited pages.
- [ ] `npm test` passes; new a11y Playwright checks added; changelog updated and
      `npm run build:pages` is clean.
