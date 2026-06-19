# 🚀 Innovation Brief — Voice Lab (`/voice`)

> **Task file:** `prompts/feature-innovation/01_07_voice-lab.md`
> **Surface:** `/voice` — voice cloning + TTS playground for agents/avatars
> **Primary source:** `pages/voice.html` + `src/voice-lab.js`
> **Atlas reference:** `docs/ux-flows/01-onboarding-creation.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

An agent that sounds generic is forgettable; an agent that sounds *distinct* is memorable. Voice Lab is where a user mints the voice their agent speaks with — cloned from their own recording or crafted to fit a character — and hears it come alive instantly. The mission is to make voice creation feel like a recording studio with a great engineer: it coaches you to a clean take, clones a voice you actually recognize, and lets you audition it speaking your agent's real lines before you commit it.

"Gamechanging" here means: the recording step guarantees a usable clone (no garbage-in), the clone is convincing, and the playground lets the user *direct* the voice — emotion, pace, the agent's actual greeting — so they choose with confidence. Voices become a first-class, reusable asset across every agent and avatar, not a one-off in `localStorage`.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best voice tools (ElevenLabs Studio, Descript Overdub, Play.ht, Apple's Personal Voice, Resemble.ai). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/voice` (vercel route → `voice.html`).
- **Source:** `pages/voice.html` + `src/voice-lab.js`. Cloned-voice library persisted in `localStorage` key `voicelab_voices_v1`.
- **Current flow:** 4 required + ~3 optional. Land (reading script shown, cyclable via "Next script"; library + playground voice dropdown render from `localStorage`) → "Record" (`#btnRecord`, `getUserMedia` mono 48kHz w/ AGC/NS/EC, live waveform + level meter, max 60s, rec. 20–30s) → "Stop" (`#btnStop`, builds Blob, rejects <3s, shows review state w/ audio preview; optional "Re-record") → enter voice name (required) + "Clone" (`#btnClone`, `POST /api/tts/eleven-clone` multipart audio + name) → on success store `{voiceId,name,status}` in `localStorage`, show done state, re-render library/playground. Optional playground: pick voice, type text, "Speak" → `POST /api/tts/eleven {voiceId,text}`; "Play sample" on a library card uses a canned line; delete a voice from the library.
- **What works today:** Real ElevenLabs clone + TTS via server proxy; live waveform/level meter; min-duration guard; review/re-record loop; reading scripts; in-page playground; per-card sample playback; library delete; thorough status messaging (mic denied, recorder init, too-short, network/HTTP errors, name required).
- **Real APIs / dependencies already wired:** `POST /api/tts/eleven-clone` (clone); `POST /api/tts/eleven` (TTS playback/sample). ElevenLabs via server proxy. Browser `getUserMedia` / `MediaRecorder` / Web Audio.
- **Where it's mediocre, thin, or unfinished:** The voice library lives in `localStorage` — it's per-browser, not tied to the account, and not actually discoverable when creating an agent (the atlas notes voices are "selectable elsewhere" but the binding is loose). No recording-quality feedback (background noise, clipping, too quiet, too short of *speech* vs silence) — users clone bad takes. The playground is plain TTS with no emotion/style/pace controls. No "preview this voice on my agent's real greeting." No designed/library voices to pick without recording. No way to compare two voices. No re-clone/improve an existing voice.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Studio-grade capture coaching.** Real-time analysis of the incoming audio (noise floor, clipping, loudness, actual speech duration vs silence) with a live "take quality" meter and a green-light gate — only allow Clone when the sample will produce a good voice. Auto-trim leading/trailing silence. Garbage-in is the root cause of weak clones; close that door.
- **Direct the voice, don't just synthesize it.** Add real expressive controls to the playground (stability/style/pace/emotion where the provider supports them) and a multi-line script tester so the user hears the voice across a happy line, a serious line, and a question — then saves the settings *with* the voice.
- **Account-backed, reusable voice assets.** Promote voices from `localStorage` to a real per-account voice library so a cloned voice is instantly selectable in `/create-agent`, `/agent/new`, and avatar flows — one voice, many agents. Make the binding explicit and bidirectional.
- **Audition on the real agent.** "Hear it on my agent" — synthesize the user's actual agent greeting/persona lines in the candidate voice (and, where a body exists, lip-synced on the 3D preview) so the choice is made on the real product, not a canned sentence.
- **Designed voices for non-recorders.** A curated set of ready-to-use voices (browsable, auditionable) for users who don't want to record — so every agent can have a great voice in seconds.
- **Cross-feature wiring:** expose the chosen voice id straight into the agent creation/editor personality step and the onboarding wizard's voice choice; let the agent's live `/agent/<id>` talking widget speak in this voice; and surface Voice Lab as a step inside `/create-agent` Personality and `/start` so voice is part of the creation arc, not an isolated tool.

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
4. **Delete this task file** — `prompts/feature-innovation/01_07_voice-lab.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/01-onboarding-creation.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
