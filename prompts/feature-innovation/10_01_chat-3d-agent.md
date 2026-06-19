# 🚀 Innovation Brief — Conversational 3D Agent Chat

> **Task file:** `prompts/feature-innovation/10_01_chat-3d-agent.md`
> **Surface:** `/chat`
> **Primary source:** `chat/` (standalone Svelte app) — `chat/index.html` → `chat/src/main.js` → `chat/src/App.svelte`; `chat/src/TalkingHead.svelte`, `chat/src/convo.js`, `chat/src/providers.js`, `chat/src/stores.js`, `chat/src/AgentPicker.svelte`, `chat/src/ModelSelector.svelte`, `chat/src/walletAuth.js`, `chat/src/tools.js`, `chat/src/sync.js`, `chat/src/SkillsMarketplaceModal.svelte`, `chat/src/TxApprovalModal.svelte`
> **Atlas reference:** `docs/ux-flows/10-chat-brain-labs.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user opens `/chat` to **talk to a living 3D agent** — not a text box, a presence. They want a conversation that feels like the agent is *there*: it looks at them, breathes, thinks visibly, answers in a real voice with a mouth that actually moves, remembers what they said yesterday, and can act on the world (launch, pay, fetch) when asked. Today this exists as a competent text-chat with optional Talking Head + TTS toggles defaulting off. That is the floor, not the ceiling.

"Gamechanging" here means: the single best conversational-3D-agent experience on the open web. When someone hears "talk to an AI avatar," `/chat` should be the link they send. The bar is presence, voice quality, lip-sync fidelity, memory, and agency — fused so well that turning the avatar *off* feels like a downgrade, and that a first-time visitor with no key, no wallet, and no setup is having a real spoken conversation within ten seconds.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (ChatGPT Advanced Voice Mode, character.ai, Hume EVI, ElevenLabs conversational, Apple's Genmoji presence). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user — a 3D agent that *looks at you, listens, thinks, speaks, and remembers* better than any chat product shipping today.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/chat` → `chat/index.html` (`<div id="app">` mounted by `main.js`), a **separate Svelte + Vite build** from the main vanilla-JS app.
- **Source:** entry `chat/src/main.js` → `chat/src/App.svelte`; LLM plumbing in `chat/src/providers.js` + `chat/src/convo.js`; 3D avatar + lip-sync in `chat/src/TalkingHead.svelte`; selection UI in `chat/src/AgentPicker.svelte` + `chat/src/ModelSelector.svelte`; state in `chat/src/stores.js`; auth in `chat/src/walletAuth.js`; agentic tools in `chat/src/tools.js` + `chat/src/TxApprovalModal.svelte` + `chat/src/SkillsMarketplaceModal.svelte`; cross-device persistence in `chat/src/sync.js`.
- **Current flow:** 6 required (+4 optional) steps — boot fetches free models from `/api/chat/models` and shows an empty state with suggestion chips → (optional) pick a model / load an agent persona → (optional) toggle Talking Head + TTS → type/attach a message → `convo.complete()` streams from `/api/chat/proxy` (built-in) or the keyed provider into a live markdown+KaTeX bubble → on completion, if Talking Head is on the avatar runs `talkingHead.speak({text, mood})` (TTS → viseme lip-sync); else if TTS on, browser `speechSynthesis` reads it.
- **What works today:** free built-in models stream with zero key via the server proxy; markdown + KaTeX render live; abortable generation; persona/agent loading; curated tool packs (agent / pump / payments / wallet) with a wallet-gated `TxApprovalModal`; optional SIWE/SIWS sign-in for cross-device, E2E-encryptable sync to IndexedDB; Talking Head GLB avatar with TTS-driven viseme lip-sync and mood.
- **Real APIs / dependencies already wired:** `/api/chat/models`, `/api/chat/proxy`, `/api/chat/config`, `/api/chat/mcp`, `/api/tts/google` (TTS for lip-sync), `/api/agents` + `/api/marketplace/agents`, `/api/auth/{me,logout,siwe/nonce,siwe/verify,siws/nonce,siws/verify}`, agent-library `index.en-US.json`; direct provider APIs (Anthropic/OpenAI/Groq/Mistral/OpenRouter/Ollama) when a user key is set; Three.js (importmap, r0.169) for the Talking Head.
- **Where it's mediocre, thin, or unfinished:** Talking Head + TTS default **off**, so the headline 3D experience is hidden behind toggles most users never flip. Output is voice-out only — **no voice input / barge-in**; the conversation is turn-based typing, not a real spoken exchange. The avatar speaks but doesn't *listen* (no idle gaze, no attentive posture while the user talks). Lip-sync runs after the full reply completes rather than streaming with the tokens (perceived latency). Memory is per-conversation persistence, not durable *facts the agent recalls* across sessions. Mood is a single label, not a continuous emotional read. No camera/presence awareness, no interruption handling, no "the agent is thinking" embodied state.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Always-on presence, opt-out not opt-in:** boot straight into a breathing, blinking, gaze-tracking 3D avatar with voice ready. Idle micro-animations, eye contact toward the cursor/camera, an embodied "thinking" state during token generation (head tilt, glance away, subtle ponder), and an attentive "listening" pose while the user speaks. The toggle becomes "go text-only," not "turn the avatar on."
- **Real spoken conversation with barge-in:** add push-to-talk and hands-free voice input (Web Speech API / `/api/tts` round-trip or a streaming STT endpoint), and let the user *interrupt* mid-sentence — the avatar stops speaking, drops to listening, and responds to the new utterance. This is the single biggest leap toward Advanced-Voice-Mode parity.
- **Streaming lip-sync that begins with the first sentence**, not the last token: speak sentence-by-sentence as the stream lands so mouth movement tracks the reply in near-real-time; drive visemes off the streamed audio with EMA smoothing (reuse the proven approach from `/lipsync`).
- **Durable agent memory:** extract and persist salient facts ("remembers your name, your project, your last ask") into the synced store, surface a "what I remember" panel the user can edit/forget (privacy + control), and inject recalled facts into the system prompt. Memory is what turns a demo into a relationship.
- **Continuous mood + expression from the model's own affect**, not a single mood string: map sentiment/intent of each sentence to facial blendshapes and gesture so the avatar's expression evolves through the answer.
- **Cross-feature wiring (required):** make any agent in the platform talkable in one click — `/agents/:id` "Talk to this agent" deep-links into `/chat` with that agent's persona + GLB + voice metadata prefilled (`?agent=<id>`); a persona crafted in `/brain` ("save as agent") becomes immediately conversable here; and the same Talking Head presence layer is the obvious foundation for `/club` dancers and `/play` NPCs — extract it cleanly so those surfaces can adopt it.

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
4. **Delete this task file** — `prompts/feature-innovation/10_01_chat-3d-agent.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/10-chat-brain-labs.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`. Note: `/chat` is its own Svelte + Vite build under `chat/`.
