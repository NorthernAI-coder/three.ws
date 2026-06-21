# 22 · Performance: code-split, lazy 3D, Lighthouse ≥90

> **Phase 4 — Frontend excellence** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** L

## Mission
Several JS modules are huge and not split (`marketplace.js` ~313KB, `irl.js` ~317KB, `walk.js`
~178KB, `agent-edit.js` ~105KB), and heavy Three.js/`model-viewer` usage loads on the critical path
even for grid pages. That tanks LCP/FID on mobile. Code-split per surface, lazy-load 3D only when a
viewer mounts, and get the top pages to **Lighthouse ≥90 / Core Web Vitals green**.

## Context (read first)
- `CLAUDE.md` ("Performance by default": lazy-load heavy modules, debounce input, paginate, `transform`/`will-change` for animation).
- `vite.config.js` (existing manualChunks: `three-core`, `three-addons`, `solana`, `ethers`).
- Heavy modules above; PWA setup (`vite-plugin-pwa`, workbox).
- Image lazy audit: `scripts/audit-image-loading.mjs` (`npm run check:images`).

## Build this
1. **Lazy 3D** — dynamically `import()` Three.js addons (`GLTFLoader`, `OrbitControls`, controls) and `model-viewer` only when a viewer is actually mounted (intersection/interaction), not at module top-level. Grid/list pages must render and be interactive before any 3D loads.
2. **Per-surface code-split** — break the giant modules so each route loads only what it needs; push detail-only/editor-only code behind dynamic imports. Verify chunk graph in the build output.
3. **List performance** — paginate or virtualize unbounded lists (marketplace, gallery, feeds); debounce search inputs; cap initial render.
4. **CLS/LCP hygiene** — explicit `width`/`height` or `aspect-ratio` on all grid images (kills layout shift); `decoding="async"` + `loading="lazy"` off-fold (extend `check:images` to enforce both); preconnect/preload the true LCP resource per top page.
5. **Measure + gate** — run Lighthouse (CI via `@lhci/cli` or Playwright traces) on the top ~10 pages; commit budgets (LCP, TBT, CLS, bundle size) and fail CI on regression.

## Files likely in play
`vite.config.js` (chunking), the heavy `src/*.js` modules (dynamic imports), grid/list renderers (pagination/virtualization + image sizing), `scripts/audit-image-loading.mjs`, Lighthouse CI config + budgets, `.github/workflows`.

## Definition of done
- [ ] No page loads Three.js/`model-viewer` before first paint unless it shows 3D above the fold.
- [ ] Giant modules split; per-route bundle sizes meaningfully reduced (report before/after).
- [ ] Lists paginated/virtualized; search debounced.
- [ ] All grid images have dimensions/`aspect-ratio` + `decoding=async`; `check:images` enforces it.
- [ ] Lighthouse ≥90 (perf) on the top 10 pages; budgets gate CI.
- [ ] Changelog: **improvement** entry ("faster loads: code-splitting + lazy 3D").

## Guardrails
Follow CLAUDE.md. Don't break the viewers/PWA/offline behavior while splitting — verify in a real browser. Push both remotes.
