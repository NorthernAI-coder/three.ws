# 🚀 Innovation Brief — Scene Composer

> **Task file:** `prompts/feature-innovation/03_02_scene-composer.md`
> **Surface:** `/compose`
> **Primary source:** `pages/compose.html`, `src/scene-compose.js`, `src/shared/log.js`
> **Atlas reference:** `docs/ux-flows/03-3d-editing-viewer.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is an agent owner who wants their avatar to look unique — to wear gear, hold props, carry accessories — without modeling anything. Scene Composer is text-to-3D dressing: forge an item from a prompt (`/api/forge`), attach it to an avatar bone (Head/Torso/Arms/Legs), and save it as the avatar's outfit (`PATCH /api/avatars/:id`). It's the equip screen of the platform.

"Gamechanging" here means reinventing **dressing and equipping** so it feels like a stylist, not a 3D toolchain. Today the user prompts, waits, gets a blob, and manually parents it to a bone with a `<select>`. The best version understands intent ("give me a samurai loadout"), auto-fits the item to the avatar's proportions, snaps it to the right attachment point automatically, and lets the user build, save, and switch between named outfits like a wardrobe. Make it the thing people use to make their agent *theirs* — and to flex it.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (game character creators — Fortnite/ZEPETO/Ready Player Me wardrobes, Roblox avatar editor, VRoid Studio). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/compose` (`vite.config.js` → `pages/compose.html` → `src/scene-compose.js`).
- **Source:** `<script type="module" src="/src/scene-compose.js">` (compose.html:377). Sets up renderer/scene/PMREM env, OrbitControls, `TransformControls` gizmo, undo/redo stack; on IIFE boot reads `?glb=` / `?avatar=` and renders the hierarchy (scene-compose.js:107-120, 940-964, 1343).
- **Current flow:** ~5 required steps — arrive → forge (or import) → select → transform → export; plus ~7 optional (load/browse/skip avatar, intent chips, bone attach, rename/visibility, camera presets, screenshot, save outfit).
- **What works today:** Forge from text with intent chips (accessory/item/scene/creature/vehicle → `model_category`), staged progress bar, poll `/api/forge?job=<id>` every 3s until `done`/`failed`/timeout (scene-compose.js:1071-1142). Load avatar by URL, **Browse** modal from `/api/explore?type=avatar&limit=24`, or **Skip** (scene-compose.js:967-999). Click-to-select + hierarchy list `#ol`; gizmo translate/rotate/scale, world/local (X), grid snap (Ctrl+G), duplicate (Ctrl+D), frame (F). Bone-attach: when an avatar with bones is loaded, the inspector shows a region-grouped bone `<select>`; choosing one calls `attachToBone` to parent the item under the bone (scene-compose.js:783-895). Rename/visibility/delete with disposal; camera presets; screenshot → `scene-compose.png`; Export GLB bundles visible non-bone-attached objects → `scene-compose.glb`; **Save outfit** PATCHes `/api/avatars/<id>` with `accessories` (bone, glbUrl, name) (scene-compose.js:1284-1335).
- **Real APIs / dependencies already wired:** `POST /api/forge` + `GET /api/forge?job=<id>` (with `x-forge-client` header from a generated `forge_client_key` in localStorage); `GET /api/forge-gallery?limit=24`; `GET /api/explore?type=avatar&limit=24`; `GET /api/avatars/<id>`; `PATCH /api/avatars/<id>`. Imports GLB/glTF (URL/file); exports binary GLB + PNG.
- **Where it's mediocre, thin, or unfinished:** Attachment is manual and dumb — the user must *know* which bone, pick it from a dropdown, then hand-fit position/rotation/scale; nothing auto-fits to the avatar's size or snaps to a sensible anchor. There's no concept of an **outfit you can name, switch, or own multiple of** — it's a single `accessories` blob per avatar. No symmetry (one glove ≠ two gloves). No re-dressing a previously forged item (the forge gallery exists at `/api/forge-gallery` but isn't a first-class wardrobe). No live preview of the avatar's idle animation while dressed. No sharing an outfit, no "remix someone's look." Saving requires an `/api/avatars/<id>`-sourced avatar; otherwise it dead-ends at "Use Export GLB."

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Auto-fit + auto-attach.** When an item is forged or dropped, infer the right bone from its `model_category`/prompt and the avatar skeleton, snap it to that anchor, and scale it to the avatar's proportions automatically — the `<select>` becomes a correction, not a requirement. A "snap to nearest bone" on drag-release makes manual placement feel magnetic.
- **Named, switchable wardrobe / loadouts.** Turn the single `accessories` blob into multiple named outfits per avatar (extend the avatar save shape), with thumbnails, one-click equip, and a "current look" indicator. Your forged items and `/api/forge-gallery` history become a re-droppable closet, not throwaway blobs.
- **Outfit prompts ("loadout intents").** A single prompt like "cyberpunk street samurai" forges *a coordinated set* (helmet + jacket + blade), each auto-attached — orchestrate multiple `/api/forge` jobs with combined progress, not one item at a time.
- **Symmetry + paired attachments.** Mirror a forged glove/boot/pauldron across the body automatically; one forge, two correctly-placed items.
- **Cross-feature wiring:** A dressed avatar should flow straight into the rest of the platform — "Pose this look" → `/pose?avatar=<id>` (the pose studio already loads `?avatar=`), "Open in Scene" → `/scene?model=<glb>`, and the saved outfit should render on the agent's `/app` and on-chain card. Close the Forge → Compose → Pose → App loop so a look you build here is the look everywhere.
- **Live idle preview while dressing** (play the avatar's idle/taunt clip so gear is judged in motion, not a T-pose) and a one-tap **shareable look card** (turntable PNG/clip) to flex the result.

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
4. **Delete this task file** — `prompts/feature-innovation/03_02_scene-composer.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/03-3d-editing-viewer.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
