# 🚀 Innovation Brief — Launches Feed

> **Task file:** `prompts/feature-innovation/08_02_launches-feed.md`
> **Surface:** `/launches` (and `/launches/:mint` detail)
> **Primary source:** `pages/launches.html` → `src/launches.js`; imports `src/pump/coin-status-card.js` (`mountCoinStatus`), `src/shared/agent-wallet-chip.js` (`walletChipEl`)
> **Atlas reference:** `docs/ux-flows/08-coin-launch-wallets.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a discoverer — someone scanning newly launched agent-coins for the next credible one before the crowd. They need signal fast: which launches are real, which agent is behind them, what the market is doing right now, and which deserve a closer look. The feed exists to be **the place to discover credible new agent-coins on three.ws** — fully public, read-only, live.

"Gamechanging" here means the feed itself does the filtering a savvy trader would do manually: surfacing Oracle conviction tiers, live market enrichment, and the agent provenance behind each coin so a newcomer can tell signal from noise at a glance. It should feel alive — refreshing, breathing, prepending genuinely new launches — and make the user trust three.ws as their discovery surface, not pump.fun's raw firehose.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (DexScreener's density, pump.fun's live feed, Linear's filter ergonomics, Robinhood's at-a-glance market cards). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/launches` (card grid, `#lx-feed`, hero stats, network/oracle filter buttons, marquee ticker, ambient particle canvas) and `/launches/:mint` (detail).
- **Source:** `pages/launches.html` → `src/launches.js`; per-card market via `src/pump/coin-status-card.js` (`mountCoinStatus`); agent chip `src/shared/agent-wallet-chip.js` (`walletChipEl`).
- **Current flow:** 4 required steps (+4 optional) — boot reads URL params (`network`, `agent_id`, `oracle_tier`), starts particle field, renders 8 skeletons → `loadPage()` `GET /api/pump/launches` → per mainnet card `mountCoinStatus` streams price/logo/market-cap/graduation → `enrichCardsWithOracle` batch-paints conviction tier badges → optional filters / load-more / watchlist / live 60s refresh.
- **What works today:** Live market enrichment over seeded identicon placeholders; Oracle tier badges (prime/strong/lean) via `/api/oracle/batch` (≤20/req); network + oracle-tier + agent filters with URL sync; offset pagination; localStorage watchlist (`ld_watchlist`, shared with `/coin3d`); 60s live refresh that prepends new launches; per-card deep links to detail, pump.fun, `/coin3d?mint=`, `/communities/:mint`, and the agent profile.
- **Real APIs / dependencies already wired:** `/api/pump/launches`, `/api/pump/coin`, `/api/oracle/batch`, `/api/agents/:id`. External: pump.fun, Solscan, Solana explorer (links).
- **Where it's mediocre, thin, or unfinished:** The grid is a list of cards, not a ranked discovery surface — there is no sort (by market cap, age, conviction, momentum), no "rising / trending" lens, no way to compare. Oracle tiers are badges, not a filter-and-rank dimension users can lean on. The `/launches/:mint` detail is thin relative to what the data supports. No personalization beyond the watchlist. Devnet cards are dead-ends with static identity. The empty/error states exist but the *populated* state lacks a sense of velocity and credibility ranking that would make this the default discovery tool.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Conviction-ranked discovery.** Make Oracle tier a first-class sort/rank, not just a badge. Default the feed to a credibility-weighted order (tier × recency × live market signal) so the best new agent-coins float up — turn the firehose into a curated lead list.
- **Momentum lenses.** Add sortable/filterable views: Newest, Rising (market-cap velocity from `/api/pump/coin` deltas), Near graduation, Most-watched. Each is a live lens over the same real data.
- **A real `/launches/:mint` detail.** Build it into a credible coin dossier: live market + bonding-curve, the launching agent's provenance, Oracle conviction rationale, holder snapshot, and an embedded `/coin3d` view — the page a trader sends to a friend to say "look at this one."
- **Provenance you can trust.** Lean on the `agent-wallet-chip` to show *who* launched each coin (agent + wallet track record), turning anonymous mints into accountable launches.
- **Cross-feature wiring:** link every card's 3D button to `/coin3d?mint=` (token as a living object) and its 3D world to `/communities/:mint`; let a coin's launching agent jump to that agent's profile and its full launch history; surface a coin's `*.threews.sol` name if it has one (`/threews/claim` ecosystem) so identity and discovery connect.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed.
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime. The `/launches` feed renders coins users launched through three.ws from real launch records — that is the permitted product feature; do not hardcode or recommend any specific non-$THREE mint.
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
4. **Delete this task file** — `prompts/feature-innovation/08_02_launches-feed.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/08-coin-launch-wallets.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
