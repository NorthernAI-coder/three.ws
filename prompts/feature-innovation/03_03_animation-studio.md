# 🚀 Innovation Brief — Animation Studio

> **Task file:** `prompts/feature-innovation/03_03_animation-studio.md`
> **Surface:** `/pose`
> **Primary source:** `pages/pose.html`, `src/pose-studio.js` (entry), `src/pose-rig.js`, `src/pose-animation.js`, `src/pose-presets.js`, `src/pose-library.js`, `src/pose-share.js`, `src/animation-library.js`, `src/shared/scene-handoff.js`
> **Atlas reference:** `docs/ux-flows/03-3d-editing-viewer.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a creator who wants their 3D character to *move* — wave, dance, fight, emote — and, increasingly, who wants to **sell** those motions to other agent owners. Animation Studio is a browser keyframe rig: a built-in mannequin (no asset needed), FK/IK posing, preset poses, a curated + AI motion library, a timeline with easing, GLB/JSON export, a scene hand-off to `/scene`, and a real USDC sell flow (R2 presign → upload → `/api/animations/sell`).

"Gamechanging" here means making 3D animation authoring **effortless and novel** — and making animation a real **economy**. Animation is the hardest craft on the platform; most owners will never keyframe. The best version lets a non-animator describe motion in words and refine it on a rig, lets an animator author once and earn forever, and makes a clip a first-class tradeable asset that plays on any avatar across three.ws. Build the place where the platform's motion library is born.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Cascadeur, Mixamo, Adobe Character Animator, Rokoko, Cartwheel/AI text-to-motion, Blender's dope sheet). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/pose` (`vite.config.js` → `pages/pose.html` → `src/pose-studio.js`).
- **Source:** `<script type="module" src="/src/pose-studio.js">` (pose.html:2082). `boot()` on `DOMContentLoaded` builds the Three.js scene/renderer (`preserveDrawingBuffer` for screenshots), OrbitControls, a rotate `TransformControls`, lights/grid/prop layer, mounts the built-in `MannequinRig` from `pose-rig.js` (pose-studio.js:406-408), starts `tick()`. (`src/pose-mannequin.js` and `src/avatar-pose.js` exist but are **not** on this load path.)
- **Current flow:** ~6 required steps — arrive → select bone → FK pose → add keyframe → scrub/play → export; plus ~7 optional (load/switch avatar, scene/model tuning, IK, preset pose, motion library/AI, import pose JSON, save/sell/scene-handoff/screenshot).
- **What works today:** Mannequin mounts at boot with a starting pose (`#p=`/`?p=` shared pose else `contrapposto`). `?avatar=<id>` loads a rigged GLB (`makeGltfRig`), `?anim=<id>` opens a saved clip. Bone select by click (`pickBoneAt`), searchable list, or IK handle. FK: rotate gizmo + X/Y/Z sliders + reset. IK toggle (**I**) drags cyan limb handles → `rig.solveIK` (FK/IK mutually exclusive). Grouped preset poses. **Rigged-GLB only:** curated `AnimationLibrary` cards from `/animations/manifest.json` retarget+play; AI text-to-motion `POST /api/forge-motion` + poll. Timeline: **K** captures keyframe, drag diamonds to retime, per-key easing, name/duration/FPS/loop; transport play/pause/stop/jump, slerp interpolation (`sampleAtTime`). Completion paths: Export JSON, Export GLB (`bakeAnimatedGlb`), **Record in Scene →** (bake → IndexedDB → `/scene?handoff=1`), **Save** (auth-gated, `POST/PATCH /api/animations/clips`), Export pose JSON / PNG, **Sell** for USDC.
- **Real APIs / dependencies already wired:** `GET /api/avatars/:id`; `GET /api/auth/me`; clip CRUD `POST/PATCH/DELETE/GET /api/animations/clips[/:id]` (mine + `include_public=true&visibility=public`); `POST /api/animations/thumbnail`; sell `POST /api/animations/presign` → R2 `PUT upload_url` → `POST /api/animations/sell` (USDC on Base or Solana); `GET /animations/manifest.json`, `POST /api/forge-motion` + poll. Scene handoff via `putSceneHandoff` (IndexedDB) → `/scene?handoff=1`. URL pose codec `#p=`/`?p=` (`pose-share.js`).
- **Where it's mediocre, thin, or unfinished:** Keyframing is pure manual labor — no motion capture, no physics, no procedural helpers (no auto-walk-cycle, no "loop-ify", no foot-locking on a moving figure), no onion-skinning or ghost frames to see motion arcs. The AI motion path is one-shot generate; you can't *refine* a generated clip on the rig and re-export. Selling is a single-clip checkout with no storefront feel — no browsing others' clips for sale *inside* the studio, no preview-on-your-avatar before buy, no packs/bundles, no royalties story. Save/sell are auth-gated but the sign-in detour is clunky. No collaboration, no comments, no "remix this clip." The economy exists in plumbing but not as an experience.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Text-to-motion that you can *refine*, not just accept.** Generate via `/api/forge-motion`, drop the result onto the timeline as editable keyframes, let the creator tweak FK/IK on top, then re-export/sell. AI gets you 80%; the rig gets you the last 20%. That round-trip is the novel part.
- **Procedural authoring helpers.** "Make it loop seamlessly" (match first/last keyframe + ease), foot-locking for locomotion, mirror-pose (left↔right), and a webcam/pose-estimation capture path that drives the rig live — record real motion, clean it on the timeline. Turn an afternoon of keyframing into minutes.
- **An animation *marketplace* inside the studio, not just a checkout.** A browsable storefront panel (the API already serves `include_public=true&visibility=public`) where you preview any for-sale clip **retargeted onto your own avatar** before buying in USDC, with packs/bundles and a clear creator-earnings view. Make selling feel like a shop, not a form submit.
- **Onion-skinning + motion arcs** in the viewport (ghost frames, traced joint paths) — the single feature that separates a real animation tool from a pose toy.
- **Cross-feature wiring:** Every saved/bought clip should be instantly playable everywhere — surface owned clips in `/app`'s animation dock and on the agent's on-chain card, let `/compose` preview a dressed avatar *in motion* using a chosen clip, and make "Record in Scene →" produce a shareable rendered clip via Scene Studio's Player. A motion authored here becomes the agent's signature move platform-wide.
- **Frictionless auth + autosave drafts** so a half-built clip is never lost to a sign-in redirect (the sessionStorage stash exists — make it seamless and visible).

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
4. **Delete this task file** — `prompts/feature-innovation/03_03_animation-studio.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/03-3d-editing-viewer.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
