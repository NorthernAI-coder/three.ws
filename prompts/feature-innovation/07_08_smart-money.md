# 🚀 Innovation Brief — Smart Money: Follow the Winning Wallets

> **Task file:** `prompts/feature-innovation/07_08_smart-money.md`
> **Surface:** `/smart-money` and `/gmgn`
> **Primary source:** `pages/smart-money.html` (self-contained inline module) + backend `api/pump/smart-money.js`; `public/gmgn.html` (pre-built static, ~900 lines) + backend `api/agents/gmgn.js` (SSE `/api/agents/gmgn-feed`, reactive 3D `<model-viewer>` avatar)
> **Atlas reference:** `docs/ux-flows/07-crypto-trading-analytics.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user knows the oldest edge in crypto: *follow the wallets that win.* `/smart-money` ranks fresh coins by buyer pedigree (proven-wallet count, smart buy volume) and maintains a wallet reputation board (smart_money/sniper/dumper/rugger labels); `/gmgn` streams smart-money entries live as an animated, optionally-narrating 3D agent reacts in real time. Together they answer: *which wallets are good, and what are they buying right now?*

"Gamechanging" means making "follow the winning wallets" actionable and alive — not a static reputation table, but a *living signal* that tells the trader when proven money moves, who exactly moved, and whether to follow. The `/gmgn` reactive 3D avatar is a unique asset: a market that *performs* its own pulse. The leap is to fuse the rigor of `/smart-money` (provable wallet pedigree, on-chain evidence) with the visceral, glanceable energy of `/gmgn` (an agent that reacts to smart money in 3D) into one follow-the-winners experience. Build the tool that makes copying smart money feel obvious and safe.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Nansen's smart-money flows, Arkham's wallet intelligence, GMGN's speed, the delight of a character that reacts to live data like a Twitch overlay). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/smart-money`; `/gmgn` (rewritten from `/gmgn.html`; `/api/agents/gmgn-feed → /api/agents/gmgn?_handler=feed`).
- **Source:** `pages/smart-money.html` + `api/pump/smart-money.js`; `public/gmgn.html` + `api/agents/gmgn.js`.
- **Current flow:**
  - **/smart-money:** arrive → reads `ld_watchlist`, renders 6 skeletons, `refresh()`; auto-refresh 20s (pauses when tab hidden) → `GET /api/pump/smart-money?limit=60` (coins ranked by smart_money_score, proven-wallet count, smart buy volume) + parallel `?leaderboard=1&limit=60` (top wallets by reputation). Tabs Feed ↔ Top wallets; per-coin Watch (`ld_watchlist`); click coin → drawer `?mint=<mint>` (notable wallets, labels) + async `GET /api/oracle/coin` (conviction pillars); click wallet → drawer `?wallet=<addr>` (win rate, record, recent coins).
  - **/gmgn:** arrive → 3D agent (CZ default) into `<model-viewer>` (auto-rotate); params chain=sol, interval=1h, minSmartBuys=2, narrate, avatar, mood → SSE `EventSource('/api/agents/gmgn-feed?...')` → `hello` (status pill "Live · SOL · 1h"), last 10 replayed dimmed, then `smart_entry` events stream. Per event: render card (symbol, MC, smart-buy delta, price change), trigger agent animation by delta/new flag, optional TTS narration, increment stats, "↑ N new" jump. Optional: change chain/interval/minSmartBuys, mood (chill/normal/hype), narration toggle, avatar picker modal (`GET /api/avatars/public` + `GET /api/avatars`), Apply (`#ctl-reconnect`), $THREE spotlight tile on CA hit.
- **What works today:** real wallet-reputation board with labels; coins ranked by buyer pedigree; coin + wallet drawers with on-chain records; Oracle conviction enrichment; live SSE smart-money feed with reactive, narrating 3D avatar; mood/narration/avatar controls; instant reconnect on filter change; designed empty/stale/error states with retry.
- **Real APIs / dependencies already wired:** `GET /api/pump/smart-money` (feed / `?leaderboard=1` / `?mint=` / `?wallet=`), async `GET /api/oracle/coin`; SSE `/api/agents/gmgn-feed` (upstream GMGN.ai feed via `connectGmgnFeed`); `/api/avatars/public`, `/api/avatars`; model-viewer CDN. Data from `coin_smart_money` + `wallet_reputation` tables (off-browser sniper engine).
- **Where it's mediocre, thin, or unfinished:** the two surfaces don't know about each other — `/smart-money` is rigorous but static (a ranked table that refreshes), `/gmgn` is alive but shallow (a feed + an avatar, with thin per-wallet depth). Neither lets the trader *act*: there's no "follow this wallet" that turns pedigree into an alert or an armed agent. The wallet reputation is labeled but not narrated (why is this wallet "smart money"? show me its proof). The 3D avatar reacts but doesn't *inform* — its animations are decorative, not a readable signal of intensity. No notion of "a wallet I follow just bought."

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Follow a wallet, get the signal:** turn wallet pedigree into action — "follow" a proven wallet and get alerted (in-app + existing Telegram/webhook plumbing) the moment it enters a fresh coin, with the wallet's track record attached so the trader can judge instantly. Reputation becomes a subscription, not a lookup.
- **Proof-backed reputation:** every smart_money/sniper/dumper/rugger label decomposes into on-chain evidence — win rate, biggest calls, recent record — so the trader trusts the label because they can verify it, not because it's asserted.
- **The avatar as a real instrument:** make the `/gmgn` 3D agent's reactions *mean* something — intensity of animation maps to smart-buy delta, distinct reactions for a known-followed wallet vs. a new one, mood that shifts with market regime — so a glance at the avatar conveys the market's state. A market that performs its own pulse, legibly.
- **Unify rigor + energy:** give `/smart-money` (the dossier) and `/gmgn` (the live show) one coherent relationship — the live feed surfaces the entry, one click drops into the rigorous wallet/coin drawer with full proof. Two views of one idea: follow the winners.
- **Cross-feature wiring (required):** cross-reference smart-money pedigree everywhere — flag proven wallets in `/radar`/`/coin-intel` funder clusters, show "smart money is in" on `/oracle` and `/watchlist` cards, let a "follow these wallets" set seed an Oracle armed agent or a `/strategy-lab` scan filter. A wallet rated "rugger" should warn the trader on every surface.

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
4. **Delete this task file** — `prompts/feature-innovation/07_08_smart-money.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/07-crypto-trading-analytics.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
