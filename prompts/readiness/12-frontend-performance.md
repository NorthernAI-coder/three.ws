# 12 — Frontend performance & Core Web Vitals

**Phase 3. [parallel-safe]** with 13–14.

## Where you are

`/workspaces/three.ws` — three.ws, vanilla-JS modules + Vite, 125 pages, 118
public JS files, Three.js for 3D. Read [CLAUDE.md](../../CLAUDE.md) — "Performance
by default: lazy-load heavy modules, debounce input, paginate lists, use
`will-change`/`transform` for animations. Don't ship jank." The only coin is
**$THREE**.

## Objective

Hit "good" Core Web Vitals (LCP < 2.5s, INP < 200ms, CLS < 0.1) on the top
landing surfaces on a mid-tier mobile device and a throttled connection. Cut
bundle weight, defer non-critical work, and remove layout jank.

## Why it matters

Growth and conversion are gated by speed. A platform that competes with Vercel/
Linear/Stripe loads instantly. Every 100ms of LCP and every CLS shift costs
sign-ups. This is directly upstream of the $1B growth math.

## Instructions

1. **Measure first.** Build and run Lighthouse/CWV on the top surfaces (home,
   forge, marketplace, trending, an agent profile):
   ```bash
   npm run build && npm run audit:web   # existing web auditor
   npx lighthouse https://localhost:3000/ --preset=perf --form-factor=mobile --throttling-method=simulate
   ```
   Record LCP/INP/CLS/TBT and bundle sizes per route as the baseline.
2. **Bundle analysis.** Inspect the Vite build output and chunking. Find the
   heaviest modules (Three.js, character-studio, model-viewer, web3 libs).
   ```bash
   ls -laSh dist/assets/*.js | head -20
   ```
   Code-split route-heavy and 3D-heavy code behind dynamic `import()`. The 3D
   engine must never block first paint on non-3D pages.
3. **Lazy-load the heavy stuff.** Three.js, GLB loaders, and the avatar engine
   load on interaction/visibility, not on document load. Use
   `IntersectionObserver` for below-the-fold 3D and images
   (`loading="lazy"`, `decoding="async"`).
4. **Kill CLS.** Reserve space for images/canvas/embeds (width/height or
   aspect-ratio). No content that shifts when fonts/data arrive. Preload the
   primary font; `font-display: swap`.
5. **Optimize the critical path.** Inline critical CSS for above-the-fold,
   defer the rest. `preconnect`/`dns-prefetch` for RPC/API/analytics origins.
   Ensure analytics (PostHog, Vercel) load non-blocking (they already do —
   confirm they're not on the critical path).
6. **Improve INP.** Debounce search/input handlers, break long tasks, move heavy
   compute off the main thread (Worker) where it blocks interaction. The
   `MaxListenersExceededWarning` noise in console is the MetaMask extension, not
   us — ignore it; focus on our own long tasks.
7. **Caching headers.** Static assets immutable + far-future cache; HTML
   appropriately revalidated. Verify via `vercel.json` headers.
8. **Re-measure** and prove the deltas.

## Definition of done

- [ ] Before/after CWV recorded for the top 5 surfaces (mobile, throttled); LCP <
      2.5s, INP < 200ms, CLS < 0.1 on each, or a documented reason + plan if a
      specific surface can't yet.
- [ ] Three.js / 3D engine code-split and lazy-loaded; non-3D pages don't ship
      it on the critical path.
- [ ] Images/canvas/embeds reserve space; CLS verified low.
- [ ] Heaviest chunks reduced; bundle-size deltas recorded.
- [ ] Static-asset caching headers correct in `vercel.json`.
- [ ] `npm run build` + `npm test` pass; no new console errors.
- [ ] Changelog: `improvement` entry ("Faster page loads / smoother 3D").
