# 10 — Performance & Core Web Vitals

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

Speed is the silent conversion lever. Every 100ms of LCP and every layout shift costs
sign-ups, and Core Web Vitals directly affect search ranking — the cheapest growth
channel. This platform ships a heavy Three.js/GLB stack on top of ~125 pages; if those
assets block first paint, the front door feels slow and acquisition leaks before the
user sees the product. Fast must be the default, not a flag.

## Mission

Hit good Core Web Vitals on the primary surfaces — LCP < 2.5s, CLS < 0.1, INP < 200ms —
by lazy-loading heavy modules and 3D, enforcing image-loading attributes, code-splitting,
debouncing input handlers, and preconnecting/preloading critical origins.

## Map (trust but verify — files move)

- **Heaviest pages** — [pages/home.html](../../pages/home.html),
  [pages/forge.html](../../pages/forge.html) (both already use `preconnect`/`preload`),
  marketplace and walk landing pages. These mount Three.js.
- **3D / GLB loaders** — `src/` modules importing `GLTFLoader` / `three.module` (e.g.
  [src/avatar-picker.js](../../src/avatar-picker.js), [src/club.js](../../src/club.js),
  [src/avatar-export.js](../../src/avatar-export.js)). Grep `GLTFLoader|three.module`.
  These are the biggest bundles — they must dynamic-`import()` on demand, not at page load.
- **Dynamic import (existing pattern)** — many `src/` files already use `import(...)`
  (e.g. [src/agent-detail.js](../../src/agent-detail.js)); follow that pattern.
- **Image loading guard** — [scripts/audit-image-loading.mjs](../../scripts/audit-image-loading.mjs)
  via `npm run check:images` (strict: every JS-rendered `<img>` in `src/` needs `loading=`).
  Codemod helper: [scripts/codemod-lazy-images.mjs](../../scripts/codemod-lazy-images.mjs).
- **Build config** — [vite.config.js](../../vite.config.js) (chunking, build target),
  [public/tokens.css](../../public/tokens.css) (motion tokens for `will-change`/`transform`).
- **Audit tooling** — `npm run audit:web` ([scripts/page-audit.mjs](../../scripts/page-audit.mjs)),
  `npm run snapshot` ([scripts/page-snapshot.mjs](../../scripts/page-snapshot.mjs)).

## Do this

1. **Measure first.** `npm run dev`, then run Lighthouse on the heaviest routes:
   `npx lighthouse http://localhost:3000/ --only-categories=performance --view`
   and repeat for `/forge` and `/marketplace`. Record LCP, CLS, INP/TBT per page — this
   is your before/after baseline. Note the LCP element and the largest network requests.
2. **Lazy-load the 3D stack.** Confirm every Three.js/GLTFLoader import is behind a
   dynamic `import()` triggered by viewport/interaction (IntersectionObserver or click),
   never at module top level on a page that paints text first. Defer the canvas mount
   until after first contentful paint.
3. **Image loading.** Run `npm run check:images` — fix every offender so JS-rendered
   `<img>` carries `loading="lazy"` and `decoding="async"`. For above-the-fold LCP images
   in static HTML, use `loading="eager"` + `fetchpriority="high"` (don't lazy-load the LCP
   image). Set explicit `width`/`height` (or `aspect-ratio`) on every image to kill CLS.
4. **Eliminate layout shift.** Reserve space for async content (skeletons, fixed-aspect
   media, font-swap with `font-display: optional/swap` and preloaded fonts). Audit feeds
   and the forge result area for content that pushes layout on load.
5. **Code-split & budget.** Inspect the Vite build output (`npx vite build`) for oversized
   chunks; split route-specific and 3D code into async chunks. Set and document a bundle
   budget (e.g. initial JS < 200KB gzipped per primary route) and bring offenders under it.
6. **Debounce & schedule.** Debounce/throttle search, scroll, and resize handlers;
   move non-urgent work off the critical path (`requestIdleCallback` / `requestAnimationFrame`).
   Use `transform`/`opacity` + `will-change` for animations (never animate layout props).
7. **Network priming.** Add `preconnect`/`dns-prefetch` for real cross-origin asset hosts
   (R2, RPC, fonts) and `preload` the LCP image + critical font on the heaviest pages,
   matching the existing pattern in `home.html`/`forge.html`. Remove dead preloads.
8. **Re-measure & verify.** Re-run Lighthouse on the same routes — LCP < 2.5s, CLS < 0.1,
   INP/TBT in the good band. Run `npm run audit:web` and `npm run snapshot` and confirm no
   console errors. `npm test`. Add a changelog entry; `npm run build:pages`.

## Must-not

- Do not lazy-load the LCP image or above-the-fold hero — that regresses LCP.
- Do not eager-load the full Three.js/GLB stack on pages that paint text first.
- Do not animate layout-triggering properties (top/left/width/height) — use transforms.
- Do not introduce fake `setTimeout` loading bars; use real async + skeletons.
- Do not bypass `npm run check:images` strict mode — fix the images, don't disable the guard.

## Acceptance (all true before claiming done)

- [ ] Lighthouse on home, forge, marketplace: LCP < 2.5s, CLS < 0.1, INP/TBT in the good band.
- [ ] `npm run check:images` passes strict; every image has dimensions and correct `loading=`.
- [ ] Three.js/GLB code is dynamic-imported on demand; not in the initial route bundle.
- [ ] Documented bundle budget met; oversized chunks split; `npx vite build` clean.
- [ ] Input/scroll handlers debounced; animations use transform/opacity + `will-change`.
- [ ] `preconnect`/`preload` cover real critical origins; no dead hints; no console errors.
- [ ] `npm test`, `npm run audit:web`, `npm run snapshot` pass; changelog updated and
      `npm run build:pages` is clean.
