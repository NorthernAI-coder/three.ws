# 🚀 Innovation Brief — Watchlist: Proactive Cross-Surface Alpha Tracker

> **Task file:** `prompts/feature-innovation/07_05_watchlist.md`
> **Surface:** `/watchlist` (+ the `ld_watchlist` key threaded across 8 routes)
> **Primary source:** `pages/watchlist.html`, `src/watchlist.js` (imports `src/pump/coin-status-card.js`)
> **Atlas reference:** `docs/ux-flows/07-crypto-trading-analytics.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user has spotted a handful of coins worth watching — on Oracle, radar, trades, smart-money, anywhere — and tapped ☆ Watch. They come to `/watchlist` to keep an eye on them without re-finding them. Today that's a private, device-local board of live status cards. The feature exists to be the trader's *personal command post*: the coins they care about, watched continuously, surfacing changes *before* the trader thinks to look.

"Gamechanging" means turning a passive list into a **proactive, cross-surface alpha tracker** — one that doesn't just refresh cards but *notices things*: a tier upgrade, a proven wallet entering, a risk flag firing, a graduation, a price breakout — and tells the trader the moment it matters. The watchlist already detects tier upgrades; the leap is to make it the connective tissue that pulls every engine's intelligence (Oracle conviction, radar/intel risk, smart-money pedigree) onto the coins the trader has personally chosen, and to alert proactively. Build the watchlist a trader checks first every morning.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (a great stock-watchlist with smart alerts, the calm signal of a well-tuned notification system, the "everything about this thing in one place" of a Linear issue view, a portfolio tracker that actually catches the move). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/watchlist`; the `ld_watchlist` localStorage key is written by oracle, radar, trades, watchlist, smart-money, coin-intel, pump-visualizer, and pump-live (8 surfaces).
- **Source:** `pages/watchlist.html`, `src/watchlist.js`, `src/pump/coin-status-card.js`.
- **Current flow:** (prereq) Watch a coin anywhere → mint stored in `ld_watchlist`. Arrive on `/watchlist` → `readList()` reads + validates mints (base58 32–44) → for each mint mounts a live coin-status card (`mountCoinStatus` → one `GET /api/pump/coin` per coin, deterministic mint identicon behind real pump.fun logo, refresh every 90s) → detects tier upgrades vs `wl_last_tiers`. Optional: toggle alerts (`#wl-alerts`, `wl_alerts_on`), clear list (`#wl-clear`), click card → full coin profile (`/launches/<mint>`). Cross-tab sync via `storage` event.
- **What works today:** device-local private list (no account); validated mints; live status cards via shared `coin-status-card.js` component; 90s refresh; tier-upgrade detection vs `wl_last_tiers`; an alerts toggle; clear; cross-tab `storage` sync; deep links to `/launches/<mint>`; empty state directing users to Watch coins elsewhere.
- **Real APIs / dependencies already wired:** `GET /api/pump/coin` (one per watched coin, via `coin-status-card.js`); `ld_watchlist` shared key; `wl_last_tiers`, `wl_alerts_on` localStorage.
- **Where it's mediocre, thin, or unfinished:** the alerts toggle exists but there's no real delivery path — it's a flag, not a notification system (no in-app surfacing of fired events, no Telegram/webhook, no "what changed since I last looked"). Each card calls `/api/pump/coin` only — it ignores the platform's richer engines (no Oracle conviction, no radar/intel risk flags, no smart-money pedigree on the very coins the user cares most about). There's no organization (no sort, no grouping by tier/risk, no notes/reason-for-watching), no history of how a watched coin evolved, and being device-local with no export means a wiped browser loses everything. It's a viewer, not a tracker.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Proactive change detection across every signal:** extend the existing tier-upgrade detection into a full "what changed" engine per watched coin — conviction tier moves, new proven-wallet entries, risk flags firing, graduation, price/MC breakouts — surfaced as a prioritized "since you last looked" digest at the top of the page, and (if alerts on) delivered in-app and via the platform's existing Telegram/webhook plumbing.
- **One card, all engines:** enrich each status card with the platform's intelligence on demand — Oracle conviction + receipts, radar/intel verdict + top risk flag, smart-money pedigree — so the coins the trader personally chose get the *deepest* view on the platform, not the shallowest.
- **Organize like a power user:** sort/group by tier, conviction, risk, recency; add a private "why I'm watching" note per coin; a calm "needs attention" lane that floats coins with fresh changes above the quiet ones.
- **Watched-coin timeline:** a compact per-coin history (tier/risk/price trajectory since added) so the trader sees the arc, not just the snapshot — answering "is my thesis playing out?"
- **Portability without an account:** keep it device-local and private by default, but add export/import (and, where a session exists, optional cross-device sync) so a cleared browser doesn't erase the trader's work.
- **Cross-feature wiring (required):** the watchlist already receives writes from 8 surfaces — make it *give back*. Feed its change-events into the unified live feed (`/activity`+), let an Oracle armed agent optionally scope to watchlist coins, and make every Watch button across the platform reflect real watchlist membership state (filled star when watched) so the loop is visibly closed everywhere.

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
4. **Delete this task file** — `prompts/feature-innovation/07_05_watchlist.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/07-crypto-trading-analytics.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
