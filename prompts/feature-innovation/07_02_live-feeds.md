# 🚀 Innovation Brief — Live Feeds: The Unified Alpha Stream

> **Task file:** `prompts/feature-innovation/07_02_live-feeds.md`
> **Surface:** `/activity`, `/trending`, `/trades`
> **Primary source:** `pages/activity.html` (self-contained inline module), `pages/trending.html` (inline module; imports `src/shared/agent-wallet-chip.js`), `pages/trades.html` + `src/trades.js` (imports `src/trader-format.js`)
> **Atlas reference:** `docs/ux-flows/07-crypto-trading-analytics.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a trader who wants to *feel the market's pulse* and catch alpha the moment it appears — without juggling three near-identical monitors. Today that pulse is scattered across three pages: `/activity` (every agent's Oracle-driven move, graded), `/trending` (hottest agents and conviction coins by window), and `/trades` (real closed positions with PnL). Each is a competent live feed; together they are fragmented.

This feature exists to make "what's happening right now, and what should I do about it" answerable in one glance. "Gamechanging" means turning three monitors into one **glanceable, alpha-surfacing real-time feed** that doesn't just list events but *ranks them by how much they should matter to this trader* — surfacing the rare signal (a proven agent just entered, a coin just tiered up, a winning streak forming) above the constant churn. Build the feed a trader leaves open on a second monitor all day.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (a Bloomberg ticker's authority, the live choreography of a trading desk, the signal-over-noise ranking of a great social feed, the calm of Linear's activity stream). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/activity`, `/trending`, `/trades`.
- **Source:** `pages/activity.html`; `pages/trending.html`; `pages/trades.html` + `src/trades.js` + `src/trader-format.js`.
- **Current flow:**
  - **/activity:** arrive → `GET /api/oracle/activity` renders rows (agent, verb, $symbol, tier pill, sim/live tag, outcome, PnL) + KPIs → SSE `/api/oracle/action-stream` prepends live actions. Filters by tier/mode/outcome; cursor pagination; "Copy trades →" on win/open rows links to `/trader/<id>`.
  - **/trending:** arrive → tab (Agents/Coins) + window (24h/7d/All) → `GET /api/trending?window=&limit=10` renders ranked list (agents by real chat activity with wallet chip; coins by Oracle conviction). Rows deep-link to agent/coin pages.
  - **/trades:** arrive → `readUrl()` restores window/minPnl/network from URL+localStorage (`tf_network`) → `GET /api/trades/feed` renders closed-position rows, auto-refresh 30s (paused while paginating). Filters (window ARIA tablist with keyboard nav, minPnl, network), manual refresh, per-row Watch (`ld_watchlist`), load-more, row deep links.
- **What works today:** all three are real, live, public, no-auth; SSE on activity; URL-reflected shareable filters on trades; keyboard-navigable window tablist on trades; wallet chips and conviction wiring already present.
- **Real APIs / dependencies already wired:** `GET /api/oracle/activity`, SSE `/api/oracle/action-stream`, `GET /api/trending?window=&limit=`, `GET /api/trades/feed` (cursor-paginated); `/api/sniper` feeds available; `ld_watchlist` shared key.
- **Where it's mediocre, thin, or unfinished:** three separate pages answer overlapping questions, forcing the trader to context-switch. None ranks events by *relevance* — it's all reverse-chronological or simple metric sort, so a landmark event (a proven wallet entering, a tier upgrade, a record win) scrolls past at the same weight as noise. There's no unified "live alpha" surface, no cross-feed correlation (a trending coin that just got a winning trade and an agent entry is three separate rows in three places), and no notion of "new since you looked away." The auto-refresh/SSE patterns are duplicated and inconsistent across the three.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **One unified live feed with intelligent ranking:** a single stream that merges agent actions, trending shifts, and closed trades, then ranks each item by an "alpha weight" (proven-wallet pedigree + conviction tier + outcome magnitude + recency), so the rare landmark event rises to the top instead of scrolling past. Keep deep, focused views as filtered slices of the same stream — not separate pages.
- **Correlation cards:** when a coin appears across feeds in a short window (trending up *and* an agent entered *and* a winning trade closed), fuse them into one richer "this is heating up" card with all the evidence, instead of three disconnected rows.
- **"While you were away":** a quiet, dismissible summary of the highest-alpha events since the tab was last focused — the trader returns and instantly knows what they missed, no scrollback.
- **Glanceable density modes:** a calm default and a high-density "ticker" mode for a second monitor; live deltas animate (transform/opacity), with an unobtrusive "↑ N new" jump control when scrolled.
- **Cross-feature wiring (required):** make this the platform's circulatory system — feed Oracle conviction (`/api/oracle/coin` / action-stream) and sniper leaderboard standing into every row; Watch toggles write `ld_watchlist` so items flow to `/watchlist`; "Copy trades →" and trending rows deep-link to `/trader/<id>` and `/oracle/coin/<mint>`; surface armed-agent actions inline so the live feed and the Oracle arm loop reinforce each other.

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
4. **Delete this task file** — `prompts/feature-innovation/07_02_live-feeds.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/07-crypto-trading-analytics.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
