# 🚀 Innovation Brief — Scene Studio

> **Task file:** `prompts/feature-innovation/03_01_scene-studio.md`
> **Surface:** `/scene`
> **Primary source:** `pages/scene.html`, `src/scene-studio/main.js`, vendored editor under `src/scene-studio/vendor/js/` (`Editor.js`, `Viewport.js`, `Menubar.*.js`, `Sidebar.*.js`, commands), `src/scene-studio/studio.css`, `src/shared/scene-handoff.js`
> **Atlas reference:** `docs/ux-flows/03-3d-editing-viewer.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a creator — an agent owner, a 3D hobbyist, or a designer — who wants to build, arrange, and export a 3D scene without downloading Blender. Scene Studio is a full vendored Three.js r184 editor running in the browser: viewport, outliner, transform gizmos, material/scene/light editing, scripting, an animation timeline, and a deep export matrix (GLB/GLTF/OBJ/PLY/STL/USDZ/DRC). It already autosaves to IndexedDB and accepts hand-offs from Forge/Parts (`?model=`) and Animation Studio (`?handoff=1`).

"Gamechanging" here means making a **browser** scene editor that creators *prefer* over desktop tools — not because it's lighter, but because it's connected. Desktop editors are islands: they can't pull your three.ws avatars, can't publish to a shareable URL in one click, can't co-edit, and can't drop the result straight onto an on-chain agent. A web editor living inside this platform can do all of that. Invent the workflow that makes a creator say "why would I ever open the desktop app for this."

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Blender, the official three.js editor, Spline, Womp, Bezel, Figma's multiplayer model). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/scene` (`vite.config.js` rewrites `pages/scene.html` → `src/scene-studio/main.js`).
- **Source:** `pages/scene.html` loads the CodeMirror/Draco vendor `<script>` chain then `<script type="module" src="/src/scene-studio/main.js">` (scene.html:84). `main.js` constructs the vendored `Editor`, mounts Viewport/Toolbar/Script/Player/Sidebar/Menubar/Resizer/Animation panels into `#studio-app`, exposes `window.editor`/`window.THREE`, and inits IndexedDB autosave (`editor.storage.init`, main.js:36-144). Surface is dark-locked (main.js:11).
- **Current flow:** ~7 required steps — arrive → import GLB → select → transform (gizmo) → edit material → edit scene (bg/env/fog) → export; plus ~7 optional (deep-link arrival, primitives/lights, scripts, Play, animation timeline, project save/open, render).
- **What works today:** Full vendored editor with Outliner, transform gizmo, Geometry/Material/Scene/light sidebars, CodeMirror scripting, Player, animation panel. IndexedDB autosave debounced ~1s (`savingStarted`/`savingFinished`). Deep-link import: `?model=<glb_url>&name=` validates URL is `https://`/same-origin, fetches, parses via Draco/KTX2/Meshopt GLTFLoader, `AddObjectCommand`, strips query (main.js:186-206). `?handoff=1` reads baked GLB from IndexedDB via `takeSceneHandoff()` and attaches a Play Animation script (main.js:208-251). Drag GLB/glTF or a folder anywhere → `editor.loader.loadItemList`/`loadFiles` (main.js:255-271). Export matrix: GLB, GLTF, OBJ, PLY (ASCII/binary), STL (ASCII/binary), USDZ, DRC, `.json` project, rendered image/video (`Menubar.File.js`:212-435, `Menubar.Render.js`).
- **Real APIs / dependencies already wired:** `fetch(modelUrl)` for `?model=` deep-link; IndexedDB via `editor.storage` (autosave) + `src/shared/scene-handoff.js` (DB `three-ws-scene-handoff`); Draco decoder `/scene-studio/draco/gltf/`, KTX2 transcoder `/scene-studio/basis/` (main.js:163-165); local CodeMirror/esprima/acorn/tern. **No platform API calls today.**
- **Where it's mediocre, thin, or unfinished:** Everything is local and ephemeral — autosave lives only in *this* browser; there is no way to **save a scene to your account, get a shareable URL, or publish it**. No connection to the rest of the platform: you cannot pull your own three.ws avatars/agents or Forge gallery items in as objects (only one-shot `?model=` deep-links from elsewhere). No collaboration, no version history beyond linear undo. Export is download-only — the result never re-enters three.ws (no "deploy this scene", no "use as agent environment"). Asset library is empty; you start from a void every time. No camera bookmarks, no measurement, no presentation mode.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Cloud scenes with shareable URLs + version history.** Persist scenes server-side (presign + R2 like the avatar/animation save paths), give each a `/scene/<id>` permalink that loads read-only or fork-to-edit, and keep a visual snapshot timeline so a creator can roll back. This is the single thing that turns a local toy into a tool people return to.
- **In-editor asset library wired to the platform.** A dockable panel that pulls the creator's own three.ws **avatars** (`/api/avatars`), **agents** (`/api/agents/me`), and **Forge gallery** items (`/api/forge-gallery`) and lets them drag any of those directly into the scene as objects — no copy-pasting URLs. Plus a "Forge an object" box right inside Scene Studio (`POST /api/forge` + poll, mirroring `/compose`).
- **Real-time multiplayer co-editing.** A presence layer (cursors, selection highlights, name tags) and synced commands over a worker/websocket so two creators edit one scene live — the Figma moment desktop editors structurally cannot match.
- **Cross-feature wiring:** "Publish scene → deploy as agent environment." A scene built here should become the world an agent lives in: export the GLB, save to account, then hand off to `/app` / the deploy flow so the on-chain agent renders inside *this* scene. Reciprocally, "Open in Composer" / "Record in Scene" round-trips with `/compose` and `/pose` already exist as concepts — close the loop both directions.
- **Camera bookmarks + one-click presentation/turntable mode** that records a render video (the `Menubar.Render.js` Player already renders) and produces a shareable clip — instant marketing asset.
- **Smart starting points:** curated scene templates (studio lighting, product shot, diorama) instead of an empty void, so the empty state teaches the tool.

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
4. **Delete this task file** — `prompts/feature-innovation/03_01_scene-studio.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/03-3d-editing-viewer.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
