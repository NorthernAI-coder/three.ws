# 🚀 Innovation Brief — GLB Playground & Embed Generator

> **Task file:** `prompts/feature-innovation/10_03_playground.md`
> **Surface:** `/playground`
> **Primary source:** `pages/playground.html` (self-contained inline `<script>` IIFE; Google `<model-viewer>` via CDN)
> **Atlas reference:** `docs/ux-flows/10-chat-brain-labs.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user drags a `.glb` onto `/playground` to **see their 3D model instantly and walk away with embed code that works**. They're a developer, an agent creator, or a curious visitor who just exported a model and wants to confirm it looks right and put it on their site in 30 seconds — no account, no upload, no build step. This surface exists to be the fastest, friendliest GLB preview-and-embed tool on the web, and a frictionless on-ramp into the rest of three.ws.

"Gamechanging" here means reinventing the **instant GLB embed playground**: a viewer so good people use it as their daily GLB inspector, an embed generator that produces *configured, copy-paste-perfect* code (not a bare tag), and a quiet bridge that turns "I just previewed a model" into "I deployed it as an avatar / launched a hosted page." Make it the tool people bookmark.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (glTF Viewer by donmccurdy, Babylon Sandbox, Sketchfab uploader, model-viewer's own editor). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new — a GLB playground that inspects, validates, configures, and exports better than any free tool out there, and that makes the embed snippet feel like a finished product.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/playground` → `pages/playground.html` (H1 "Playground").
- **Source:** `pages/playground.html` — **fully self-contained**: an inline `<script>` IIFE, no `/src` module import. Rendering via Google `<model-viewer>` loaded from CDN. (Note: `src/api-playground.js` exists but is a *different* surface — an API console — and is **not** wired into `/playground`.)
- **Current flow:** 5 required (+1 optional) steps — open with default avatar (`/avatars/default.glb`) in the `<model-viewer>` → drag-drop / upload / file-pick a `.glb`/`.gltf` → model loads with a loading indicator, file info (name, size, animation count) populates → (optional) pick an animation, play/pause, adjust exposure, orbit/zoom → copy the generated `<model-viewer>` embed code from the embed panel.
- **What works today:** drag-drop + file-picker ingest; default-vs-uploaded model; loading indicator; file metadata readout; animation dropdown + play/pause when clips exist; exposure slider; orbit/zoom; copyable embed snippet; transient status line (auto-clears ~3s).
- **Real APIs / dependencies already wired:** Google model-viewer CDN (`ajax.googleapis.com/.../model-viewer.min.js`). **No backend calls** — all parsing is in-browser via model-viewer. Files stay client-side; no auth, no wallet, no $THREE.
- **Where it's mediocre, thin, or unfinished:** the embed code is a **bare tag** — it ignores the exposure/animation/camera the user just dialed in, and it warns that local files need hosting but offers *no path to host them*, so the embed is frequently dead on arrival. No model inspection beyond name/size/clip-count (no mesh/material/triangle/texture stats, no validation warnings, no draw-call or filesize budget guidance). No lighting/environment controls (HDR, skybox, background, shadow), no hotspots, no camera-angle presets, no screenshot/poster export. No way to load a model by URL. Zero connection to the rest of the platform — a previewed model can't become an avatar, a hosted page, or an agent.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Embed code that captures the actual scene:** generate a snippet that bakes in the user's chosen exposure, environment, camera-orbit, auto-rotate, animation, and shadow — plus framework variants (raw HTML, React, Svelte) and a one-click "copy" / "open in CodePen-style sandbox." The snippet should reproduce *exactly what they're looking at*.
- **Solve the dead-embed problem with real hosting:** offer "Host this model" that uploads the GLB to platform storage and returns a stable CDN URL wired straight into the embed — so the copied code works on the first paste instead of warning the user it won't.
- **A real inspector + validator:** surface triangle count, draw calls, material/texture list, total + per-texture byte budget, animation list with durations, and actionable warnings (oversized textures, missing tangents, non-power-of-two, ungrouped meshes) — the kind of feedback that makes creators *fix* their model. Add lighting/environment controls (HDR presets, background, shadow intensity), camera presets, and a poster/screenshot export.
- **Load by URL + shareable scene state:** accept a `?src=<glb-url>` param and encode the full viewer configuration into a shareable permalink, so "look at my model with these settings" is one link.
- **Cross-feature wiring (required):** turn the playground into an on-ramp — a previewed/hosted GLB should offer one-click **"Use as avatar in `/chat`"** (`?avatar=<glb>`), **"Build a hosted page in `/launchpad`"** (prefill the avatar slot), **"See it in the world `/play`"**, and **"Test lip-sync in `/lipsync`"**. The same hosted URL feeds `/agents/:id` avatar fields. A model never dead-ends in the viewer.

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
4. **Delete this task file** — `prompts/feature-innovation/10_03_playground.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/10-chat-brain-labs.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
