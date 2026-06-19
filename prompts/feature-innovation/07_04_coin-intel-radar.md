# 🚀 Innovation Brief — Coin Intel & Radar: Self-Explaining Due Diligence

> **Task file:** `prompts/feature-innovation/07_04_coin-intel-radar.md`
> **Surface:** `/radar` and `/coin-intel` (two distinct engines — do not conflate)
> **Primary source:** `pages/radar.html` + `src/radar.js` (`mountRadar`, imports `src/shared/log.js`) → `GET /api/pump/coin-intel`; `pages/coin-intel.html` (self-contained inline module) → backend `api/pump/intel.js` (`GET /api/pump/intel`)
> **Atlas reference:** `docs/ux-flows/07-crypto-trading-analytics.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a trader staring at a fresh launch in its first minutes asking one terrified question: *"Is this organic, or am I about to get rugged?"* These two surfaces exist to answer that with on-chain evidence: `/radar` classifies coins observed in their first ~90 seconds (risk-scored, bundle/rug detection); `/coin-intel` is a deeper engine — quality score, verdict, organic-vs-bundle breakdown, risk flags, narrative, plus a "what it learned" transparency view of its own signal weights and outcomes.

"Gamechanging" means reinventing token due-diligence around an AI that **explains itself**. The trader shouldn't just see a verdict — they should understand the reasoning, see the evidence trace to real on-chain trades, and watch the model's confidence and self-reported accuracy in the open. Build the diligence tool that replaces ten browser tabs and a gut feeling with a transparent, auditable second opinion.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (a forensic on-chain analyst's report, the explainability of a great credit-score breakdown, the trust-through-transparency of an open model card, Stripe Radar's fraud signals). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/radar` and `/coin-intel` — distinct engines despite similar names (`/radar` → `/api/pump/coin-intel`; `/coin-intel` → `/api/pump/intel`).
- **Source:** `pages/radar.html` + `src/radar.js` (`mountRadar`); `pages/coin-intel.html` (inline module) + `api/pump/intel.js`.
- **Current flow:**
  - **/radar:** `mountRadar()` reads URL (`category`, `minQuality`), builds toolbar, polls every 12s → `GET /api/pump/coin-intel` renders first-~90s coins, classified + risk-scored; unmeasured signals render "not measured" (never 0). Filters: category chips, min-quality slider, per-coin Watch (`ld_watchlist`), click → drawer `?mint=<mint>&wallets=1` (single-coin wallet breakdown). Risk-flag pills: bundle_launch, dev_dumped, single_whale, low_diversity, fresh_wallet_swarm, sell_pressure, sniped.
  - **/coin-intel:** reads `ld_watchlist`, renders category chips + skeletons; `loadStats()` (`?view=learning`) + `loadRadar()`, auto-refresh 15s → `GET /api/pump/intel?view=feed` renders cards (quality ring 0–100, verdict pill strong/watch/caution/avoid, organic-vs-bundle bar, risk flags, narrative). Toolbar: debounced search, category chips, verdict + quality dropdowns. Tabs: Radar / Leaderboard (`?view=leaderboard`) / Smart-Money Traders (`?view=traders`) / What it learned (`?view=learning`). Drawer `?mint=<mint>` (full signals + outcome + classified wallets + funder clusters/bubble-map) + async `GET /api/oracle/coin` enrichment.
- **What works today:** two real, complementary diligence engines; live polling; honest "not measured" semantics; risk-flag taxonomy; quality scoring + verdicts; a "what it learned" weights/outcome view; per-coin wallet + funder-cluster bubble-map drawer; Oracle conviction enrichment; `ld_watchlist` integration.
- **Real APIs / dependencies already wired:** `GET /api/pump/coin-intel` (list + `?mint=&wallets=1`), `/api/img`; `GET /api/pump/intel` (`view=feed|leaderboard|traders|learning`, `?mint=`), async `GET /api/oracle/coin`. Data from `pump_coin_intel`, `pump_coin_outcomes`, `pump_coin_wallets`, `pump_intel_weights` (off-browser engine).
- **Where it's mediocre, thin, or unfinished:** the two engines overlap confusingly for users — same vocabulary, different pages, no shared mental model or cross-link. The verdict is a label; the *reasoning* is buried in a drawer and never narrated as a chain of evidence. "What it learned" exists but is a stats page, not a living trust signal woven into each verdict ("this engine has been 67% right on 'avoid' calls"). The bubble-map/funder-cluster is the strongest asset but is hidden behind a click. There's no diff-over-time (how a coin's risk evolved minute by minute), and no way for the trader to ask the engine *"why?"* in natural language.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Self-explaining verdict:** every quality score decomposes into a ranked, plain-English evidence chain — each factor with its weight, direction, and a link to the on-chain event that triggered it. The trader reads *the argument*, not just the conclusion, in seconds.
- **"Ask the engine":** a natural-language explain affordance per coin ("why caution?") that streams a grounded answer built only from this coin's observed signals and the model's learned weights — diligence that talks back, never hallucinates beyond the evidence.
- **Risk timeline:** replay how a coin's risk profile evolved across its first minutes (bundle detected → dev dumped → diversity recovering), so the trader sees the *trajectory*, not a single snapshot. The bubble-map of funder clusters becomes a hero visualization, not a hidden drawer.
- **Earned-accuracy badge:** surface each verdict tier's real historical hit-rate (from `pump_coin_outcomes`) right next to the verdict — turn "what it learned" from a separate tab into inline, auditable trust.
- **Coherent two-engine story:** give `/radar` (the fast first-90s tripwire) and `/coin-intel` (the deep dossier) one clear relationship — radar flags it, intel explains it — with a clean handoff/deep-link between them so users stop confusing the two.
- **Cross-feature wiring (required):** push the verdict + top risk flags into `/watchlist` cards and tier-change alerts, into `/oracle` drawers as the diligence layer beneath conviction, into `/pump-visualizer` (color/flag spheres by risk), and into `/smart-money` (cross-reference proven wallets against flagged funders). A coin flagged "rug risk" on radar should be flagged everywhere.

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
4. **Delete this task file** — `prompts/feature-innovation/07_04_coin-intel-radar.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/07-crypto-trading-analytics.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
