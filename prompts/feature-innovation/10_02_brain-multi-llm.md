# 🚀 Innovation Brief — Brain: Multi-LLM Persona Builder

> **Task file:** `prompts/feature-innovation/10_02_brain-multi-llm.md`
> **Surface:** `/brain`
> **Primary source:** `pages/brain.html` → `src/brain.js`
> **Atlas reference:** `docs/ux-flows/10-chat-brain-labs.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user comes to `/brain` to **craft a persona and find the model that makes it sing** — then ship that persona as a real, deployable agent. They are an agent author: they want to shape voice, tone, knowledge, and boundaries, and they want to *prove* their choice by watching several LLMs answer the same prompt side-by-side under that persona. Today `/brain` already does the two hard parts (persona extraction + multi-model compare). It exists so that authoring an agent's mind is fast, evidence-based, and delightful — instead of guessing at a system prompt in a text file.

"Gamechanging" here means turning persona-crafting into a **superpower**: the user doesn't just write a prompt, they *interrogate* it across models, watch where personas drift, A/B variants, and one-click promote the winner into a live agent that's instantly conversable, embeddable, and on the marketplace. The best multi-LLM persona lab on the web, where the comparison is the product.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (OpenRouter Chatroom, LMSYS Chatbot Arena, Vercel AI Playground, PromptLayer, Poe). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new — a persona lab where comparing models is fast, beautiful, and *decisive*, and where the output is a shipped agent, not a copied string.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/brain` → `pages/brain.html` (H1 "Build Your Persona"), two tabs: **Persona** + **Playground**.
- **Source:** `pages/brain.html` → `src/brain.js`.
- **Current flow:** 6 required (+2 optional) steps — open with Persona tab active and archetype presets rendered → (optional) apply an archetype or type freeform persona text → `/api/persona/extract` structures it (tone, vocabulary, interests, dont_say, greeting) → switch to Playground; provider availability fetched via `GET /api/brain/chat`, model chips/focus selector populated → choose **Compare** (fan out to several models) or **Focus** (one model), select active models → type a prompt and run; `streamProvider()` POSTs to `/api/brain/chat` per model, streaming responses side-by-side, each prefixed with the effective persona system prompt → (optional) save persona as an agent via `POST /api/agents` (or `PATCH /api/agents/:id`).
- **What works today:** archetype presets + freeform persona extraction into a structured object; Compare vs Focus modes; per-model streaming into a side-by-side grid; persona system-prompt injection toggle (`personaEnabled`); availability gating of unavailable models; save-as-agent (auth-gated); sessions/persona persisted to localStorage.
- **Real APIs / dependencies already wired:** `GET /api/brain/chat` (provider availability), `POST /api/brain/chat` (per-model streaming completions), `/api/persona/extract` (structure persona), `/api/agents` + `/api/agents/:id` (load/save agent). Models span Anthropic / OpenAI / OpenRouter / Groq / ModelScope tiers.
- **Where it's mediocre, thin, or unfinished:** Compare is a passive read — there's **no judging, scoring, or "pick the winner"** flow; the user eyeballs columns and copies one. Persona is a static form; you can't **A/B two persona variants** against the same model, or watch the *same* persona drift across models. No regenerate/branch per column, no token/latency/cost readout to inform the choice, no diff highlighting between answers. Save-as-agent is a dead-end button — it doesn't deep-link the new agent into `/chat`, `/agents/:id`, or the marketplace. The persona object's rich fields (dont_say, interests, greeting) aren't visually previewed as a living card. No share/permalink for a comparison.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **A built-in LLM judge + scoreboard:** after a Compare run, let the user (or an automatic judge model via `/api/brain/chat`) rank the columns on persona-adherence, helpfulness, and tone, with a visible scorecard and a one-tap "Promote this model + persona to an agent." Make comparison *decisive*, not decorative.
- **Persona A/B and drift view:** run two persona variants against the same model, or one persona across all models, with inline diff highlighting so the user *sees* exactly where each model deviates from `dont_say` / tone / greeting. Surface per-column latency, token count, and relative cost so the choice is informed.
- **Living persona card:** render the structured persona (tone, vocabulary, interests, dont_say, greeting) as a real preview card with a sample greeting spoken in-line — the same card that becomes the agent's profile, so what you craft is literally what you ship.
- **Per-column regenerate / branch / continue:** treat each model column as a real conversation thread you can extend, regenerate, or fork — turn a one-shot bake-off into an interactive lab session, with a shareable permalink.
- **Cross-feature wiring (required):** "Save as agent" must complete the loop — the new agent should be **immediately talkable in `/chat`** (deep-link `?agent=<id>` with its persona + voice prefilled), **viewable at `/agents/:id`**, and **listed on the marketplace** via `/api/marketplace/agents`. A persona crafted here is the single source of truth for that agent's mind everywhere on the platform; the same `/api/persona/extract` output should hydrate the Talking Head's mood/voice metadata.

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
4. **Delete this task file** — `prompts/feature-innovation/10_02_brain-multi-llm.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/10-chat-brain-labs.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
