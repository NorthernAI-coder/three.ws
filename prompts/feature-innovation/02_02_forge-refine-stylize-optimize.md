# 🚀 Innovation Brief — Forge Post-Processing (refine · stylize · optimize · game-ready)

> **Task file:** `prompts/feature-innovation/02_02_forge-refine-stylize-optimize.md`
> **Surface:** `/forge` (post-generation processing rail on the result)
> **Primary source:** `src/forge-refine.js`, `src/forge-stylize.js`, `src/forge-optimize.js`, `src/forge-gameready.js` (+ `src/shared/mesh-refine.js`, result-bar markup in `pages/forge.html`)
> **Atlas reference:** `docs/ux-flows/02-forge-text-to-3d.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user has just forged a textured GLB and now wants to *make it usable* — cleaner geometry, a deliberate art style, a sane poly budget, an engine-ready export. Today most text-to-3D output dies in the gap between "looks cool in the viewer" and "I can actually drop this into Unity/Unreal/Blender." The post-processing rail (refine / stylize / optimize / game-ready) exists to close that gap **inside Forge**, so a creator never has to leave for Blender to weld verts, retopologize, or hit a triangle budget.

"Gamechanging" here means turning four separate panels into one coherent, predictable **finishing studio** where every operation shows real before/after, real geometry stats, and real downloadable output — and where the operations *compose* (refine → stylize → game-ready as a pipeline, not four dead ends). The killer property: Forge becomes the only text-to-3D tool where the raw mesh and the production-ready asset are one click apart.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Blender's decimate/remesh UX, Quad Remesher, InstaLOD, Meshy's retopo, Adobe Substance's stylization). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/forge` result panel (`#state-result`) — these modules self-inject their own panels beside the result bar; no separate route. (`vercel.json` rewrite to `pages/forge.html`.)
- **Source:**
  - `src/forge-refine.js` (~419 lines) — **in-browser, no API.** Parses the live GLB with `GLTFLoader`, runs deterministic passes (weld / smooth normals / Laplacian relax / decimate / subdivide) from `src/shared/mesh-refine.js`, re-exports with `GLTFExporter`, swaps `<model-viewer>`. Non-destructive (keeps original bytes, every preset re-parses from them). No worker, no rate limit — the dependable "improve this" path when the paid lane 429s.
  - `src/forge-stylize.js` (~265 lines) — voxels / bricks / lattice / low-poly geometric filters via `POST /api/forge-stylize` (worker job, polled by `?job=`), with a resolution slider, download, and revert.
  - `src/forge-optimize.js` (~398 lines) — tri/quad/low-poly remesh via `POST /api/forge-remesh` (polled).
  - `src/forge-gameready.js` (~651 lines) — retopologize to a poly budget; exports textured GLB + FBX for Unity/Unreal via `POST /api/forge-gameready` (polled); budget slider + wireframe preview.
