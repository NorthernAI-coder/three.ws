# G2 — WCAG 2.2 AA accessibility audit across all surfaces

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`, `STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none (runs in parallel; coordinate with G4 — contrast fixes must use `public/tokens.css`, not new hardcoded colors).

## Why this matters for $1B
A billion-dollar platform serves everyone — including keyboard-only, screen-reader, low-vision, and motion-sensitive users — and it is legally required to (ADA, EAA, Section 508). `00b-the-bar.md` already lists "keyboard-navigable, screen-reader-labelled, `prefers-reduced-motion` honored, contrast ≥ WCAG AA" as part of the polish bar on **every** surface. We have a 3D-heavy product (canvas controls are the hardest a11y problem there is) and 125+ pages. An automated gate plus a real manual pass is the only way to hold this bar as the surface area grows.

## Current state (read before you write)
- **No a11y tooling in CI.** `.github/workflows/ci.yml` runs lint, vitest, source guards, typecheck — no axe, no pa11y, no Lighthouse a11y. `.lighthouserc.json` exists but isn't wired into CI either.
- **`prefers-reduced-motion` is partially adopted.** `grep -rl "prefers-reduced-motion" public/*.css` shows ~10 stylesheets honor it (`home.css`, `features.css`, `auth.css`, `galaxy.css`, …) — but coverage is inconsistent and the 3D scenes/animations are the highest-risk omission.
- **3D/canvas controls are the core gap.** `src/` Three.js surfaces (avatar presence, Forge viewer, feature-tour, scene-studio) expose orbit/zoom/pose controls on `<canvas>` with no ARIA, no keyboard equivalents, no screen-reader description of what the canvas shows.
- **Design tokens exist for contrast.** `public/tokens.css` defines the ink/surface palette (`--ink`, `--ink-dim`, `--ink-faint`, surfaces). Contrast failures must be fixed by adjusting/choosing the right **token**, never by hardcoding a hex (that's G4's lane — stay aligned).
- Shared chrome lives in `public/nav.js` / `public/nav.css` (skip-link, focus order, drawer) — fixes there propagate everywhere.

## Your mission
### 1. Wire an automated axe check into CI
Add `@axe-core/cli` or `@axe-core/playwright` (we already run Playwright — `npm run test:e2e`) as a real a11y test that loads the primary surfaces (home, marketplace, Forge, dashboard-next, an agent profile, a legal page) at 1440px and 375px and asserts **zero serious/critical violations**. Add an `a11y` job to `.github/workflows/ci.yml` that runs it on every PR and **fails on regressions**. Add an `npm run test:a11y` script. Use real page loads (`npm run dev` / preview server) — no static snapshots.

### 2. Fix semantic structure, landmarks, and keyboard navigation
Sweep the shared chrome first (`public/nav.js`, `public/nav.css`): one `<h1>` per page, correct heading order, landmark roles (`<nav>`, `<main>`, `<footer>`), a working **skip-to-content** link, logical tab order, and visible focus indicators on every interactive element (use the token-based focus ring; never `outline: none` without a replacement). Then fix the per-page violations axe surfaces. Every link goes somewhere, every button is reachable and operable by keyboard (Enter/Space), modals/drawers trap focus and restore it on close, and `Esc` closes overlays.

### 3. Make the 3D/canvas controls accessible
This is the headline. For each interactive `<canvas>` surface in `src/` (avatar presence, Forge viewer, scene controls): add an accessible name + `role`/`aria-label` describing what's rendered, provide **keyboard-operable equivalents** for orbit/zoom/reset (arrow keys / +/- / a reset button) exposed as real buttons with ARIA, announce meaningful state changes via an `aria-live` region (e.g. "Avatar loaded", "Generating…"), and ensure a non-canvas fallback/description so a screen-reader user understands the content. Respect `prefers-reduced-motion` on the auto-rotate/idle animations.

### 4. Complete `prefers-reduced-motion` and contrast coverage
Extend reduced-motion handling to every animated surface (especially 3D auto-rotate, galaxy/particle backgrounds, marquees, skeleton shimmer) so motion-sensitive users get a still, usable experience — consolidate into a shared rule where possible. Run a contrast audit against WCAG 2.2 AA (4.5:1 body, 3:1 large/UI components, plus the 2.2 additions: focus-not-obscured, target-size ≥ 24px, dragging alternatives); fix every failure by selecting the correct **token** (coordinate with G4) and bumping focus-ring/target sizes where needed.

### 5. Add ARIA to dynamic states and verify with a real screen reader
Ensure loading/empty/error/toast states announce to assistive tech (`aria-live`, `role="status"`/`role="alert"`), form fields have associated `<label>`s and `aria-describedby` for errors, and images/icons have alt text or `aria-hidden` as appropriate. Verify the primary flows end-to-end with keyboard-only and VoiceOver/NVDA: visitor lands → tabs to Forge → generates → result is announced. Document the manual pass results.

## Definition of done
Clears 00b's **polish bar**'s explicit a11y clause on every audited surface (keyboard-navigable, screen-reader-labelled, reduced-motion honored, contrast ≥ AA) and adds the missing automated gate. Inherits the global definition of done in `00-README-orchestration.md`: real page loads (no mocks), `$THREE` only, design tokens only (contrast fixes via tokens), zero new console errors, existing + new tests pass, the new `a11y` CI job is green and enforced. Axe reports zero serious/critical on the primary surfaces; 3D controls are fully keyboard-operable.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs. `$THREE` is the only coin. **Design tokens only** (`public/tokens.css`) — every contrast/focus fix references a token, never a new hardcoded color (G4 enforces this platform-wide). Stage explicit paths only (never `git add -A`). Own the a11y lane (axe CI job, ARIA, keyboard nav, reduced-motion, focus management); extend `public/nav.js`/`public/nav.css` and the `src/` canvas surfaces — do not rewrite them or fork their styling.

## When finished
Run the self-review (CLAUDE.md's five checks). Ship one improvement (e.g. a global "reduce motion" user toggle persisted to local storage, or a keyboard-shortcut help overlay). Append a `data/changelog.json` entry (tag: `improvement`) — holder-readable ("Full keyboard navigation, screen-reader labels on 3D controls, and an automated accessibility check on every release"). Then delete this prompt file (`prompts/production-campaign/G-trust/G2-accessibility-audit.md`) and report what you shipped + the seam for the next agent (which surfaces still trip axe, any 3D control needing deeper work).
