# 10 — Performance & Core Web Vitals

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 1 — Cross-cutting hardening
**Owns:** `vite.config.js`, `pages/`, `src/`, `public/`, 3D asset loading, build pipeline.
**Depends on:** `03` (clean console). Pairs with `11`, `28`.

## Why this matters for $1B
A 3D-heavy platform that janks or loads slowly loses users at the door and ranks
worse in search. `/CLAUDE.md`: "Performance by default. Lazy-load heavy modules.
Don't ship jank." Speed is conversion is revenue is valuation.

## Mission
Hit good Core Web Vitals on every key page (LCP < 2.5s, INP < 200ms, CLS < 0.1 on a
mid-tier device/throttled network) and keep heavy 3D from blocking first paint.

## Do this
1. Establish a baseline: run Lighthouse (mobile, throttled) on the top 15 pages.
   Record LCP/INP/CLS/TBT and bundle sizes. Set per-page budgets and a script to
   enforce them in CI.
2. **JS:** code-split per route; lazy-load Three.js, model-viewer, character-studio,
   scene-studio, and other heavy modules so they never block initial render. Defer
   non-critical scripts. Tree-shake; remove dead imports (cross-check prompt `04`).
3. **3D assets:** compress GLBs (`npm run compress:glbs` / `optimize:glb`), use Draco/
   meshopt, lazy-load models below the fold, show a lightweight poster/skeleton until
   the model is ready, and cap texture sizes. Never auto-load a heavy model the user
   can't see yet.
4. **Images:** responsive `srcset`, modern formats (AVIF/WebP), explicit
   width/height to kill CLS, lazy-load offscreen images. Run `npm run check:images`.
5. **Fonts:** `font-display: swap`, preload the critical face, subset if possible.
6. **CSS:** inline critical CSS for above-the-fold; defer the rest. Remove unused CSS.
7. **Caching:** correct `Cache-Control` for static assets (immutable hashed assets,
   sensible TTLs for data) via `vercel.json`. Confirm CDN/R2 caching for GLBs.
8. **Layout stability:** reserve space for async content (models, images, ads/embeds)
   to keep CLS near zero.
9. **INP:** debounce input handlers, break up long tasks, avoid main-thread 3D work
   that blocks interaction; move heavy compute to workers where possible.
10. Re-run Lighthouse; confirm budgets met. Wire the budget check into CI.

## Must-not
- Do not block first paint on Three.js or any 3D module.
- Do not ship uncompressed GLBs or unsized images.
- Do not regress accessibility (prompt `09`) for performance.

## Acceptance
- [ ] Top 15 pages: LCP < 2.5s, INP < 200ms, CLS < 0.1 (mobile, throttled).
- [ ] Heavy modules (Three.js, model-viewer, studios) are lazy/code-split.
- [ ] GLBs compressed (Draco/meshopt) and lazy-loaded with posters/skeletons.
- [ ] Images responsive, sized, modern-format, lazy below fold.
- [ ] Per-page performance budgets enforced in CI.
- [ ] Lighthouse perf score ≥ 90 on key pages.