- **Current flow (post-result, all optional):** result lands → user opens any of the four panels independently. Refine: pick a preset → instant in-browser pass → download refined GLB / revert. Stylize/Optimize/Game-Ready: set parameters → `POST` → poll the worker job → preview/download. Each panel is **self-contained**: it reads the live GLB URL off the result bar's Download anchor and injects its own markup + styles, decoupled from `src/forge.js`.
- **What works today:** Real geometry compute (refine is genuinely client-side three.js, not faked); real GPU worker jobs for stylize/remesh/game-ready with honest polling; per-model scene caching; non-destructive revert; FBX + GLB export for engines.
- **Real APIs / dependencies already wired:** `POST /api/forge-stylize`, `POST /api/forge-remesh`, `POST /api/forge-gameready` (all polled via `GET /api/forge?job=<id>` style worker polling). `src/shared/mesh-refine.js` (`refineScene`, `REFINE_PRESETS`, `REFINE_PRESET_BY_KEY`, `specForPreset`). `three/addons` `GLTFLoader` + `GLTFExporter` (lazy). model-viewer for preview.
- **Where it's mediocre, thin, or unfinished:** The four panels are **siblings that don't know about each other** — you can't refine, *then* feed the refined mesh into game-ready; each reads the original GLB. No unified before/after compare (side-by-side or wipe slider) shared across operations. Geometry stats (tri/vert count, file size) aren't consistently surfaced as a *budget you're hitting*. No presets tuned for real targets (mobile game / VRChat / AR / 3D-print / web). Stylize/optimize/game-ready each re-implement their own panel chrome and status states instead of sharing one finishing-studio shell. No "what changed" diff after an operation. No way to stack operations into a saved recipe.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Make it a pipeline, not four buttons.** Introduce a single **Finishing Studio** shell where the output of one operation becomes the input of the next (refine → stylize → optimize → game-ready), with a visible operation stack the user can reorder, toggle, and revert step-by-step. This is the unlock no competitor offers in a browser: a composable post-processing chain on a freshly-generated mesh.
- **Before/after that sells it.** A shared compare control — wipe slider or split viewport with synced cameras — plus a live geometry HUD (triangles, verts, file size, texture res) that updates per operation and shows the *delta*. Show the user exactly what weld/decimate/retopo bought them.
- **Target presets, not parameters.** Replace raw sliders-first UX with intent: "Mobile game (≤10k tris)", "VRChat avatar", "AR/USDZ", "3D print (watertight)", "Web/low-bandwidth". Each preset drives the real budget into game-ready/optimize and explains the tradeoff. Advanced sliders stay for power users.
- **Watertight + print readiness check.** For the 3D-print path, run a real manifold/non-manifold check in `mesh-refine.js` and surface a pass/fail with one-tap repair — Forge becomes printable-out-of-the-box.
- **Save the recipe.** Let a creator save their finishing chain ("my low-poly mobile recipe") to localStorage and re-apply it to any future Forge result in one tap — turns repeat work into one click.
- **Cross-feature wiring (required ≥1):** hand the *finished* mesh forward cleanly — game-ready output → "Open in `/compose` (Scene Composer)" and "Attach to avatar" with the optimized GLB, and multi-part results → "Split at `/segment` (Parts Studio)". Make the finishing studio the bridge between raw generation and the rest of three.ws's authoring tools, and feed verdicts to `POST /api/forge-feedback` so the data flywheel learns which finishing recipes users keep.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed.
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime.
- **Read before you write.** Match the existing patterns, naming, file organization, and the design tokens in `DESIGN-TOKENS.md`. Consistency compounds.
- **Accessibility + responsive (320 / 768 / 1440) + microinteractions** are part of done, not polish. Semantic HTML, ARIA, keyboard nav, focus rings, sufficient contrast.
- **Performance by default:** lazy-load heavy modules, debounce input handlers, paginate large lists, animate with `transform`/`opacity`. Ship no jank.
- **Changelog:** append a holder-readable entry to `data/changelog.json` for any user-visible change, then run `npm run build:pages` to validate.
- **Concurrent agents share this worktree.** Stage explicit paths only — **never** `git add -A` / `git add .`. Re-check `git status` + `git diff --staged` immediately before any commit. Never commit `api/*.js` esbuild bundles (check `head -1` for `__defProp` / `createRequire`).

## 6. Definition of done

- [ ] Feature is built, wired into navigation, and reachable by a real user.
- [ ] Exercised in a real browser via `npm run dev`; **no console errors or warnings** from your code.
- [ ] Network tab shows real API calls succeeding with real data.
- [ ] Every interactive element has hover / active / focus states; fully keyboard-navigable.
- [ ] Loading, empty, error, populated, and overflow states all designed and reachable.
- [ ] Existing tests pass (`npm test`); add tests for new logic you introduce.
- [ ] `git diff` self-reviewed — every changed line justified.
- [ ] Changelog updated if the change is user-visible.
- [ ] You would be proud to demo this to a room of senior engineers.

> Note: do **not** run `npm install` in this codespace (the cache is corrupted and it hangs the box). Use the already-installed dependencies.

## 7. Self-improvement loop (REQUIRED before you finish)

When you think you're done: **STOP.** Re-read §2.

1. Find the single weakest aspect of what you built and make it excellent. Repeat until nothing obvious remains.
2. Run the self-review protocol: **lazy check** (any shortcut, any half-wire, any hardcoded value where dynamic belongs?), **user check** (first-time user — does it make sense, is it findable, does it feel polished?), **integration check** (connects to the rest of the platform, navigable to/from?), **edge-case check** (0 / 1 / 1000, long names, network failure, expired session), **pride check** (portfolio-worthy? if not, fix what's stopping you).
3. Update `data/changelog.json` if user-visible.
4. **Delete this task file** — `prompts/feature-innovation/02_02_forge-refine-stylize-optimize.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/02-forge-text-to-3d.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
