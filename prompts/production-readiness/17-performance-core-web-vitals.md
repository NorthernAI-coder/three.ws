# 17 — Performance & Core Web Vitals

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** LCP / INP / CLS across public surfaces; loading strategy; the `page-audit` tooling.
**Depends on:** `11` (caching). **Pairs with:** `18` (bundle), `19` (3D), `51` (SEO).

## Why this matters for $1B
Web Vitals are a ranking signal **and** a conversion signal — every 100ms of latency costs
sign-ups. A 3D-heavy platform fights gravity here, which makes disciplined performance a
competitive moat: if three.ws loads fast with avatars rendering, it wins where rivals jank.

## Map — real anchors
- `npm run audit:web` → `scripts/page-audit.mjs` (Lighthouse-style audits). `npm run check:images` enforces lazy-load attrs on `<img>`.
- Fonts in `public/fonts/`, `public/style.css` (large), `public/mobile.css`. Vite build for `src/`.

## Do this
1. **Measure first:** run Lighthouse / `audit:web` on the top ~15 public routes (mobile + desktop). Record LCP, INP, CLS, TBT, TTFB. Target: LCP < 2.5s, INP < 200ms, CLS < 0.1 on mid-tier mobile.
2. **LCP:** identify each page's LCP element; preload it; serve hero images as responsive `srcset` + modern formats (AVIF/WebP); inline critical CSS; ensure fast TTFB via edge caching (`11`).
3. **CLS:** reserve space for images/embeds/3D canvases (explicit dimensions / aspect-ratio); avoid layout shift from late fonts (`font-display: swap` + preload) and injected banners.
4. **INP/TBT:** defer non-critical JS; break up long tasks; lazy-load heavy modules (Three.js scenes, studios) on interaction/viewport; debounce input handlers (CLAUDE.md). Hydrate/init only what's visible.
5. **Images:** confirm `check:images` passes — every `<img>` lazy-loaded with dimensions; convert heavy PNGs; use a CDN/transform where available.
6. **Fonts:** subset + preload the critical font; `font-display: swap`; cut unused weights.
7. **Re-measure** and confirm the targets on the key routes; record before/after in `docs/internal/perf.md`.

## Must-not
- Do not regress 3D fidelity to win a number — tier it instead (`19`), don't gut it.
- Do not block first paint on non-critical JS or analytics.
- Do not ship layout-shifting late content above the fold.

## Definition of done
- [ ] Top ~15 routes meet LCP<2.5s / INP<200ms / CLS<0.1 on mid-tier mobile (before/after recorded).
- [ ] LCP preloaded + responsive modern-format images; critical CSS inlined.
- [ ] Heavy JS deferred/lazy-loaded; long tasks broken up; inputs debounced.
- [ ] `check:images` + `audit:web` pass; `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
