# 🚀 Innovation Brief — Strategy Lab: No-Code Autonomous Trading Builder

> **Task file:** `prompts/feature-innovation/07_07_strategy-lab.md`
> **Surface:** `/strategy-lab`
> **Primary source:** `public/strategy-lab.html` (pre-built static, ~720 lines, text-only UI, no 3D); `vercel.json` rewrite `/strategy-lab → /strategy-lab.html`
> **Atlas reference:** `docs/ux-flows/07-crypto-trading-analytics.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user wants their agent to trade *for them* by rules they define — scan for candidates, filter by criteria, enter, exit, with hard caps — and they want to *prove the strategy works before risking real SOL*. `/strategy-lab` exists to be the no-code autonomous trading strategy builder: define a spec, validate it, backtest it on real on-chain data, simulate it live, and — gated behind sign-in, a provisioned wallet, and a balance check — run it live with real funds, streaming every entry/exit into a log.

This is the **most interactive surface in the cluster**, and the highest-stakes: it signs real transactions. "Gamechanging" means making strategy-building feel *safe and powerful* — powerful enough that a non-coder can express a real edge, safe enough that they always understand exactly what their money will do before it does it. The leap is to make the validate→backtest→run pipeline a confidence-building experience, not a JSON editor with buttons. Build the tool that turns "I have a trading idea" into "my agent is running it, and I trust it."

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (TradingView's strategy tester, Zapier/n8n's visual flow builders, the safety choreography of a Stripe payment confirmation, the clarity of a great backtest report). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/strategy-lab` (static, rewritten from `/strategy-lab.html`).
- **Source:** `public/strategy-lab.html` (~720 lines, text-only, no 3D).
- **Current flow:** 4 required (arrive → spec → Validate → Run simulate) + ~4 optional. Arrive → spec editor + results/portfolio panels render; `GET /api/agents` populates agent dropdown if signed in; pick network (mainnet/devnet). Optional select agent → `GET /api/agents/{id}/solana?network=` shows wallet + balance, provision via `POST` if none, low-balance warning < 0.02 SOL. Load preset (Momentum/Snipe/Mean-revert) or hand-edit JSON spec (`scan`, `filters`, `entry`, `exit`, `caps`). Validate → `POST /api/pump/strategy-validate`. Backtest → `POST /api/pump/strategy-backtest` (real on-chain, no auth) → metrics grid (PnL, ROI, win rate, trades, max drawdown, SOL deployed) + per-trade table. Run → `POST /api/pump/strategy-run` `{durationSec, mode:'simulate'|'live', network, agentId?}` → SSE stream (start/log/enter/exit/skip/done) into live log. Stop (`activeRun.abort()`). Portfolio panel → `GET /api/pump/portfolio?agentId=&network=` (holdings, cost basis, unrealized PnL); Close All → `POST /api/pump/strategy-close-all`.
- **What works today:** real validate/backtest/run pipeline on real on-chain data; presets + hand-edited JSON spec; SSE live run log; simulate (public) vs live (gated: sign-in + provisioned wallet + ≥0.02 SOL + confirmation dialog); portfolio with cost basis + unrealized PnL; Close All; designed empty/error states; network toggle.
- **Real APIs / dependencies already wired:** `/api/agents`, `/api/agents/{id}/solana` (GET+POST), `/api/pump/strategy-validate`, `/api/pump/strategy-backtest`, `/api/pump/strategy-run` (SSE), `/api/pump/portfolio`, `/api/pump/strategy-close-all`; backend MCP → Solana RPC + pump.fun indexer; agent hot wallet signs in live mode.
- **Where it's mediocre, thin, or unfinished:** the spec is raw JSON — powerful for coders, a wall for the "no-code" user the route promises. There's no visual strategy builder, no inline explanation of what each rule *means* in plain language, no guardrail preview ("this strategy could deploy up to X SOL across Y positions"). Backtest results are a metrics grid + table but no equity curve, no visualization of *where* trades happened, no comparison between strategies. The jump from backtest to live is a confirmation dialog — the safety story could be far richer (what exactly will happen in the first minute, kill-switch, real-time cap consumption). There's no strategy library/sharing, no way to clone a winning trader's style into a spec.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **True no-code builder:** a visual rule builder (scan → filters → entry → exit → caps) that compiles to the existing JSON spec — each rule a plain-English sentence the user assembles, with live validation, so a non-coder builds a real strategy without touching JSON. Keep the JSON view as an "advanced" toggle, perfectly round-tripped.
- **Backtest that tells a story:** an equity curve, drawdown band, and a trade-by-trade timeline visualization on top of the metrics grid; the ability to backtest two specs side-by-side and see which edge is real; a plain-English summary of *why* the strategy won or lost.
- **Safety as a feature, not a dialog:** before any live run, a "what will happen" preview — max SOL at risk, max concurrent positions, worst-case drawdown from backtest — plus a live cap-consumption meter and an always-visible kill switch during the run. The trader should never be surprised by what their money did.
- **Strategy library:** save, name, version, and (optionally) share strategies; seed from presets *and* from real winning behavior — "build a strategy from this trader's style" pulling from the leaderboard/trader profiles.
- **Cross-feature wiring (required):** connect Strategy Lab to the platform's brain and reputation — use Oracle conviction tiers and radar/intel risk flags as first-class scan/filter primitives in the builder; let a backtested strategy graduate into an Oracle armed agent; surface live runs into `/activity` and the trader profile; and make "copy this trader" from `/leaderboard` land here as a pre-filled, editable spec.

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
4. **Delete this task file** — `prompts/feature-innovation/07_07_strategy-lab.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/07-crypto-trading-analytics.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
