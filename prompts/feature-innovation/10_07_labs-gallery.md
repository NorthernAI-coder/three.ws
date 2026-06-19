# 🚀 Innovation Brief — Labs: Feature Gallery

> **Task file:** `prompts/feature-innovation/10_07_labs-gallery.md`
> **Surface:** `/labs`
> **Primary source:** `pages/labs.html` → `src/labs.js`; data from `/features.json` (static registry, mirror of `/api/features`)
> **Atlas reference:** `docs/ux-flows/10-chat-brain-labs.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user opens `/labs` to **discover everything three.ws can do — and want to try all of it**. They're a newcomer or a returning explorer scanning a grid of "gem" cards for experiments: lip-sync, brain, three-live, voice, club, and more. This surface exists as the platform's showcase — the place that turns "what is this site?" into "I have to play with that."

"Gamechanging" here means a gallery that makes people **explore every experiment**: live, enticing previews that sell each feature in motion, smart organization that surfaces what's new and what's hot, and a discovery flow so good it drives traffic into every other surface. The showcase should feel like the front door of an arcade where every cabinet is already running a demo.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Three.js examples gallery, Awwwards showcases, Vercel templates gallery, Apple's product feature pages, Codrops). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new — a feature gallery whose previews are so alive and well-curated that visitors can't stop clicking into experiments.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/labs` → `pages/labs.html`; a grid of "gem" cards.
- **Source:** `pages/labs.html` → `src/labs.js`. Data: `/features.json` (static registry, a mirror of `/api/features`).
- **Current flow (3 +1):** open → skeleton placeholders render while `/features.json` is fetched → cards render (category-colored: Voice / AI / 3D Live / Crypto / x402); each runs a `HEAD` liveness check (3s timeout) showing a Live/Checking status, plus a lazy IntersectionObserver iframe preview of the route → click a card's "Try it →" CTA → navigate to that feature's route (e.g. `/lipsync`, `/brain`, `/three-live`, `/voice`).
- **What works today:** skeleton loading state; registry fetch from `/features.json`; category-colored cards; per-card `HEAD` liveness check (3s timeout) with Live/Checking/Offline status; lazy IntersectionObserver iframe previews (load only when scrolled into view); category filtering (Voice / AI / 3D / Crypto / x402); working "Try it →" deep links.
- **Real APIs / dependencies already wired:** `GET /features.json` (registry), `HEAD <route>` per card (liveness), iframe `src=<route>` (sandboxed previews).
- **Where it's mediocre, thin, or unfinished:** iframe previews are **heavy and static-feeling** — they load a whole route in a frame (slow, jank-prone, sometimes a blank or login-walled view) rather than a curated, motion-rich teaser; no poster/loop/video fallback while a frame boots. Discovery is shallow: category filter only — **no search, no sort, no "new/updated/popular," no tags, no recommended-next**. No usage signal (which experiments people actually open), no "recently added" tie-in to the changelog, no detail/expanded view. Registry fetch failure leaves bare skeletons (weak error state). No personalization or "continue where you left off." The gallery doesn't reflect *its own platform's* sense of craft — it's a functional grid, not a showcase.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Previews that sell motion without the iframe tax:** lead with lightweight looping poster/video/canvas teasers (e.g. a short captured loop or a live mini-canvas) and lazily upgrade to the live iframe only on hover/focus or click-to-activate — fast, beautiful, and never blank. A featured "hero" card auto-plays.
- **Real discovery:** instant search, sort (new / popular / category), tag facets, and a "What's new" rail wired to the changelog (`data/changelog.json` / `public/changelog.json`) so freshly shipped experiments surface automatically. Add a "recommended next" based on what the visitor just opened.
- **Usage-aware ranking:** record opens/click-throughs (privacy-respecting) and surface a genuine "most explored this week," plus "continue exploring" for return visitors — make the gallery feel curated and current rather than a frozen list.
- **A detail/expanded view per gem:** click for a richer panel (what it is, a bigger live preview, related experiments, deep-links to its sub-routes like `/lipsync/mic`) before launching — turn each card into a mini landing page.
- **Cross-feature wiring (required):** `/features.json` / `/api/features` should be the **single source of truth** every surface reads — make the gallery reflect live status and the changelog, and have it deep-link not just to routes but to *configured* experiences (e.g. `/chat?agent=…`, `/lipsync?avatar=…`, `/launchpad?template=…`). Newly added features (and their `data/pages.json` `added` dates) should appear here automatically, so shipping a feature anywhere makes it discoverable here with zero extra work.

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
4. **Delete this task file** — `prompts/feature-innovation/10_07_labs-gallery.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/10-chat-brain-labs.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
