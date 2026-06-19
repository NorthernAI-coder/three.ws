# 🚀 Innovation Brief — Pump Dashboard: The Power-User Command Center

> **Task file:** `prompts/feature-innovation/07_06_pump-dashboard.md`
> **Surface:** `/pump-dashboard` (Token Cockpit)
> **Primary source:** `pages/pump-dashboard.html` (large inline module, ~5000 lines); imports `src/solana/vanity/grinder.js`, `src/solana/vanity/validation.js`, `src/shared/state-kit.js`; uses `src/wallet.js`
> **Atlas reference:** `docs/ux-flows/07-crypto-trading-analytics.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a serious pump.fun operator — a trader/builder who wants *everything in one cockpit*: live launch/trade/whale/graduation feed, network health, market chart, token scanner, quote engine, alert rules, a vanity address grinder, agent management, revenue, API keys. `/pump-dashboard` exists to be that command center — the single tab a power user keeps open all day to monitor, react, and act.

"Gamechanging" means a command center that feels like a *professional terminal*, not a tab graveyard. Twelve tabs is power, but power without orchestration is overwhelm. The leap is to make the cockpit **adaptive and connected**: the most important signal finds the user wherever they are, the headline interactive payoffs (the vanity grinder, the alert-rule builder) feel magical, and every panel links into the rest of the platform so the cockpit is a launchpad, not a silo. Build the surface a power user would pay for.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Bloomberg Terminal's information orchestration, a trading desk's multi-monitor layout, the polish of Vercel/Stripe dashboards, the satisfaction of a great background-job UI). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/pump-dashboard`; entry from nav, "Open Token Cockpit →" (`/dashboard/tokens`), `/autopilot`, sitemap; deep link `?agent=<id>` auto-opens Default Agent panel; `#hash` deep-links any tab.
- **Source:** `pages/pump-dashboard.html` (inline module ~5000 lines); `src/solana/vanity/grinder.js`, `src/solana/vanity/validation.js`, `src/shared/state-kit.js`, `src/wallet.js`.
- **Current flow:** 3 required (arrive → `connectApi()`/`connectWebSocket()` → panels populate) + ~9 optional tab flows. `DOMContentLoaded` restores config from localStorage (api/ws/rpc/key), resolves `?agent=`/`#hash`. `connectApi()` polls `GET /api/healthz` (15s, status dot); `connectWebSocket()` opens `wss://pumpportal.fun/api/data`, subscribes `subscribeNewToken`+`subscribeMigration` (exponential backoff, 8-attempt cap → manual Reconnect banner). Preloads channel-feed, helius-stats (30s), featured agent, trending ($THREE pinned first). 12 hash-routed tabs: Default, Live Feed (rAF-batched, pause+filter), Token Scanner, Quote Engine, Alerts (rule builder + CRUD + live firing + history), Vanity Generator (up to 8 WASM Web Workers, tries/rate/eta, reveal/copy/download keypair), Default Agent (embed iframe, postMessage, manage custom agents w/ CSRF), Revenue, Configuration, API Reference (key CRUD), plus Watches/Claims (require PumpKit backend).
- **What works today:** real WS feed with backoff + manual reconnect; healthz status dot; optional wallet connect → `POST /api/wallet/balances` (SOL + top-10 holdings); token scanner; buy/sell quote forms; alert-rule builder with in-app/webhook/Telegram delivery, cooldown, live firing, history; vanity grinder (real WASM workers, secret never leaves browser); agent embed + management; designed empty/error states via `state-kit`.
- **Real APIs / dependencies already wired:** `/api/healthz`, `/api/pump/helius-stats`, `/api/pump/channel-feed`, `/api/pump/trending`, `/api/agents/featured`, `/api/agents` (+CSRF), `/api/wallet/balances`, `/api/pump/scan`, `/api/pump/quote/{buy,sell}`, `/api/alerts/rules` (CRUD), `/api/notifications`, `/api/api-keys` (CRUD), revenue endpoints; `wss://pumpportal.fun/api/data`; Solana RPC via `/api/solana-rpc`; Phantom/MWA wallet; vanity Web Workers; model-viewer CDN.
- **Where it's mediocre, thin, or unfinished:** 12 tabs are siloed — the feed doesn't talk to the scanner, the scanner doesn't talk to the quote engine, alerts don't deep-link to the thing that fired them. There's no customizable layout (every user gets the same fixed tab order regardless of what they actually use). The headline interactive payoffs (vanity grind, alert builder) are strong but isolated — no celebration on a vanity hit, no "create alert from this feed event" shortcut. The Oracle/conviction intelligence the rest of the platform runs on is barely surfaced here. It's a collection of tools, not an orchestrated workspace.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Command palette + cross-tool flow:** a keyboard-driven command palette (jump to any tab, scan a mint, quote a buy, arm an alert) that turns 12 tabs into one fluid surface — and wire the tools to each other: click a feed event → scan it → quote it → set an alert on it, without leaving the flow.
- **Customizable cockpit layout:** let the power user pin, reorder, and resize the panels they actually use into a saved layout (persisted locally), with a dense "terminal" mode for multi-monitor setups. The cockpit should adapt to the operator, not the reverse.
- **"Create alert from anything":** every live feed event, scanner result, and quote becomes a one-click alert-rule seed — the alert builder pre-filled from real context — closing the gap between *seeing* a signal and *automating* a reaction.
- **Make the vanity grind a moment:** real-time worker telemetry (per-worker rate, combined eta with confidence), a satisfying reveal/celebration on a hit, and a clean security story for the keypair (never leaves browser) made visible and trustworthy.
- **Cross-feature wiring (required):** surface Oracle conviction (`/api/oracle/coin`, action-stream) and radar/intel risk inline on every feed/scanner/quote item so the cockpit inherits the platform's brain; Watch buttons write `ld_watchlist`; alerts deep-link to `/oracle`, `/watchlist`, `/trader`; "arm an agent" hands off to the Oracle arm flow or `/strategy-lab`. The cockpit should feel like the front door to the whole trading platform.

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
4. **Delete this task file** — `prompts/feature-innovation/07_06_pump-dashboard.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/07-crypto-trading-analytics.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
