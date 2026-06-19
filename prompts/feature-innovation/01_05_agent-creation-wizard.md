# 🚀 Innovation Brief — Agent Creation Wizard & Editor (`/create-agent`, `/agent/new`)

> **Task file:** `prompts/feature-innovation/01_05_agent-creation-wizard.md`
> **Surface:** `/create-agent` (guided wizard) and `/agent/new` (full editor; create-from-avatar handoff `/agent/new?avatar_id=&avatar_glb=&avatar_name=`)
> **Primary source:** `pages/create-agent.html` + `src/create-agent.js`; `pages/agent-edit.html` + `src/agent-edit.js` (imports `src/api.js`, `src/account.js`, `src/avatar-creator.js`, `src/avatar-gallery-picker.js`, `src/shared/agent-wallet-chip.js`, `src/shared/glb-magic.js`)
> **Atlas reference:** `docs/ux-flows/01-onboarding-creation.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

A body without a brain is a statue. This is the surface where a 3D avatar becomes an *agent* — it gets an identity, a personality, a set of real skills, a voice, and its own on-chain wallet. The mission is to make giving an agent a mind feel like directing a character rather than filling a config form: the user shapes who this agent *is* and what it can *do*, and the wizard makes every choice consequential and immediately testable.

"Gamechanging" here means: the personality the user writes is something they can *talk to* before they commit, the skills they enable visibly change what the agent can do, and the moment of creation produces a funded, walleted, optionally-listed agent that feels alive — not a database row. The two surfaces (the guided `/create-agent` wizard and the open-ended `/agent/new` editor) should feel like one coherent system: easy to start, deep to master.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best agent/character builders (OpenAI's GPT builder, Character.AI creation, Poe bots, Inworld, Vercel AI playground). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/create-agent` (vercel route → `create-agent.html`) — auth-gated 6-step wizard. `/agent/new` (vercel route → `agent-edit.html`, shared with `/agent/<uuid>(/edit)`) — auth-gated; creates a draft agent immediately via `POST /api/agents`, then opens the full editor. Create-from-avatar handoff `/agent/new?avatar_id=&avatar_glb=&avatar_name=`.
- **Source:** `pages/create-agent.html` + `src/create-agent.js`; `pages/agent-edit.html` + `src/agent-edit.js`.
- **Current flow (`/create-agent`):** 6 required + ~2 optional. Auth gate (`getMe()`; signed-out → `#auth-gate` → `/login?next=/create-agent`) → **Step 0 Basics** (name ≤60, description ≤280, tags ≤8) → **Step 1 Model** (Starter 4 GLBs / Library `GET /api/avatars` paginated / Upload `.glb` ≤16MB GLB-magic / Add-later w/ `#f-skip-ack`) → **Step 2 Skills** (5 locked core: greet/present-model/validate-model/remember/think; optional: wave/dance/pump-fun/explain-gltf/web-search) → **Step 3 Personality** (14 categories, greeting ≤200, system prompt ≤2000, voice browser/custom) → **Step 4 Review** (editable summary grid) → **Create**: `submit()` resolves body to an owned avatar (`saveRemoteGlbToAccount` for starter URL/upload, connect for library, default starter for none) → `POST /api/agents` → optional `POST /api/marketplace/agents/:id/publish` → success panel (Open/Edit/Fund wallet).
- **Current flow (`/agent/new`):** draft auto-created (`createDraftAgent()` POSTs `/api/agents {name:'Untitled Agent'}`), optional avatar attach via `?avatar_id` (PUT `/api/agents/:id`), then the full editor renders (identity, 3D body, skills, animations, voice, wallet chip, embed/manifest); edits persist via PUT `/api/agents/:id`, `/api/agents/:id/animations`, etc.
- **What works today:** Real agent creation with per-agent wallet; four body-source tabs with GLB-magic validation + upload progress; locked-core + optional skills; marketplace publish (non-fatal on failure); 409 name-conflict bounce-back; per-step jump-back; create-from-avatar handoff; full editor with animations/voice/manifest/embed.
- **Real APIs / dependencies already wired:** `getMe()`; `GET /api/avatars`; `saveRemoteGlbToAccount` (presign + R2 upload + commit); `POST /api/agents`; `PUT /api/agents/:id`; `PUT /api/agents/:id/animations`; `GET /api/agents/:id/manifest`; `POST /api/marketplace/agents/:id/publish`.
- **Where it's mediocre, thin, or unfinished:** The personality step is a blind text box — the user writes a 2000-char system prompt and never talks to the agent before committing. Skills are checkboxes with no demonstration of what they *do* or what they unlock (pump-fun, web-search, x402 are huge capabilities reduced to a toggle). The two surfaces overlap confusingly (wizard vs editor) without a clear "graduate from one to the other." Categories/voices are flat lists. No templates/personas to start from. No validation that a system prompt is actually good. The wallet is provisioned but invisible until the success panel.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Talk to it before you ship it.** Put a live test-chat (and, where a body is attached, a speaking 3D preview) right inside the Personality step, wired to the real agent runtime/draft — the user iterates the system prompt and *hears the difference* immediately. Creation becomes "tune until it feels right," not "write and hope."
- **Skills that demo themselves.** Each skill card shows a real, runnable example of the capability (web-search returns a real result, pump-fun shows a live token snapshot, x402 shows a sample paywalled call) so the user understands the power they're enabling — and the card surfaces what *other* features that skill unlocks platform-wide.
- **Persona starters that are more than a bio string.** Offer real, composable personas (researcher, trader, community host, support) that set system prompt + recommended skills + voice + category *together*, then let the user remix — distinct from the static `PRESETS` bios in the onboarding wizard.
- **Prompt co-author.** A "help me write this" assistant (worker LLM proxy) that turns a one-line description of the agent's job into a strong, structured system prompt, and critiques/improves a prompt the user pasted — with a quality meter.
- **One coherent create→edit story.** Make `/create-agent` the fast guided on-ramp and `/agent/new` the deep workshop, with an explicit, lossless handoff ("open in full editor") and shared components so they never drift. Kill the confusion about which to use.
- **Cross-feature wiring:** accept the avatar handoff from `/create/selfie`, `/create/prompt`, `/create`, and `/voice` (`?avatar_id=`, voice id); deep-link the success panel into `/agent/<id>/wallet#deposit`, the marketplace listing, and the embeddable widget so a freshly-made agent is one tap from funded, listed, and embeddable; and surface the agent's `$THREE`-aware earn/payout setup consistent with the onboarding wizard's Earn step.

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
4. **Delete this task file** — `prompts/feature-innovation/01_05_agent-creation-wizard.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/01-onboarding-creation.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
