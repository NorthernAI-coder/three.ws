# 🚀 Innovation Brief — Prompt → Avatar (`/create/prompt`)

> **Task file:** `prompts/feature-innovation/01_04_prompt-to-avatar.md`
> **Surface:** `/create/prompt` (create-prompt)
> **Primary source:** `pages/create-prompt.html` + `src/create-prompt.js` (imports `src/shared/log.js`)
> **Atlas reference:** `docs/ux-flows/01-onboarding-creation.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

This is pure imagination-to-3D: a user types "a wise old fox in a velvet wizard cloak" and a rigged, animatable character avatar appears. It's the most creatively liberating path on three.ws — no camera, no file, no skill required, just words. The mission is to make text-to-character feel like collaborating with a concept artist who reads your mind: the result matches the intent, and when it doesn't, refining is a conversation, not a re-roll lottery.

"Gamechanging" here means: the user gets a character they actually wanted, can steer it ("more menacing," "give it a staff," "darker fur"), and can riff on a theme quickly enough that creating a whole cast feels playful. It should be the surface that turns "I have an idea" into "I have an agent" with the least friction of any creation method.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best generative-creation tools (Midjourney's prompt+variations loop, Luma/Meshy text-to-3D, Scenario, Sora's composer, Krea's real-time). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/create/prompt` (vercel route → `create-prompt.html`). Reached from the "Prompt" card on `/create` (signed-out users redirect to `/login?next=/create/prompt`); also direct.
- **Source:** `pages/create-prompt.html`, `src/create-prompt.js`. Three steps: compose → building → done. `mapSubmitError` / `friendlyJobError` map provider codes to human messages.
- **Current flow:** 3 required + 1 optional. Compose a prompt (3–600 chars, live counter; optional example chips) → "Generate" (or Cmd/Ctrl+Enter) → building step (elapsed clock, 8% start) → `POST /api/avatars/reconstruct` `{ name (derived), prompt, visibility:'private' }` (server renders a Flux reference image then reconstruct→auto-rig) → `{ jobId }` → `pollUntilDone` polls `GET /api/avatars/regenerate-status` every 3s (8-min timeout, phase-based progress: queued→running→rigging) → `renderDone` fetches `GET /api/avatars/:id`, sets `model-viewer` src, tags Animation-ready/static + Private; "Open in editor" (`/avatars/<id>/edit`) and "Make another"; dispatches `tws:feature-done`.
- **What works today:** Real text→image (Flux)→reconstruct→rig pipeline; example chips; live char counter; Cmd/Ctrl+Enter; phase-aware progress; thorough error mapping (rate-limited, unconfigured→suggest selfie, no-face, NSFW, timeout, OOM); 401 mid-flow → login redirect; "Make another" reset; cross-feature `tws:feature-done` dispatch.
- **Real APIs / dependencies already wired:** `POST /api/avatars/reconstruct`; `GET /api/avatars/regenerate-status`; `GET /api/avatars/:id`. Backend Flux + reconstruct/rig.
- **Where it's mediocre, thin, or unfinished:** It's a one-shot text box → single result, no variations, no steering. The user can't see the reference image the server generated, can't pick among candidates, can't say "this but X." Example chips are static strings, not inspiring or categorized. No style/medium controls (realistic vs toon vs claymation vs pixel). The 8-minute wait is, again, a bar. "Make another" throws everything away instead of branching from a good result. No gallery of what others prompted, no remixable prompts. Done is a dead-end editor link rather than a launch into agent creation.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **See the concept before you commit the 3D.** Surface the Flux reference image *first* as a fast, cheap preview and let the user approve or re-roll the 2D concept (multiple candidates) before spending the long reconstruct→rig minutes. Approving locks the look; this kills the "8 minutes for a result I don't want" failure mode.
- **Prompt as a steerable conversation.** After a result, offer targeted edits ("more menacing," "add a staff," "change palette to teal") that re-render from the existing concept rather than from scratch — and a structured prompt builder (subject / style / mood / palette) so non-writers get great inputs. Keep the freeform box for power users.
- **Variations and a cast.** Generate a small grid of variations from one prompt; let the user fork any one to refine. Make it trivial to spin a *family* of related characters (same style, different subjects) for someone building a whole world of agents.
- **Style presets that actually change the pipeline.** Real, named visual styles (realistic, stylized, toon, claymation, voxel, mascot) wired into the reconstruct params — chosen via previewed sample cards, not guessed from prose.
- **The build wait is productive.** While reconstruct/rig runs, let the user write the agent's name, greeting, and personality so the done step lands them in a half-built agent, not a dead end.
- **Cross-feature wiring:** on done, deep-link "give it a brain" → `/agent/new?avatar_id=...&avatar_name=...`; honor inbound `?style=` / `?wizard=1&next=` from `/start` and `/create`; and publish-worthy prompts/results should feed a remixable public gallery shared with `/create`'s discovery rail, so great prompts become a discoverable, forkable asset.

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
4. **Delete this task file** — `prompts/feature-innovation/01_04_prompt-to-avatar.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/01-onboarding-creation.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
