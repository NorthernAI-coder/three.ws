# 🚀 Innovation Brief — Avatar Creation Hub (`/create`)

> **Task file:** `prompts/feature-innovation/01_02_avatar-creation-hub.md`
> **Surface:** `/create` (incl. `?fork=<avatarId>` remix and `?wizard=1&next=` round-trip)
> **Primary source:** `pages/create.html` + `src/create.js` (imports `src/account.js`, `src/avatar-creator.js`, `src/guest-avatar.js`, `src/shared/template-picker.js`, `src/shared/crypto-optional.js`, `src/wallet-auth.js`)
> **Atlas reference:** `docs/ux-flows/01-onboarding-creation.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

`/create` is the fork in the road: the moment a user has to decide *how* to give their agent a body. Today it's a grid of seven cards (editor, customize, studio, selfie, prompt, video, upload) that asks the user to already know which path fits them. That's backwards — most people don't know the difference between "default editor" and "agent studio," and they certainly can't predict which method will give the best result for what they want. The mission is to reinvent this decision so the user expresses *intent* and the hub *routes them to the right method* — or better, lets them stay and produce a body without leaving.

"Gamechanging" here means: nobody bounces off `/create` confused. The page understands what the user has (a selfie? a vibe? a GLB file already?) and what they want (realistic me? a stylized character? a creature?), and either does it inline or hands off to the perfect specialized flow with context pre-loaded. It should feel like a concierge, not a menu.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best "choose your starting point" experiences (Figma's new-file picker, Notion's template gallery, Midjourney's create surface, Apple Memoji setup, Ready Player Me's avatar entry). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/create` (vercel route → `create.html`). Handles `?fork=<avatarId>` (remix) and arrives from `/start` Step 1 "Editor" with `?wizard=1&next=`.
- **Source:** `pages/create.html`, `src/create.js`. Uses `AvatarCreator` (`src/avatar-creator.js`), `guest-avatar.js` (IndexedDB staging), `account.js`.
- **Current flow:** 2 required + ~4 optional. `boot()` probes `GET /api/config` (`videoAvatar` flag), and for signed-in users with avatars loads `GET /api/avatars` for a remix strip. User picks one of 7 method cards; anonymous users stage to IndexedDB → `/create-review`; signed-in users save/fork directly.
- **What works today:** Seven real creation methods; `?fork=` deep-link (`POST /api/avatars/fork`, with a guest-fork fallback that downloads the source GLB and stages a copy); GLB upload with magic-byte validation; feature-flag gating of the video card; avatar-quota check (`GET /api/usage/summary`); remix strip for returning users.
- **Real APIs / dependencies already wired:** `GET /api/config`; `GET /api/avatars`; `GET /api/usage/summary`; `POST /api/avatars/fork`; `GET /api/avatars/:id` + raw GLB fetch (guest fork). Avaturn / Ready Player Me iframes via `AvatarCreator`.
- **Where it's mediocre, thin, or unfinished:** It's a static decision grid — no guidance on which method to pick, no previews of what each produces. Selfie and Prompt are auth-gated with a hard redirect to `/login` (the user loses momentum and context). The remix strip is a thin thumbnail row with no provenance or "what's popular." No sense of what other people made. The video card just greys out when flagged off instead of teasing/waitlisting. There's no inline result — everything either stages-and-bounces or ejects to a sub-route.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Intent-first router, not a method grid.** Lead with two questions answered by tapping: "What's your starting material?" (a photo / just an idea / a file I have / nothing yet) and "What should it look like?" (realistic me / stylized character / creature / brand mascot). The hub then highlights *the one recommended method*, dims the rest (still reachable), and pre-seeds the destination route's query params so the next screen starts aimed.
- **Live method previews.** Each method card shows a real, rotating `model-viewer` example of what that pipeline actually produces (selfie → realistic head, prompt → stylized character, etc.) instead of an icon — so the choice is made on outcomes, not jargon.
- **Inline quick-create for the lightweight paths.** For "Upload GLB" and "Customize," let the user complete the whole thing on `/create` (drop file → see it rigged in a viewer → name → save) without the `/create-review` bounce. Reserve route hops for the genuinely heavy pipelines.
- **Soft auth, not a redirect wall.** For the selfie/prompt cards, don't hard-redirect anonymous users to `/login`. Capture intent, let them start (or pick the photo), then present an inline claim/auth step the moment server work is actually needed — preserving the chosen method and any staged input.
- **A "remix what's trending" rail.** Upgrade the thin remix strip into a real discovery rail of forkable public avatars (with creator attribution and fork counts) pulled from real avatar data — one tap forks into an owned copy. This turns `/create` into a creation *and* discovery surface.
- **Cross-feature wiring:** carry the chosen visual style and any `?wizard=1&next=` context all the way through to `/create/selfie`, `/create/prompt`, and `/create/studio`; and on completion, deep-link forward to `/agent/new?avatar_id=...` so "made a body" flows seamlessly into "give it a brain" — closing the loop the onboarding wizard opened.

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
4. **Delete this task file** — `prompts/feature-innovation/01_02_avatar-creation-hub.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/01-onboarding-creation.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
