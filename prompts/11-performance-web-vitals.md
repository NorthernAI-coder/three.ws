# 11 · Performance & Core Web Vitals

## Mission
Fast by default. Hit green Core Web Vitals (LCP < 2.5s, INP < 200ms, CLS < 0.1) on key pages, and
keep the 3D-heavy surfaces smooth (no jank, controlled memory).

## Context
- Vite build with code-splitting; Three.js + GLB/animation assets are the heavy hitters.
- CLAUDE.md: lazy-load heavy modules, debounce input, paginate lists, `will-change`/`transform`
  for animation. Asset pipeline + compression scripts exist: `npm run optimize:glb`,
  `npm run compress:glbs`, `npm run check:images`.

## Tasks
1. **Measure:** Lighthouse (or Playwright + web-vitals) on homepage, `/forge`, `/marketplace`,
   `/gallery`, a heavy 3D page, and the dashboard. Record LCP/INP/CLS + JS transfer + main-thread time.
2. **JS:** audit bundle chunks; lazy-load Three.js and per-surface heavy modules so the homepage
   doesn't pay for the editor. Defer non-critical scripts. Remove dead imports.
3. **Assets:** run GLB optimization/compression; serve compressed textures (KTX2) where supported;
   confirm images are responsive + lazy (`npm run check:images --strict` clean); preconnect/preload
   the LCP asset.
4. **3D runtime:** cap `devicePixelRatio` on mobile, frustum-cull, dispose GPU resources on unmount
   (verify no WebGL context leaks across navigation), throttle expensive per-frame work.
5. **Layout stability:** reserve space for async content (skeletons) so CLS stays low.
6. **Caching:** verify static asset cache headers (see `vercel.json` asset route) are aggressive +
   immutable for hashed assets.

## Acceptance
- Green CWV on the measured key pages (before/after numbers in the report).
- No WebGL context leak when navigating between 3D pages repeatedly.
- `npm run check:images --strict` clean; bundle sizes reduced (document deltas).
- Report saved to `docs/audit/perf-YYYY-MM-DD.md`; changelog for user-visible speedups.

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
git rm "prompts/11-performance-web-vitals.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
