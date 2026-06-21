# A6 — Performance & Web Vitals

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none —
this prompt owns its own lane and can run in parallel with A1–A5 (it shares only `ci.yml` with A5;
coordinate there).

## Why this matters for $1B
Performance is trust the user feels before they read a word. A 3D platform that ships a multi-MB GLB
on the critical path, janks on scroll, or shifts layout under the user's cursor reads as a prototype,
not a $1B product. `00b-the-bar.md` §2 sets the hard numbers: **LCP < 2.5s, CLS < 0.1, INP < 200ms on
a mid-tier mobile over 4G, on every primary surface**; 3D loads progressively; no FOUC. Speed is also
growth — every 100ms of LCP is activation lost. This prompt makes the numbers real and keeps them real.

## Current state (read before you write)
- `.lighthouserc.json` already exists. `scripts/optimize-glb.mjs` and `scripts/compress-glbs.mjs`
  exist for asset compression. `inject-theme-boot.mjs` boots the theme before paint (the status page
  and others already inline the theme-boot script — no-flash is partly solved).
- `.github/workflows/ci.yml` runs lint/vitest/source-guards/typecheck but **does not run Lighthouse**.
- Three.js powers the 3D surfaces (Forge, avatar presence, viewers). It's heavy; verify how/where it's
  imported and whether it's on the critical path of pages that don't need it immediately.
- **The gap:** Core Web Vitals are not measured or budgeted in CI; `.lighthouserc.json` is unenforced;
  GLB compression isn't proven applied to shipped assets; Three.js lazy-loading and GPU disposal are
  inconsistent. Read the actual import graph and asset sizes before optimizing — measure first.

## Your mission
### 1. Wire Lighthouse CI as an enforced gate with real budgets
Flesh out `.lighthouserc.json` with assertions that enforce the §2 budgets (LCP < 2.5s, CLS < 0.1,
INP < 200ms — plus TBT/total-byte-weight guards) on the **primary surfaces** (home, Forge, an agent
profile, the marketplace, the status page). Add a Lighthouse job to `.github/workflows/ci.yml` that runs
on a mobile/4G throttle profile and **fails the build** when a budget regresses. Append the job
additively — **A5 also edits `ci.yml`** (test jobs); coordinate, don't reformat, stage explicit hunks.

### 2. Lazy-load Three.js and every heavy module off the critical path
Trace the Three.js import graph. Any surface that doesn't render 3D above the fold must not pay for
Three.js in its initial bundle — dynamic-`import()` it on demand behind a real loading skeleton (not a
spinner, not a `setTimeout` fake). Same for other heavy deps (wallet SDKs, charting). Verify in the
network tab that the 3D chunk loads only when a 3D surface is actually entered.

### 3. Compress GLBs and load them progressively
Run `scripts/optimize-glb.mjs` / `scripts/compress-glbs.mjs` over the shipped GLB assets (draco/meshopt)
and confirm the size drop. No surface blocks on a multi-MB model: stream/lazy-load the GLB with a
skeleton that matches the final layout, and **dispose GPU resources on unmount** (geometries, materials,
textures, renderer) so navigating away doesn't leak memory or tank the next surface's frame rate.
Target 60fps on the avatar presence and no jank on scroll.

### 4. Kill layout shift and FOUC on every primary surface
Confirm theme/tokens/fonts resolve before content paints (build on `inject-theme-boot.mjs`); reserve
space for async content (images, 3D canvases, lists) with explicit dimensions/aspect-ratios so nothing
shifts; preload the critical font; set `font-display` sensibly. CLS < 0.1 means the page doesn't move
under the user — verify with the Lighthouse trace, not by eye.

### 5. Mobile performance pass
Test the budgets on a mid-tier mobile profile at 320px and 768px. Debounce input handlers, paginate long
lists, use `transform`/`will-change` for animations (and honor `prefers-reduced-motion`), avoid main-
thread-blocking work during interaction (INP). Defer non-critical third-party scripts. The first-run
path (`00b-the-bar.md` §5: value in < 60s) must be fast on a phone, not just a laptop.

### 6. Prove the numbers and hold them
Run Lighthouse on each primary surface before/after and record the LCP/CLS/INP deltas in your report.
The CI gate then holds them: a future PR that regresses a budget fails. Document the budgets and how to
read a failing Lighthouse run in `docs/ops/`.

## Definition of done
Clears `00b-the-bar.md` §2: every primary surface meets LCP < 2.5s, CLS < 0.1, INP < 200ms on a
mobile/4G profile, enforced by a **merge-blocking** Lighthouse CI job; Three.js and heavy modules are
lazy-loaded behind real skeletons; shipped GLBs are draco/meshopt-compressed with progressive load and
GPU disposal; no FOUC or layout shift on primary surfaces; mobile is fast at 320/768px. Before/after
numbers in the report. Inherits the global definition of done in `00-README-orchestration.md`.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs — **no `setTimeout` fake-loading or fake progress bars**;
real async with real skeletons only. `$THREE` is the only coin. Design tokens only (`public/tokens.css`)
for any skeleton/loading UI. Stage explicit paths only (never `git add -A`); re-check `git diff --staged`
before commit (watch the `npx vercel build` `api/*.js` bundling trap if you build). You own
`.lighthouserc.json`, the Lighthouse job in `ci.yml` (shared with A5 — append, don't reformat), the GLB
scripts, and the lazy-load wiring in `src/` 3D entry points. Don't rewrite working render code — extend
its loading/disposal.

## When finished
Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. a route-level prefetch of the 3D
chunk on hover, or an OG-image perf win). Append a `data/changelog.json` entry (tag: `improvement`) —
"the app got faster" is user-visible. Then delete this prompt file
(`prompts/production-campaign/A-reliability/A6-performance-web-vitals.md`) and report the before/after
Web Vitals per surface, the GLB size reductions, and any surface that can't yet hold a budget and why.
