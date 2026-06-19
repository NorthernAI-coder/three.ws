# 🚀 Innovation Brief — Real-Time Lip-Sync (TTS + Microphone)

> **Task file:** `prompts/feature-innovation/10_05_lipsync.md`
> **Surface:** `/lipsync` (TTS-driven) and `/lipsync/mic` (microphone-driven)
> **Primary source:** `public/demos/lipsync-tts.html` (inline module; `/api/tts/speak` + `wawa-lipsync`); `public/demos/lipsync-mic.html` → `src/lip-sync-analyser.js` (`LipSyncAnalyser`, in-browser Web Audio)
> **Atlas reference:** `docs/ux-flows/10-chat-brain-labs.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user comes to `/lipsync` to **watch a 3D avatar speak — and believe it**. On the TTS side they type text, pick a voice, hit Speak, and the avatar's mouth tracks the audio. On `/lipsync/mic` they talk into their microphone and the avatar mouths their words in real time. These surfaces exist to prove that three.ws does avatar speech better than anyone — they're the technical heart that powers the Talking Head in `/chat`, the dancers in `/club`, and NPCs in `/play`.

"Gamechanging" here means making real-time lip-sync **uncannily good**: visemes that hit on the right phonemes, co-articulation and jaw/tongue motion that read as speech (not a flapping jaw), expression and head motion that sell it, and latency low enough that the mic mode feels like a mirror. When someone sees it, the reaction should be "wait, that's the browser?"

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (NVIDIA Audio2Face, Apple Memoji, Oculus/Meta OVR LipSync, Ready Player Me visemes, ElevenLabs + avatar pipelines). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new — in-browser lip-sync whose fidelity makes people question whether it's pre-rendered, with the engine extracted so the whole platform's avatars inherit it.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/lipsync` (TTS-driven) and `/lipsync/mic` (microphone-driven).
- **Source — `/lipsync`:** `public/demos/lipsync-tts.html` (vercel rewrite target `demos/lipsync-tts.html` under `public/demos/`); inline `<script type="module">`; Three.js + GLTFLoader (importmap) + the `wawa-lipsync` library for viseme detection. **Source — `/lipsync/mic`:** `public/demos/lipsync-mic.html` → imports `src/lip-sync-analyser.js` (`LipSyncAnalyser`); Three.js + GLTFLoader (importmap).
- **Current flow — `/lipsync` (6 +1):** avatar GLB (`/avatars/default.glb`) loads with viseme morphs wired and default text prefilled → (optional) edit text, pick voice + speed → click Speak → `POST /api/tts/speak {text, voice, speed, format:'mp3'}` → server returns an MP3 blob played through an `<audio>` element connected to `wawa-lipsync` → per frame, lipsync FFT-analyses the audio → viseme code → avatar morph targets with EMA smoothing → mouth animates; viseme bar chart updates; Speak re-enables when playback ends.
- **Current flow — `/lipsync/mic` (6 +0):** avatar loads, controls idle → click Start mic → browser prompts for mic permission; user grants → AudioContext + MediaStreamSource + AnalyserNode wired, `LipSyncAnalyser.connect()` called → per frame `analyser.sample()` reads frequency bands → maps to 9 viseme weights (aa/O/E/I/nn/SS/FF/CH/PP) with EMA smoothing + silence fade → drives morphs → speak into mic → avatar mouth follows live; meter bars + viseme readout update; Stop resets morphs to 0.
- **What works today:** TTS round-trip with voice + speed; MP3 playback wired to `wawa-lipsync` FFT viseme detection; EMA-smoothed morph driving; live viseme bar chart; mic mode fully in-browser (audio never leaves the device) with 9 viseme weights, silence fade, meter bars; actionable error handling on both (TTS 400/429/5xx, autoplay-blocked; mic denied/not-found/busy/insecure-context, each with "Try again").
- **Real APIs / dependencies already wired:** `POST /api/tts/speak` (OpenAI TTS), `GET /avatars/default.glb`, `wawa-lipsync` (client-side via Web Audio AnalyserNode), Three.js. Mic mode makes **no server calls**.
- **Where it's mediocre, thin, or unfinished:** FFT-band viseme detection is **energy-based, not phoneme-aware** — it approximates mouth openness rather than recognizing actual phonemes, so consonants and co-articulation read poorly. Only the jaw/mouth moves: **no head motion, blinking, brow, or expression**, which is what actually sells speech. Fixed default avatar only — no upload/URL avatar, no morph-target remapping for arbitrary GLBs (a model without the expected morphs silently does nothing meaningful). TTS lip-sync runs only after the full clip downloads (no streaming). The two routes share concepts but not a unified, exported engine — `/chat`'s Talking Head, `/club`, and `/play` each reinvent this. No recording/export of a lip-synced clip.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Phoneme-aware visemes, not energy bands:** drive the mouth from actual phonemes — for TTS, derive timing from the text/voice (forced alignment or a viseme timeline), and for mic, use a lightweight in-browser phoneme/feature model — so plosives, fricatives, and vowels each get the right shape with proper co-articulation. This is the leap from "jaw flap" to "reads as speech."
- **Full facial performance:** layer blinking, micro-saccades, brow motion, head bob, and breathing on top of the mouth, with expression tied to punctuation/intent — the difference between a talking prop and a talking *being*.
- **Any-avatar support with morph auto-mapping:** accept an uploaded or URL GLB, detect its morph-target naming convention (ARKit / Oculus / Reallusion / custom), and remap the viseme set automatically with a graceful fallback so *any* model lips-syncs, not just the default.
- **Streaming + record/export:** start lip-sync on the first audio chunk instead of waiting for the full MP3; let the user record the avatar speaking and export a shareable clip — instantly viral, instantly demonstrative.
- **Cross-feature wiring (required):** extract a single, reusable lip-sync engine (TTS-fed + mic-fed) and adopt it in **`/chat`'s Talking Head** (replace its post-completion speak with streaming visemes), and offer the same module to **`/club`** dancers and **`/play`** NPCs. Wire avatar selection so a model previewed in **`/playground`** or chosen on **`/agents/:id`** can be tested here via `?avatar=<glb>`. One engine, every avatar on the platform speaks beautifully.

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
4. **Delete this task file** — `prompts/feature-innovation/10_05_lipsync.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/10-chat-brain-labs.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
