# 🚀 Innovation Brief — Onboarding Wizard (`/start`)

> **Task file:** `prompts/feature-innovation/01_01_onboarding-wizard.md`
> **Surface:** `/start` (and the `?template=<id>`, `?wizard=1&next=` round-trip variants)
> **Primary source:** `pages/start.html` + `src/start.js` (imports `src/shared/usd-price.js`, `src/templates.js`, `src/shared/log.js`)
> **Atlas reference:** `docs/ux-flows/01-onboarding-creation.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

A first-time visitor lands on `/start` with one question: "can I really make a living, talking 3D agent in the next two minutes?" This wizard is the single most important conversion surface on three.ws — it is where a curious stranger becomes an owner of a deployed agent, a public `/agent/<id>` URL, and an embeddable widget. The mission is to make that first run feel like *magic that happened faster than they expected*, and to make the result feel like *theirs* — personalized from the first keystroke, not a template they filled in.

"Gamechanging" here means: the user never feels like they are configuring software. They describe what they want once, and the wizard assembles a believable, branded, monetizable agent in front of their eyes — body, voice, brain, skills, and live URL — with every choice pre-reasoned and reversible. Time-to-first-live-agent should be the number we are proud to put on the landing page.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best first-run experiences in the world (Linear's onboarding, Vercel's deploy flow, Stripe's account setup, Figma's "create a file" moment, Cursor's first-project). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/start` (vercel route → `start.html`). Accepts `?template=<id>` deep-links and `?wizard=1&next=` round-trips back from `/create` and `/create/selfie`. Resumes via `sessionStorage` key `wz:state`.
- **Source:** `pages/start.html`, `src/start.js`. `TOTAL_STEPS = 5`; `PRESETS` (8 personality bios), `BASE_SKILLS`, `SKILL_MAP`, `CRYPTO_SKILLS`, `TEMPLATES` from `src/templates.js`.
- **Current flow:** 6 required + ~5 optional steps — template gallery → (template or blank) → Step 1 Avatar (selfie/editor/upload/skip) → Step 2 Name & Brain (+ presets, model, crypto toggle) → Step 3 Skills → Step 4 Deploy (auto: `POST /api/agents`, `POST /api/widgets`, embed snippet) → Step 5 Earn (price + payout wallet) or Skip → `/dashboard?welcome=1`.
- **What works today:** Real deploy path (agent + widget + embed + live URL), session resume, template prefill, crypto-mode branching, deploy-failure retry button, USD-equivalent price hints via `usd-price.js`.
- **Real APIs / dependencies already wired:** `GET /api/csrf-token`; `POST /api/avatars` (upload); `POST /api/agents`; `POST /api/widgets`; `POST /api/agents/:id/skills/set-price` (USDC mint); `POST /api/billing/payout-wallets`. No on-chain txn from this page.
- **Where it's mediocre, thin, or unfinished:** Auth is hit *lazily* — an anonymous user only discovers they need an account when Step 4 deploy throws a server error toast (brutal). Templates are static prefills, not personalized. The avatar step ejects the user to another route and prays they come back via `?next=`. There is no preview of the actual agent until after deploy. Presets just stuff a canned bio string — no reasoning, no model selection logic, no skill suggestions. No celebration, no share moment, no "what now" guidance beyond a dashboard redirect.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **One-sentence agent genesis.** Replace the gallery-first flow with a single intent box: "Describe the agent you want." Parse it (via the worker LLM proxy) into a *proposed build* — name, bio, suggested model, recommended skills, a starter avatar match, and a crypto-mode guess — rendered as an editable, reasoned card ("I picked web-search and memory because you said 'researches the news'"). Every field stays editable; the wizard becomes "confirm & tweak," not "fill in 5 screens."
- **Live agent preview that exists before deploy.** Show a real 3D `model-viewer` of the chosen body greeting the user *with their actual chosen voice and greeting line* during Steps 2–3 — synthesized from the live agent draft, not a mock. The user watches their agent come alive as they type.
- **Auth without an interruption.** Detect the anonymous user up front and let them build the entire draft locally, then surface a single inline "claim this agent" auth moment (passkey/wallet) *at the deploy boundary* with the agent already visible — never a surprise error toast at Step 4. Resume the exact draft post-auth.
- **A genuine launch moment.** On deploy success, fire a real, shareable celebration: an auto-generated OG card (agent portrait + name + live URL), a one-tap "share to X / copy link," confetti tied to the real `/agent/<id>`, and a "your agent's first words" autoplay. Make people *want* to post it.
- **Cross-feature wiring:** the parsed intent should seed the avatar route too — when the user picks "Selfie" or "Editor," pass the style/personality hints forward (`?wizard=1&next=...&style=...`) so `/create/selfie` and `/create/prompt` start pre-aimed; and if crypto-mode is on, pre-stage the `$THREE`-aware earn defaults and deep-link the success panel into the agent's wallet (`/agent/<id>/wallet#deposit`) and the marketplace publish flow.

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
4. **Delete this task file** — `prompts/feature-innovation/01_01_onboarding-wizard.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/01-onboarding-creation.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
