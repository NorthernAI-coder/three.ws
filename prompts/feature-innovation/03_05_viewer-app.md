# 🚀 Innovation Brief — 3D Viewer / Editor (main app)

> **Task file:** `prompts/feature-innovation/03_05_viewer-app.md`
> **Surface:** `/app`
> **Primary source:** `pages/app.html`, `src/app.js` (~2596 lines), `src/viewer.js`, `src/editor/index.js`, `src/validator.js`, `src/account.js`, `src/wallet.js`, `src/erc8004/*`, `src/widgets/*`, `src/components/screenshot-modal.js`, `src/next-layout.js`
> **Atlas reference:** `docs/ux-flows/03-3d-editing-viewer.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

`/app` is the heart of three.ws — the surface where a 3D agent comes alive. It's a drag-drop glTF/GLB viewer *and* inspector *and* editor *and* the runtime home of an on-chain agent, all dispatched by route mode (default avatar, kiosk, deploy, showcase, on-chain, widget embed, authenticated agent-edit). The default CZ avatar loads for everyone, anonymous included; signed-in owners get the dat.GUI/Next-layout editor, material/texture tools, animation dock, agent chat, screenshots, GLB export, save-to-account, validation, and cross-links to Composer/Studio/deploy.

"Gamechanging" here means reinventing the **drag-drop glTF viewer/inspector** so it's not "a model on a turntable with sliders," but the most alive, most useful agent canvas on the web. A first-time visitor should drop a GLB and within seconds *feel* the platform — see it lit beautifully, inspect it deeply, animate it, fix it, and turn it into a live agent. The viewer is the front door; make it irresistible and make every path from it lead somewhere meaningful.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (`<model-viewer>`, Babylon Sandbox, Sketchfab, gltf.report, three.js editor, Spline embeds). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/app` (and its mode variants: kiosk, `/deploy`, `/showcase`, on-chain `/a/<chain>/<id>`, chat embed `/a/<uuid>?embed=1`, `#widget=<id>`, `?agent=<uuid>`). `vite.config.js` → `pages/app.html` → `src/app.js`.
- **Source:** `<script defer type="module" src="/src/app.js">` (app.html:57). `_bootApp()` constructs `new App(document.body, location)`, exposes `window.VIEWER.app` (app.js:2583-2596). The constructor (app.js:162-401) parses hash+query into `this.options`, conditionally builds dropzone/avatar-creator/layout/nav, dispatches on route mode, inits the agent system + widget bridge.
- **Current flow:** ~3 required steps — arrive → model auto-loads → view/orbit; plus ~11 optional (load own model, GUI controls, animations, env/lights/camera, material/texture editing, screenshot, export GLB, save to account, validate review, cross-links, agent chat).
- **What works today:** Auto-load `?resume=<token>` else `options.model || '/avatars/cz.glb'`; default CZ crossfades into a "taunt" landing clip (app.js:451-486). `view()` → WebGL check → `createViewer()` → `viewer.load(url,…)` with progress → attach avatar, notify editor, configure animations, set AR target, run validator (app.js:1783-1876). Load own model: `SimpleDropzone` drag-drop `.glb`/`.gltf`/folder, `#file-input`, `?model=`/`#model=` (host-validated by `isSafeQueryModelUrl`), `?agent=<uuid>`. dat.GUI / Next-layout editor: Display, Lighting (IBL/envMap, exposure, tone mapping, punctual), Light Probes, Animation, Morph Targets, Cameras, Agent follow, Performance. Animations from `/animations/manifest.json` (`?anim=` honored), dock with picker/scrubber/loop. `Editor` (`MaterialEditor`, `TextureInspector`, `SceneExplorer`, `MagicBrush`) rebuilt per model. Screenshot → `ScreenshotModal`. Export GLB (+ postMessage `exportGLB` base64 bridge). Save edits (R2 presign+upload+PATCH) / Save to account (sign-out → stash + `/login?next=…`; sign-in → save GLB, create/link agent, redirect `/agent/<id>`). Validator runs on every non-kiosk load (badge + lightbox). Cross-links: "Make this a widget" → `/studio?model=`, "Open in Composer" → `/compose?glb=`, "Deploy on Solana" → guided agent. NichAgent chat/voice + thought bubble.
- **Real APIs / dependencies already wired:** `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/avatars/<id>`, `GET /api/agents/<id>`, `GET /api/agents/me`, `POST /api/agents`, `PUT /api/agents/<id>`, `POST /api/avatars/thumbnail`, `POST /api/widgets/<id>/view`, `GET /animations/manifest.json` + `HEAD /animations/*.glb`; `saveRemoteGlbToAccount` (R2); editor save (R2); on-chain dynamic imports (`erc8004/queries|abi|register-ui|showcase`) + Solana/ETH RPC; IPFS/Arweave resolution (`ipfs.js`). In-browser `gltf-validator`. AR: USDZ (iOS) + GLB (Android).
- **Where it's mediocre, thin, or unfinished:** `app.js` is a ~2596-line monolith carrying seven route modes — the *default viewer experience* is buried under embed/widget/on-chain plumbing and feels generic the moment a model loads (a model + a dat.GUI panel). dat.GUI is a developer aesthetic, not a product UI; the Next-layout is partial. Inspection is shallow vs gltf.report (no node tree drill-down, no per-material/texture/draw-call breakdown surfaced beautifully, no scene graph search). The anonymous experience is a gate overlay over the CZ avatar — it tells you to sign in rather than *wowing* you first. Cross-links exist but the "what do I do with this model" journey isn't guided. No comparison/diff of two models, no shareable viewer permalink with camera state, no presentation/embed polish to rival Sketchfab.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **A drop-to-wow first impression.** The instant a GLB lands, auto-frame, auto-light with a flattering studio HDRI, kick a subtle idle/turntable, and surface a clean inspector + "what next" rail — replace the dat.GUI-on-a-turntable feel with a product-grade canvas a first-timer screenshots immediately.
- **Deep, beautiful inspection** to beat gltf.report: a searchable scene-graph tree (meshes, materials, textures, animations, morph targets, bones), per-node stats (tris, draw calls, texture memory), click-a-node-to-isolate/highlight, and a materials/textures gallery — inspection that's a joy, not a JSON dump.
- **Shareable viewer permalinks with camera + display state.** Encode camera, env, active animation, and display toggles into a URL (the share codec pattern exists in `pose-share.js`) so a creator can send a framed, lit, posed view — a Sketchfab-grade embed, but yours.
- **A guided "turn this model into an agent" path.** From any dropped GLB, walk the anonymous/owner straight through: name it → validate (hand off to `/validation`) → dress it (`/compose`) → animate it (`/pose`) → deploy on-chain — the viewer becomes the on-ramp to the whole platform instead of a dead-end turntable.
- **Cross-feature wiring:** Make `/app` the hub it's positioned to be — every adjacent surface should be one intentional click away *and* round-trip back, owned animations/outfits/validation-badges should render here, and the on-chain agent card should reflect exactly what you see in the viewer. Also factor the default-viewer experience out of the route-mode monolith so it can be made excellent without risking the embed/widget paths.
- **Compare two models side-by-side** (before/after optimization, two avatar variants) with synced cameras — a genuinely novel inspector feature.

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
4. **Delete this task file** — `prompts/feature-innovation/03_05_viewer-app.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/03-3d-editing-viewer.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
