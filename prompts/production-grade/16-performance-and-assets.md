# Task 16 — Performance: lazy-load heavy GLBs, move the animation set to CDN, watch CWV

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track E —
> Engineering excellence.** Independent. Touches the asset pipeline and Vite config — be
> careful not to break the build (read the `npx vercel build` trap in the README).

## The thesis

A 3D platform lives or dies on load performance: a homepage that blocks first paint on
multi-megabyte avatar decodes, and a 200MB+ animation set committed to git and shipped on every
deploy, are exactly the things that tank Core Web Vitals and bounce mobile users. Speed is a
feature — and at $1B scale, a ranked one. Make the heavy stuff lazy and off the critical path.

## What exists today (read first)

- **Optimization tooling exists** — [scripts/compress-glbs.mjs](../../scripts/compress-glbs.mjs)
  / [scripts/optimize-glb.mjs](../../scripts/optimize-glb.mjs) (WebP texture compression);
  Vite prebundles three.js, defers the Draco loader, and splits chunks
  ([vite.config.js](../../vite.config.js)).
- **But the heavy assets aren't managed for first paint:**
  - Avatar GLBs are 160KB–3.2MB each in [public/avatars/](../../public/avatars/) and are loaded
    eagerly by avatar pickers (`/start`, `/create`) — decode blocks first paint.
  - The animation set in [public/animations/](../../public/animations/) is **~200MB committed to
    git**, redownloaded every deploy, with no clear per-page loading story.
  - [vite.config.js](../../vite.config.js) `chunkSizeWarningLimit` only warns (gate is `15`).
  - No global Core Web Vitals monitoring (there's an IRL-only perf budget,
    [src/irl/perf-budget.js](../../src/irl/perf-budget.js)).

## What to build

1. **Lazy-load heavy GLBs off the critical path.** Avatar pickers and 3D scenes should show a
   lightweight placeholder (poster/thumbnail or a tiny proxy) and defer the full GLB decode
   until needed/visible (intersection-based, on-demand). First paint must not wait on a 3MB
   model. Keep the universal animation system intact (CLAUDE.md — no rig allowlist).
2. **Get the animation set off git and onto the CDN.** Move [public/animations/](../../public/animations/)
   (the ~200MB built GLB clips) to R2/CDN delivery (the repo already proxies R2 — see the
   `/r2-proxy` config in [vite.config.js](../../vite.config.js)), reference them by CDN URL,
   load per-page only what's used, and stop committing the binaries (gitignore + a documented
   `build:animations` → upload step). Don't break the animation pipeline
   ([scripts/build-animations.mjs](../../scripts/build-animations.mjs),
   [docs/3d-asset-pipeline.md](../../docs/3d-asset-pipeline.md)) — update it.
3. **Ensure assets are compressed.** Run/verify the GLB compression pipeline covers the shipped
   avatars; flag any uncompressed outliers. Set correct long-cache headers for immutable
   hashed assets ([vercel.json](../../vercel.json)).
4. **Core Web Vitals monitoring.** Add lightweight, global CWV (LCP/INP/CLS) reporting (e.g.
   `web-vitals` → the analytics sink) so regressions are measurable. Wire a real budget/alert
   so a bad deploy is visible.

## Hard rules specific to this task

- **Don't regress correctness for speed.** Avatars and animations must still load and play
  everywhere they do today — lazy means deferred, not dropped. Test the pickers and key 3D
  surfaces in a real browser.
- Mind the build traps: don't let `npx vercel build` clobber `api/*.js`; verify the production
  build (`npm run build`) still succeeds and the moved assets resolve.
- Moving 200MB of git history is sensitive — remove the binaries from future commits and CDN
  them; do **not** rewrite published history without explicit user sign-off.

## Definition of done

README DoD, plus: avatar pickers and 3D pages show a placeholder and defer heavy decode (first
paint no longer blocked — verify with a throttled profile); the animation set loads from CDN
and is no longer committed; assets are compressed with correct cache headers; CWV reporting is
live with a budget. Tests/build verify assets still resolve and play. Changelog
(`improvement`/`infra`). Self-review, then optimize the next-heaviest surface.

Delete this file when done.
