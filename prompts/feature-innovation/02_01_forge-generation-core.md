# 🚀 Innovation Brief — Forge Generation Core (prompt / photo / sketch → 3D)

> **Task file:** `prompts/feature-innovation/02_01_forge-generation-core.md`
> **Surface:** `/forge` (input → engine selection → generation → reveal)
> **Primary source:** `src/forge.js`, `src/forge-dropzone.js`, `src/forge-prompt-studio.js`, `src/forge-reveal.js`, `src/forge-enhance.js` (+ `pages/forge.html` markup/styles)
> **Atlas reference:** `docs/ux-flows/02-forge-text-to-3d.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a creator, indie game dev, agent-builder, or curious visitor who wants a usable 3D model from an idea — typed, photographed, or sketched — without learning a tool. The generation core is the heart of `/forge`: it is where intent becomes a textured GLB. It exists so that "type a description, get a model" is true, fast, and trustworthy — including for people with no account, no wallet, and no key (the free FLUX→TRELLIS lane).

"Gamechanging" here means the *act of generating* feels alive and intelligent, not a black box with a spinner. The competitor pattern (Meshy/Tripo/Luma) is: type prompt → wait on an opaque queue → get one mesh, hope it's right. Beat that by making the input phase **coach the user toward a prompt that meshes cleanly**, making the generation phase **show honest, legible progress with a live reference preview**, and making the reveal phase **feel like the model materializing in your hands**. Invent capabilities those tools don't have: prompt-to-result confidence, side-by-side variant forging, and a reference image the user can actually steer before the mesh is committed.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Meshy, Tripo, Luma Genie, Rodin, Midjourney's generation UX for the input/reveal feel). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/forge` → `pages/forge.html`, loads `src/forge.js` + sibling `forge-*` modules. (`vercel.json` rewrite.)
- **Source:**
  - `src/forge.js` (~2445 lines) — main controller: fetches catalog + health, builds tier (Draft/Standard/High) + per-mode engine selector, validates + submits the job, runs one shared polling loop, renders generating/result/error states, gating.
  - `src/forge-dropzone.js` (~226 lines) — paste/drop/click image handling for the photo + sketch slots.
  - `src/forge-prompt-studio.js` (~60+ lines) — curated "Surprise me" / "More ideas" library + live prompt coach (tip/warn/strong) + char counter. Client-side, hand-authored content, no network.
  - `src/forge-enhance.js` (~259 lines) — injects the **Enhance** button into `#prompt-tools`; rewrites the user's text via `POST /api/forge-enhance` (free-first LLM chain, no key) into a sharper single-subject FLUX→TRELLIS prompt, with Undo.
  - `src/forge-reveal.js` (~353 lines) — WebGL "materialize" dissolve overlay above the result `<model-viewer>`; honors `prefers-reduced-motion`; fails open (presentation only, never a dependency).
- **Current flow:** ~12 required steps (text path). Land → fetch catalog (`GET /api/forge?catalog=1`) + health (`GET /api/forge?health=1`) → pick mode tab (Describe it / From photos / From a sketch) → author prompt (coach + counter + example chips; optional Surprise me / Enhance) → optional tier/engine/aspect → **Generate** (⌘/Ctrl+Enter) → `startJob()` `POST /api/forge` → `#state-generating` with three labeled steps (*Painting reference* → *Reconstructing mesh* → *Finalizing GLB*) + honest elapsed-vs-typical bar + reference preview paint-in + Cancel → sync return or poll `GET /api/forge?job=<id>` (every 2500ms, ceiling 5min) → `showResult()` + materialize reveal.
- **What works today:** Free no-auth lane (FLUX→TRELLIS); three input modes; live prompt coach + curated library + AI enhance; multi-view photo upload via presign (`POST /api/forge-upload` → `PUT` storage); honest non-faking progress; cinematic reveal; vision pre-check (`422 image_not_usable`) with "Generate anyway" override; auto-categorize/save.
- **Real APIs / dependencies already wired:** `GET /api/forge?catalog=1|health=1`, `POST /api/forge`, `GET /api/forge?job=<id>`, `POST /api/forge-upload` (+ `PUT` object storage), `POST /api/forge-enhance`, `POST /api/forge-categorize`. Engines: FLUX→TRELLIS free lane; BYOK Meshy/Tripo/Rodin/Stability/Replicate (`x-forge-provider-key`); Hunyuan3D/TripoSG sketch. model-viewer 4.0.0 (CDN). Anonymous client id in `localStorage forge:cid`.
- **Where it's mediocre, thin, or unfinished:** You get **one** mesh per generation — no variants, no "regenerate just the reference image" before committing GPU time on reconstruction. The reference image is shown but **not steerable** (no nudge/reroll/lock once you like it). The prompt coach grades but doesn't *show* what a stronger prompt yields. There is no confidence/quality signal on the result. Photo mode doesn't tell the user which of their 4 angles actually helped. No memory of what *this* user's prompts tend to produce. The empty/idle state shows a sample but doesn't onboard a true first-timer toward their first success.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Steer-the-reference, then commit.** Split generation into two honest phases the user controls: FLUX paints 1–4 candidate reference images *first* (cheap, fast); the user picks/locks the one they want (or hits "reroll" / nudges with a delta phrase) — only then does TRELLIS spend GPU reconstructing the *chosen* image. This kills the "wrong mesh, start over" loop that plagues Meshy/Tripo and is genuinely novel. Wire it through the existing `preview_image_url` plumbing and the catalog's two-stage pipeline.
- **Forge variants, side by side.** A "Generate 3 variants" affordance that fires the same prompt with seed/style variation and reveals them in a compact compare strip in the viewer area — keep the winner, discard the rest (feeds `forge-feedback`). No competitor lets you A/B meshes in one shot.
- **Living prompt coach.** Upgrade `forge-prompt-studio.js` from grading-only to *show-don't-tell*: as the coach detects a weak prompt (multi-subject, no material/lighting cue) it offers a one-tap fix that previews the rewritten prompt inline (reuse the `/api/forge-enhance` rail) and explains *why* it meshes cleaner.
- **Per-angle photo intelligence.** In photo mode, after the vision pre-check, surface which uploaded views the backend actually used and a "this angle adds the most" hint, turning blind uploading into guided capture (ties to the image-to-3d tutorial's "4 angles" advice).
- **First-success onboarding in the empty state.** Replace the passive idle sample with a live "watch one forge in 20s" demo that seeds the composer with a known-good prompt — a first-timer reaches a real GLB without thinking.
- **Cross-feature wiring (required ≥1):** the moment a model lands, offer a context-aware next-step rail driven by the auto-category — *Avatar* → "Rig & animate at `/create/prompt` / open in avatar editor"; *Item/Accessory* → "Attach to an avatar at `/compose`"; *Scene* → "Build a scene at `/compose`"; multi-part result → "Split parts at `/segment`". Make the generation core the launchpad for the rest of three.ws, not a dead end.

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
4. **Delete this task file** — `prompts/feature-innovation/02_01_forge-generation-core.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/02-forge-text-to-3d.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
