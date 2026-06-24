# 09 · Accessibility (WCAG 2.1 AA)

## Mission
Make the entire platform usable by keyboard and screen reader with sufficient contrast and clear
focus. Accessibility is non-negotiable per CLAUDE.md.

## Context
- Vanilla JS + Vite, many custom interactive widgets (pickers, tabs, drawers, 3D canvases, toasts).
- Design tokens / CSS variables in `style.css` and per-page styles.

## Tasks
1. **Automated pass:** run axe-core (via Playwright) over every route from `data/pages.json`; record
   violations by route + rule. Fix all serious/critical.
2. **Keyboard:** every interactive element reachable and operable by keyboard; logical tab order;
   visible focus rings everywhere; no keyboard traps. Custom widgets (avatar picker, tour controls,
   chapter panel, mode switches, drawers) get correct roles + arrow-key patterns.
3. **Screen reader:** semantic HTML first; ARIA only where needed and correct. Label every control,
   icon-only button, and form field. Live regions for async status (generation progress, toasts).
4. **Contrast:** verify text + UI contrast meets AA against the dark theme tokens; fix failing
   token usages at the token level so fixes propagate.
5. **Media/3D:** provide text alternatives / descriptions for canvases where meaningful; respect
   `prefers-reduced-motion` (already used in some modules — make it universal).
6. **Forms:** associate labels, describe errors with `aria-describedby`, announce validation.

## Acceptance
- axe-core: zero serious/critical violations across all routes.
- Full keyboard walkthrough of the top 12 surfaces with visible focus and no traps.
- Contrast AA verified; `prefers-reduced-motion` honored platform-wide.
- Changelog entry (improvement) for the accessibility pass.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first (they override defaults)
- No mocks / fake data / placeholders / TODOs / stubs. Real implementations only.
- $THREE is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths; re-check before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`.
- Every user-visible change → `data/changelog.json` entry + `npm run build:pages`.
- Push to BOTH remotes when asked; never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/09-accessibility-audit.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
