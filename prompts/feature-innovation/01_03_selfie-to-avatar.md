# 🚀 Innovation Brief — Selfie → Avatar (`/create/selfie`)

> **Task file:** `prompts/feature-innovation/01_03_selfie-to-avatar.md`
> **Surface:** `/create/selfie` (create-selfie); `/scan` and `/features/scan` redirect/link here
> **Primary source:** `pages/create-selfie.html` (inline `<script type="module">`) + `src/selfie-capture.js` + `src/selfie-pipeline.js` (imports `src/avatar-face-capture.js`, `src/shared/log.js`)
> **Atlas reference:** `docs/ux-flows/01-onboarding-creation.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

This is the most viscerally magical thing three.ws can do: a user points their camera at their face and, a minute later, a rigged 3D version of *themselves* is greeting them and ready to become a living agent. The marketing promise is literally "Your face in 3D. In 60 seconds." The mission is to make that promise true — accurate enough that people recognize themselves and gasp, fun enough that they want to try three more photos, and fast enough that the wait feels like anticipation, not abandonment.

"Gamechanging" here means: the resemblance is good enough to be uncanny, the capture coaches the user to a great photo so the result *can't* be bad, and the wait is an experience rather than a progress bar. The moment the avatar appears should be the screenshot people post.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best face-capture and avatar pipelines (Apple Memoji/Persona, Epic MetaHuman, Ready Player Me selfie, In3D, Bellus3D). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/create/selfie` (vercel route → `create-selfie.html`). `/scan` does an unconditional `location.replace('/create/selfie' + search)`; `/features/scan` is a static landing page whose CTA bounces here.
- **Source:** `pages/create-selfie.html` (inline module boot), `src/selfie-capture.js` (camera + face-oval overlay), `src/selfie-pipeline.js` (downscale, MediaPipe face check, submit, poll, events), `src/avatar-face-capture.js`.
- **Current flow:** 4 required + ~4 optional. Boot reads `GET /api/config` to pick **platform** vs **BYOK** mode → (BYOK only) API-key step (Meshy/Tripo, stored in `sessionStorage`) → capture frontal photo (camera or upload, optional left/right angles) → "Build my avatar" downscales to ≤1024px JPEG + local MediaPipe face check → `POST /api/avatars/reconstruct` `{ name, photos[], visibility, params:{bodyType,style} }` → `{ jobId }` (stashed as `selfie:pendingJobId`) → poll `GET /api/avatars/regenerate-status` (1.5s then 3s w/ backoff, 8–10 min timeout) → done viewer with Save/List/Open-in-editor/Make-another.
- **What works today:** Real reconstruction (Meshy/Tripo), camera overlay with face guidance, local MediaPipe pre-check, photo downscaling, multi-angle fidelity boost, job resume across login (`selfie:pendingJobId`), OS notification on done when tab hidden, per-slot error highlighting, rate-limit cooldown countdown, BYOK key entry.
- **Real APIs / dependencies already wired:** `GET /api/config`; `POST /api/avatars/reconstruct`; `GET /api/avatars/regenerate-status`; `GET /api/avatars/:id`; `PATCH /api/avatars/:id` (save/list). MediaPipe (client face detect); `getUserMedia`; optional Meshy/Tripo BYOK.
- **Where it's mediocre, thin, or unfinished:** Capture coaching is a static oval — no real-time feedback on lighting, framing, blur, expression, or angle, so users submit bad inputs and blame the result. The 8-minute wait is a progress bar with phase labels and nothing to *do*. There's no before/after, no "rate the likeness," no retry-with-tweaks loop. No expression/identity options beyond bodyType/style params. The done step ends the journey instead of catapulting the user into making the agent. No texture/skin-tone fidelity controls. The legacy `/scan` page is dead code (per atlas) — worth cleaning up.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Coached capture that guarantees a good input.** Real-time, on-device feedback during capture using the MediaPipe landmarks you already load: lighting/exposure score, centering, distance, blur, head-pose ("turn slightly left"), neutral-expression nudge — only enable "Build" when the frame scores well. Auto-capture the best frame from a short burst. Bad inputs are the #1 cause of bad outputs; eliminate them.
- **The wait becomes the show.** Replace the dead-time progress bar with a live build theater: stream the reference/preview as it materializes, show the actual pipeline phase with the user's own photo morphing toward the mesh, and let them pre-pick voice/name/style *while it builds* so zero time is wasted. When it lands, it's already half-configured.
- **Likeness loop.** On done, show a side-by-side of their photo and the avatar with a one-tap "make it look more like me" that re-runs with adjusted params (or adds a side angle) — and a quick style toggle (realistic / stylized / heroic) that re-textures without a full rebuild where the provider supports it.
- **Identity-safe by default.** Surface the privacy posture clearly (private by default, photos used only for reconstruction), and add an explicit consent + delete-source-photos affordance. This is a face; trust is a feature.
- **Cross-feature wiring:** the moment an avatar is done, offer "bring it to life" → `/agent/new?avatar_id=...&avatar_name=...` so the selfie flows straight into the agent brain; respect inbound `?wizard=1&next=` and `?style=` from `/start`/`/create` so the capture starts pre-aimed; and feed the finished avatar into the marketplace publish path and the user's library discovery rail.

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
4. **Delete this task file** — `prompts/feature-innovation/01_03_selfie-to-avatar.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/01-onboarding-creation.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
