# 🚀 Innovation Brief — Trader Leaderboard & Profiles

> **Task file:** `prompts/feature-innovation/07_03_trader-leaderboard.md`
> **Surface:** `/leaderboard` → `/trader?wallet=…` (`/trader/<id>`)
> **Primary source:** `pages/leaderboard.html`, `src/leaderboard.js` (imports `src/trader-format.js`, `src/shared/agent-wallet-chip.js`); trader profile `src/trader.js`
> **Atlas reference:** `docs/ux-flows/07-crypto-trading-analytics.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a trader deciding *who to follow and copy*. They open `/leaderboard` to find the agents that actually win, and drill into a trader profile to verify the track record before trusting it with their attention or capital. This feature exists to make on-chain trading skill **legible, credible, and social** — a ranked board where every number is provable on-chain, and a profile that turns a wallet into a reputation.

"Gamechanging" means a leaderboard a trader *believes* (because proof is one click away, not asserted) and a profile worth *sharing* (because it tells a story — the equity curve, the best calls, the streak — not just a stat dump). Build the credible, social trader leaderboard that becomes the platform's reputation layer.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Nansen's wallet profiler, the proof-of-skill rigor of a verified trading record, the shareable polish of a Strava profile or a GitHub contribution graph, the ranking authority of a real sports leaderboard). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/leaderboard`; row drill-in → trader profile `/trader?wallet=…`.
- **Source:** `pages/leaderboard.html`, `src/leaderboard.js`, `src/trader-format.js`, `src/shared/agent-wallet-chip.js`; profile `src/trader.js`.
- **Current flow:** arrive → `readUrl()` hydrates state (network/window/sort/verified), live-refresh every 20s → `GET /api/sniper/leaderboard?network=&window=&sort=&verified=` renders ranked rows (agent name + verified badge, wallet chip, unique coins, copiers count; top 3 styled). Optional: window 24h/7d/30d/all, network mainnet/devnet, sort score/pnl/winrate/roi, "Verified only", click row → trader profile (full track record, equity curve, proof tab with on-chain tx, copy-trading panel, shareable PnL card via `GET /api/sniper/trader`).
- **What works today:** real ranked board with multiple windows/sorts/network/verified filters; URL hydration; 20s live refresh with stale/reconnecting badge; top-3 styling; copiers count; trader profile with equity curve, on-chain proof tab, copy panel, shareable PnL card; `#lb-retry` on load failure.
- **Real APIs / dependencies already wired:** `GET /api/sniper/leaderboard`; profile `GET /api/sniper/trader`; `agent-wallet-chip.js`, `trader-format.js`.
- **Where it's mediocre, thin, or unfinished:** the board is a sortable table — it doesn't *tell you why* a trader is good (no signature style, no "what they're best at," no risk profile). "Verified" is a binary badge, not a trust narrative. There's no movement/momentum signal (who's climbing, who's hot this week vs. all-time). The profile shows a track record but doesn't make it *social* — no follower graph, no "traders like this one," no head-to-head comparison, no way to see a trader's calls *as they happen*. The copiers count exists but copy-trading isn't surfaced as a first-class social loop. Discoverability is weak: a great trader far down a long list is invisible.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Skill fingerprint, not just rank:** each row/profile carries a compact "style" signature derived from real on-chain behavior — fast-flip vs. conviction-hold, win-rate-vs-ROI tradeoff, average hold time, favored categories, drawdown discipline — so a trader can pick *the kind of skill they want to follow*, not just the top number.
- **Momentum & movement:** show rank deltas (▲ climbed, hot streaks, "best week since…"), and a "Rising" slice that surfaces traders heating up before they reach the top — discoverability for talent the static sort buries.
- **Proof you can't fake, front-and-center:** elevate the on-chain proof from a profile tab into the board itself — every headline stat (ROI, win rate, biggest call) is a one-click verifiable on-chain transaction. Make verification the product's signature, the thing screenshots are about.
- **Head-to-head & follow graph:** compare two traders side-by-side (equity curves, style fingerprints, overlap in coins); a follower/copier social graph that makes reputation visible and reciprocal.
- **Shareable, story-driven PnL cards:** upgrade the existing PnL card into a genuinely viral artifact — the trader's signature stat, equity sparkline, verified badge, and a clean OG image, with a copy/share flow that drives traffic back to three.ws.
- **Cross-feature wiring (required):** bind the leaderboard to `/activity` (a top trader's live moves), `/trades` (their closed positions), `/oracle` (the conviction tier they tend to win on), and `/smart-money` (do their wallets show up as proven money?). Make "Copy trades →" route into the Oracle arm flow or strategy-lab as a real follow action, not a dead CTA.

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
4. **Delete this task file** — `prompts/feature-innovation/07_03_trader-leaderboard.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/07-crypto-trading-analytics.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
