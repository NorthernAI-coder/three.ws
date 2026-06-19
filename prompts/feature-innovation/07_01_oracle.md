# 🚀 Innovation Brief — Oracle: AI Conviction Engine

> **Task file:** `prompts/feature-innovation/07_01_oracle.md`
> **Surface:** `/oracle` (+ deep links `/oracle/coin/<mint>`)
> **Primary source:** `pages/oracle.html`, `src/oracle.js` (~1850 lines), `src/oracle-graph.js` (lazy 3D force graph), `src/oracle-tape.js` (live trade tape in coin drawer)
> **Atlas reference:** `docs/ux-flows/07-crypto-trading-analytics.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a Solana memecoin trader who is drowning in launches and noise. They open `/oracle` because they want one thing: a trustworthy "should I care about this coin, right now?" signal — and the confidence to act on it without alt-tabbing to ten other tools. Oracle exists to fuse on-chain behavior (who's buying, how, what kind of coin, where it's heading) into a single 0–100 conviction score and tier, stream it live as every pump.fun launch happens, and — for signed-in users with an agent wallet — let them **arm an autonomous agent** to trade the stream within hard SOL caps.

"Gamechanging" here means conviction a trader *trusts and acts on*. That requires two things competitors don't deliver together: **explainability** (every score decomposes into evidence the trader can audit in seconds) and **a closed accountability loop** (Oracle grades its own past calls publicly, so trust is earned by track record, not asserted). Build the conviction engine a serious trader makes their home tab.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Bloomberg Terminal's information density, Nansen's wallet intelligence, the calm clarity of Linear, the live-data choreography of Stripe's dashboards). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/oracle`; deep links `/oracle/coin/<mint>` open that coin's drawer; share links via `coinShareUrl()`.
- **Source:** `pages/oracle.html`, `src/oracle.js`, lazy `src/oracle-graph.js`, `src/oracle-tape.js`.
- **Current flow:** 3 required steps (arrive → `boot()` loads feed → SSE action-stream connects) + ~6 optional read interactions + a 6-field gated arm flow. Nine view tabs: feed, movers, wallets, edge, proof, agents, activity, graph.
- **What works today:** live conviction feed (0–100 score, tier pill prime/strong/lean/watch/avoid) with shareable URL filters (`tier`, `category`, `minScore`, `view`); SSE `/api/oracle/action-stream` streams newly scored coins live with a Live/Reconnecting indicator; coin drawer with 4-pillar breakdown (who/how/what/move) + live trade tape; Watch/Copy/Share actions write `ld_watchlist`; backtest (edge), resolved-wins (proof), and agent win-rate (agents) ledgers; gated arm flow posts `/api/oracle/watch` to run a custodial agent in simulate or live mode.
- **Real APIs / dependencies already wired:** `/api/oracle/feed`, `/api/oracle/coin`, `/api/oracle/search`, `/api/oracle/movers`, `/api/oracle/categories`, `/api/oracle/backtest`, `/api/oracle/wins`, `/api/oracle/watch` (GET+POST), `/api/oracle/follow` (GET+POST), `/api/agents`; SSE `/api/oracle/action-stream`; oracle-tape live trade stream.
- **Where it's mediocre, thin, or unfinished:** the score is a number with a static pillar breakdown — it doesn't *teach* the trader *why* it changed or *what to watch next*. Nine tabs is navigation, not insight; there's no single synthesized "what matters now" view. The proof/edge ledgers exist but aren't woven into the live score as trust ("this tier hit X% over the last N calls" should sit *next to* the score). The arm flow is a config form, not a confidence-building experience — no preview of what the agent *would have done* on the live stream before you commit real SOL. SSE updates likely repaint cards rather than animating deltas, so the trader can't feel momentum.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Conviction-with-receipts:** every score shows a live, decomposed evidence strip — the top 3 signals currently moving it, each with a sparkline and a one-line plain-English reason ("buyer pedigree rising: 4 proven wallets entered in 90s"). Hovering a pillar reveals the underlying on-chain events. The number is never naked; it always carries its argument.
- **Earned-trust badge inline:** bind the `edge`/`proof` ledgers to the live feed. Each tier pill carries its own rolling, auditable hit-rate ("Prime: 61% to 2x, last 120 calls") that updates as calls resolve — turning the abstract score into a track record the trader can verify by clicking through to resolved wins.
- **Arm-with-confidence dry run:** before a user commits real SOL, show a live "shadow run" — replay the agent's exact rules against the real action-stream for the next N minutes and render the trades it *would* take in a ghost ledger, with projected caps consumed. Trust is built by watching, not by reading a form.
- **Conviction deltas as motion:** when SSE pushes a rescore, animate the score ring and tier transition (transform/opacity only), and surface a "movers in the last 5 min" rail so the trader feels where momentum is concentrating without reading every card.
- **One synthesized "Now" view:** a top-of-page synthesis that fuses feed + movers + wallets + proof into a single answer to "what is the one thing worth my attention right now," with a confidence statement and a single primary action.
- **Cross-feature wiring (required):** make Oracle the conviction backbone of the platform. Push the live score + receipts into `/watchlist` cards (tier-change alerts already exist there — feed them richer reasons), into `/pump-visualizer` sphere coloring and Buy modal, into `/smart-money` and `/coin-intel` drawers (they already async-fetch `/api/oracle/coin` — make that enrichment a first-class, consistent "Oracle verdict" component), and let an armed agent's actions deep-link straight into `/activity` and the trader profile.

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
4. **Delete this task file** — `prompts/feature-innovation/07_01_oracle.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/07-crypto-trading-analytics.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
