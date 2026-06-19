# 🚀 Innovation Brief — Discover (On-chain Agent Directory)

> **Task file:** `prompts/feature-innovation/05_01_discover.md`
> **Surface:** `/discover` (+ `/discover/a/<chain>/<id>` detail)
> **Primary source:** `public/discover/index.html`, `public/discover/discover.js`, `public/discover/detail.{html,js,css}`, `/api/explore`, `/api/discover-detail`
> **Atlas reference:** `docs/ux-flows/05-discovery-social.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is someone looking for an agent worth their time — a 3D character to remix, a Solana-native agent to trade with, an on-chain identity to verify. `/discover` is three.ws's front door to *everything users have ever launched*: on-chain agents, public avatars, and Solana mints, unified in one grid. They are trying to find the one agent that matters to them right now, fast, and feel that the platform *knows them*.

"Gamechanging" here means turning a filterable grid into a **personalized, addictive discovery engine** — a feed that learns what this visitor is drawn to (chains, kinds, creators, 3D vs flat) and reshuffles itself accordingly, surfaces what's *moving* on-chain right now, and makes every agent one tap from preview, embed, and the detail page. Make it feel like the agent economy is alive and reacting in real time — something a user can't get from any block explorer or NFT marketplace.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Vercel's project gallery, Linear's command-driven navigation, Magic Eden / OpenSea discovery, TikTok's "for you" reflex, Are.na blocks). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/discover`; detail at `/discover/a/<chain>/<id>`, `/discover/a/sol/<asset>` (served by `/api/discover-detail`).
- **Source:** `public/discover/index.html`, `public/discover/discover.js`, `public/discover/detail.{html,js,css}`; APIs `GET /api/explore`, `GET /api/discover-detail`, `GET /api/auth/me`.
- **Current flow:** 2 required (+6 optional) steps — land → `loadPage()` auto-fetches `GET /api/explore?only3d=1&limit=48`, renders onchain/avatar/solana cards; optional search (250ms debounce), source filter (All/On-chain/Avatar/Solana), 3D + x402 chips, 22-chain dropdown, infinite scroll (IntersectionObserver `480px` sentinel) or "Load more", per-card Embed modal (Web component / iframe / Link / Markdown / Farcaster) + `agent://` URI copy, card click → detail.
- **What works today:** Unified multi-source grid; URL-param hydration + `replaceState` deep links; skeletons; per-card lazy `<model-viewer>` preview (static image → model → emoji); directory totals on first page; designed filtered-empty / unfiltered-empty / error+retry states.
- **Real APIs / dependencies already wired:** `/api/explore` (cursor paging), `/api/discover-detail`, `/api/auth/me` (my-agents chip only), `model-viewer` CDN, clipboard API.
- **Where it's mediocre, thin, or unfinished:** It is a *static directory* — identical for every visitor, no personalization, no memory of what you clicked. Sort/x402 are applied **client-side over a page** (incomplete across the full set). No sense of momentum (what's trending, newly launched, most-traded $THREE activity) on-chain. No keyboard-driven navigation/command palette. Embed is the only "share" affordance; no collections, no save/follow. Discovery dead-ends at one card click instead of suggesting "more like this."

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **A "For You" rail that actually learns.** Track (locally + best-effort server-side) which chains, kinds, creators, and 3D-vs-flat cards a visitor previews/opens, and reorder the grid + a pinned "Picked for you" row accordingly. No login required — start from `localStorage` signal, upgrade with `/api/auth/me` when present. Show *why* ("Because you opened 3 Base agents").
- **Live momentum lane.** A top strip of what's *moving right now* — newest on-chain launches, agents with rising chat/trade activity, $THREE-linked launches from the platform's own launch records — with a subtle pulse animation and relative timestamps. Make the directory feel alive, not archival.
- **Command palette discovery (⌘K).** Type to jump: chains, kinds, creators, exact agent by name/`agent://` URI, saved filters. Keyboard-first power-user navigation that doubles as the search experience.
- **Collections / save-for-later.** Let users star agents into named collections (local first, synced when authed) and share a collection as a deep link — turning passive browsing into curation. Wire it so a collection is embeddable via the existing embed modal mechanics.
- **"More like this" on the detail return.** When a user comes back from a detail page, surface a contextual row of similar agents (same chain/kind/creator) instead of the cold grid.
- **Fix sort/filter to be server-truthful.** Push x402 + sort into `/api/explore` so results are correct across the entire set, not just the loaded page.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: a personalized `/discover` should feed `/gallery`, `/characters`, `/agents`, and agent detail pages; a saved collection could surface in the user's dashboard; momentum data overlaps with `/launches`. **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/05_01_discover.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/05-discovery-social.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
