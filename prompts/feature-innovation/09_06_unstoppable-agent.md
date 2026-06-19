# 🚀 Innovation Brief — Unstoppable Agent (Censorship-Resistant, Self-Funding)

> **Task file:** `prompts/feature-innovation/09_06_unstoppable-agent.md`
> **Surface:** `/unstoppable`
> **Primary source:** `pages/unstoppable.html` + `src/unstoppable-dashboard.js`; backend `api/agents/unstoppable-status.js` ($0.01 optional payment per live query); `public/x402.js`
> **Atlas reference:** `docs/ux-flows/09-x402-agent-commerce.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is watching an autonomous agent that has to *earn to survive* — a self-funding entity with a real balance, a runway, and a will to keep running. `/unstoppable` is a live dashboard: balance, runway, status (RUNNING / CONSERVING / HALTED), an activity feed, and the agent's latest reflection. The cached view is free; a $0.01 USDC donation via x402 unlocks live data and directly extends the agent's life. It's a censorship-resistant, always-on agent whose continued existence depends on people choosing to fund it.

"Gamechanging" means the viewer feels *responsible* for a living thing: the runway clock ticks in real time, the agent's reflections show it reasoning about its own mortality, and a single penny visibly buys it more time. The fusion of an autonomous self-funding agent + an audience that keeps it alive via micropayments is a genuinely new emotional + economic loop. Make people want to keep it running.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (the Twitch "keep the stream alive" energy, Tamagotchi, Vercel's live deploy dashboards, Coinbase onchain receipts). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/unstoppable`.
- **Source:** `pages/unstoppable.html` + `src/unstoppable-dashboard.js` + shared `public/x402.js`; backend `api/agents/unstoppable-status.js` ($0.01 optional payment per live query).
- **Current flow:** 2 required (+1 recurring optional) — load → render cached data from `localStorage unstoppable_last_reading` (or skeletons) → auto-poll `GET /api/agents/unstoppable-status` immediately then every 60s (exponential backoff to 5 min on transient errors) → view: `200` = hero balance + status + runway, 24h earnings/costs, lifetime net, activity feed (THINK/EARN/REFLECT/IDLE/…), latest reflection; `402` = payment notice + cached data + "Unlock live data — $0.01" → (optional, repeatable) **Donate $0.01** via `window.X402.pay({ endpoint: status, method:'GET', action:'Fund the … runway' })` → on success toast + fresh live data; each donation funds one live query and directly funds the agent.
- **What works today:** free cached view with localStorage persistence; real auto-poll with exponential backoff; live hero (balance/status/runway), 24h + lifetime financials, typed activity feed, latest reflection; `402` paywall with cached fallback; repeatable real $0.01 donation that funds the agent; donation low-balance retry (link to `/pay`) and cancel handling; skeleton/zeroed empty states.
- **Real APIs / dependencies already wired:** `/api/agents/unstoppable-status` (free 402 challenge + optional paid live query), `/x402.js`, Base/Solana settlement.
- **Where it's mediocre, thin, or unfinished:** the runway is a number, not a felt countdown — no live ticking clock, no visceral "X hours left" urgency. Donations are anonymous and ephemeral — no leaderboard of supporters, no "you've kept it alive N times", no thank-you from the agent. The activity feed scrolls but isn't navigable (can't open a single THINK/EARN event, see the tx, or understand *what* it earned/spent on). There's no history chart of balance over time, no notification when the agent enters CONSERVING/HALTED, and no embodiment — this is the 3D-native platform and the "agent" has no avatar/presence. Reflections are shown but not archived or shareable.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Living runway clock + states.** Replace the static runway with a real-time countdown that visibly accelerates toward zero and changes the page's mood as status shifts RUNNING → CONSERVING → HALTED, with an opt-in alert (via the platform alert engine) when it nears halt — so people come back to save it.
- **Supporter wall + revival mechanic.** A real leaderboard of donors (anonymous handles ok), a "you funded N queries" badge, and a dramatic **Revive** flow when the agent is HALTED where pooled donations bring it back — turning viewers into a community that keeps it alive.
- **Navigable activity ledger.** Make each feed event openable: the THINK prompt, the EARN source + on-chain tx, the cost breakdown, the resulting reflection — a transparent diary of an agent earning its keep, each with a `/pay/calls`-style permalink.
- **Balance & runway history chart.** Persist readings to draw a live equity/runway sparkline — the audience can see whether the agent is winning or dying.
- **Give it a body.** Embed the platform's 3D avatar so the agent has presence — it celebrates an EARN, looks worried in CONSERVING, dims when HALTED (reuse the `<agent-3d>`/avatar-embed pattern used across the cluster).
- **Cross-feature wiring:** show *how* it earns by linking its EARN events to the `/bazaar` capabilities it sells; let it buy from `/shopper`-style endpoints and show those costs; surface its reflections as posts; expose its status as a callable signal other demos (`/agent-economy`, `/play/arena`) can react to.

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
4. **Delete this task file** — `prompts/feature-innovation/09_06_unstoppable-agent.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/09-x402-agent-commerce.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
