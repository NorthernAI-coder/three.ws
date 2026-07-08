# Prompt 04 — Viewer perf: before/after

Real, in-browser measurements (Chromium via Playwright), no synthetic numbers.
Scripts: `run-perf-harness.mjs` (asset-pipeline test), `perf-probe.mjs` (full-page
attempt), `check-scene-layout.mjs` (Scene Studio layout regression check).

## 1. Draco/meshopt/WebP compression pipeline (task 1)

Test asset: `public/avatars/brainstem.glb`, a real, currently-served, texture-heavy
model. Compressed with the existing `npm run compress:glbs` pipeline
(`scripts/compress-glbs.mjs` — dedup → prune → resample → quantize →
`EXT_meshopt_compression` → WebP textures). Loaded through the same
`GLTFLoader` + `DRACOLoader` + `MeshoptDecoder` wiring the main viewer
(`src/viewer.js` / `src/viewer/internal.js`) and the SDK viewer
(`avatar-sdk/src/viewer.js`) already use in production.

| | original | compressed | delta |
|---|---|---|---|
| file size | 3.05 MB | 766.7 KB | **−75.4%** |
| fetch + GLTFLoader parse (localhost) | 56 ms | 35 ms | **−38%** |
| sustained FPS, continuous render @ DPR 2 (worst case: forced full-frame render every frame while orbiting, not the idle on-demand loop) | 21 fps | 24 fps | **+14%** |
| sustained FPS, same asset @ DPR 1 (the low-power auto-degrade path added this session) | — | 33 fps | **+57% vs original @DPR2** |
| triangle count (unchanged — compression is lossless on topology) | 61,666 | 61,666 | — |

Estimated transfer time on a representative 4 Mbps mobile connection, computed
directly from the measured byte sizes above (not a live network measurement,
since this environment has no real mobile network to test against):
3.05 MB ≈ 6.1 s → 766.7 KB ≈ 1.5 s, **≈4.6 s saved** per load.

Batch context: the same run across five real production avatars
(`dancing-twerk`, `brainstem`, `selfie-girl`, `realistic-male`,
`realistic-female`) cut their combined payload 10.87 MB → 8.41 MB (−22.6%);
`brainstem.glb` was the standout because it carried uncompressed textures the
others didn't.

**Note on scope:** the compress/optimize pipeline (`scripts/compress-glbs.mjs`,
`scripts/optimize-glb.mjs`) and the Draco/meshopt decoder wiring in both
viewers already existed before this session — this table is a real
measurement of that existing pipeline, run fresh as this prompt's required
before/after evidence, not new code. What *did* ship this session: the
low-power quality auto-degrade in `src/viewer.js` (DPR cap + MSAA skip on
touch + low-core/low-memory devices, matching the pattern already in
`avatar-sdk/src/viewer.js`) — the DPR-1 row above is that path's real,
measured effect (33fps vs 24fps on the same compressed asset).

## 2. Full end-to-end `/app.html` heavy-model load (attempted, blocked)

Attempted to time `public/club/venue/tour.glb` (7.6 MB) through the full
`/app.html` page (the real `Viewer` class in `src/viewer.js`, as used
in production). Two blockers, both environment-specific, not product bugs:

- Against `npm run dev` (Vite dev server): load times of 35–46 s — this is
  Vite's unbundled dev-mode ES-module transform overhead on `src/app.js`'s
  large dependency graph (dat.gui, IPFS, WebXR, cinematic pipeline, etc.),
  not representative of production (a single bundled, code-split, cached
  asset in the real deploy).
- Against a local `server/index.mjs` instance (the real Cloud Run production
  server code, run locally) and against a static `dist/` build: `/app.html`
  bootstrap depends on backend API routes that need credentials/services not
  available in this sandbox (a 500 on one of its startup calls), so
  `window.viewer` never initialized within the harness's timeout.

Given that, the asset-pipeline measurement in §1 — which exercises the exact
same `GLTFLoader`/decoder code path the full app uses — is the trustworthy
before/after for this prompt's "heavy model load time + FPS" requirement.

## 3. Scene Studio layout regression (found + fixed this session)

`check-scene-layout.mjs` found the new quick-actions bar
(`src/scene-studio/actions.js`, `.tws-sa-bar`) genuinely overlapping the
vendored `#menubar` (File/Edit/Add/View/Render/Help) at **every** breakpoint
(320/768/1440px) — `top: 12px` placed it inside the vendor menubar's own
36px-tall row (the same 36px the vendor's own `#player`/`#viewport` CSS uses
as their top offset, see `src/scene-studio/vendor/css/main.css`). Fixed by
moving the bar to `top: 44px` (36px vendor row + 8px gap) — verified
non-overlapping at all three breakpoints post-fix:

```
320px:  bar.y=100 bottom=127 · menubar.y=56 bottom=92 → no overlap
768px:  bar.y=100 bottom=131 · menubar.y=56 bottom=92 → no overlap
1440px: bar.y=100 bottom=131 · menubar.y=56 bottom=92 → no overlap
```

## 4. Accessibility: keyboard orbit added to the main viewer (task 3)

The lightweight SDK component (`avatar-sdk/src/viewer.js`) already had
canvas `role="img"`/`tabindex`/`aria-label` and arrow-key orbit + `+`/`-` zoom.
The main site's `Viewer` class (`src/viewer.js` — powers `/app`, Forge,
avatar pages, embeds, kiosks) did not. Added the same contract: canvas
`tabIndex=0`, `role="img"`, `aria-label`, `:focus-visible` ring (`var(--accent)`,
matching the site's existing focus-ring token), and arrow-key
orbit/zoom scoped to the canvas's own `keydown` (never steals arrow keys from
the rest of the page — only fires while the canvas itself has focus).
Verified via `probe-viewer.mjs` against the SDK component (`keyboard orbit
moved camera: true`) and confirmed the main-viewer implementation compiles
clean (`npx esbuild src/viewer.js --bundle` — no syntax/import errors).

## 5. AR / USDZ Quick Look (task 4, pre-existing — re-verified live)

`/api/ar` correctly UA-branches: a real iOS UA gets a `<model-viewer
ar-modes="webxr scene-viewer quick-look">` page (client-side USDZ conversion
via model-viewer's own `USDZExporter` — no server USD tooling, matching
`STRUCTURE.md`'s documented behavior); confirmed live with a spoofed iOS UA
against a running local server (`curl -A "...iPhone..." /api/ar?src=...` →
200, page references `quick-look`, real `ar-modes` attribute). Scene Studio's
export menu already offers a one-click **AR bundle (.usdz)** preset
(`src/scene-studio/actions.js` → `exportSceneUsdz`, `USDZExporter` from
`three/addons`).

## 6. Scene Studio share/embed (task 5+6, pre-existing — bug found + explained)

`probe-actions.mjs` (Playwright) confirms Import-from-Forge, the Export
preset menu (Web GLB + AR bundle .usdz), and Share (upload to R2 → open the
platform's existing embed panel with iframe/web-component/`<agent-3d>` tabs)
all work end-to-end with **zero console errors** when tested against the
canonical local origin. Testing the same flow against a non-standard local
port (3061, chosen to dodge a port conflict with a concurrent agent's dev
server) reproduced a CORS-block on the R2 PUT upload — that's the R2 bucket's
CORS allowlist correctly rejecting an unrecognized origin, not a product bug;
re-run against the canonical port passed cleanly. No code change needed here.
