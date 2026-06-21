# 13 · Design System & Visual Consistency

## Mission
Make the whole product feel like one premium surface: consistent spacing, typography, color tokens,
radii, shadows, motion, and component patterns. Eliminate one-off styles and visual drift.

## Context
- Global tokens/CSS variables in `style.css`; per-page `<style>` blocks; `dashboard-next` has its own
  `--nxt-*` token set. Many surfaces hand-rolled their own buttons/cards/inputs.

## Tasks
1. **Token audit:** inventory every CSS custom property and every raw hex/px value used outside
   tokens. Replace ad-hoc values with tokens; reconcile the global tokens vs `--nxt-*` (document the
   intended relationship, unify where sensible).
2. **Component inventory:** catalog buttons, inputs, cards, chips, tabs, modals, toasts, tooltips,
   empty/loading/error states across surfaces. Identify divergent implementations of the same thing
   and converge them on a single canonical pattern (extract shared CSS/JS where it reduces code).
3. **Microinteractions:** ensure consistent hover/active/focus states and transitions (opacity +
   transform) on all interactive elements, per CLAUDE.md. No jarring pops.
4. **Empty/loading/error states:** standardize their look-and-feel (skeletons preferred over spinners).
5. **Iconography & typography:** one icon style, consistent type scale, consistent line-heights.
6. **Dark/light + theme boot:** confirm `scripts/inject-theme-boot.mjs` prevents FOUC and themes are
   consistent; no flashes or mismatched surfaces.

## Acceptance
- A short `docs/design-system.md` documenting tokens + canonical components.
- Measurable reduction in one-off styles (before/after grep counts of raw hex/px).
- Consistent hover/active/focus + transitions on every interactive element on the top 12 surfaces.
- No theme FOUC; changelog entry (improvement) for visible polish.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first (they override defaults)
- No mocks / fake data / placeholders / TODOs / stubs. Real implementations only.
- $THREE is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths; re-check before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`.
- Every user-visible change → `data/changelog.json` entry + `npm run build:pages`.
- Push to BOTH remotes when asked; never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.
