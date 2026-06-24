# 10 · Responsive & Mobile Audit

## Mission
Every surface looks and works great at 320px, 768px, and 1440px. No horizontal scroll, no
overlap, no cramped or lopsided layouts, touch targets ≥44px. (Precedent: the Forge page was
left-heavy because a two-column grid trapped content in one column — find every layout that
collapses or wastes space.)

## Context
- CLAUDE.md: test 320/768/1440 mentally and for real; relative units; flex/grid over fixed widths.
- Recent fixes: mobile Walk Companion toggle; Forge full-width layout. Use these as the quality bar.

## Tasks
1. **Screenshot matrix:** Playwright-capture every route at 320, 768, 1440 (and 390 for modern phones).
   Build a contact sheet; flag overflow, overlap, clipped controls, empty dead space, unreadable text.
2. **Fix layout bugs at the source:** prefer fixing the grid/flex container, not patching with media
   queries on children. Ensure two-column desktop layouts use the full width and stack cleanly on mobile.
3. **Touch ergonomics:** tap targets ≥44px; on-screen controls for anything keyboard-only on desktop
   (the walk playground already has a d-pad — ensure parity elsewhere).
4. **Viewport + safe areas:** correct `<meta viewport>`, `env(safe-area-inset-*)` on fixed bars,
   no content under notches/home indicators.
5. **3D canvases:** verify renderers resize correctly on rotation/resize and cap pixel ratio on mobile
   for perf.
6. **Nav:** mobile menu contains every primary action reachable on desktop (no desktop-only entry points).

## Acceptance
- No horizontal scroll or overlap at 320/390/768/1440 on any route.
- All primary actions reachable on mobile; touch targets ≥44px.
- 3D surfaces resize correctly; contact sheet saved to `docs/audit/responsive-YYYY-MM-DD/`.
- Changelog entry for user-visible layout fixes.

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
git rm "prompts/10-responsive-mobile-audit.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
