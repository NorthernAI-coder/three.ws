# 🚀 Innovation Brief — Endpoint Shopper (Autonomous Buyer Agent)

> **Task file:** `prompts/feature-innovation/09_03_endpoint-shopper.md`
> **Surface:** `/shopper`
> **Primary source:** `pages/shopper.html` + `src/shopper-app.js`; backend `api/agents/endpoint-shopper-run.js`; the Bazaar registry (`api/bazaar/*`); `public/paywall.html`
> **Atlas reference:** `docs/ux-flows/09-x402-agent-commerce.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user describes a task in plain language, hands an agent a budget, and trusts it to go shopping: discover the right x402 endpoints, plan a sequence, pay for the calls, and synthesize an answer — autonomously, transparently, and within budget. `/shopper` is the proof that an AI agent can be a *responsible spender* — that you can give software a wallet and a cap and get back work, not a surprise bill.

"Gamechanging" means trust through radical transparency: every dollar is accounted for in a live step trace, the budget is a hard rail the agent visibly respects, and the final answer cites exactly which paid endpoints produced it. The killer feeling is watching an agent reason about *cost* — "this provider is cheaper, I'll use it; I have $0.32 left, I'll stop here." No competitor lets a user safely delegate real on-chain spending to an autonomous endpoint-shopping agent with a verifiable spend ledger. Build the buyer agent people actually trust.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Perplexity's source-cited answers, ChatGPT's tool-use trace, Ramp's spend controls, Linear's progress streams). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/shopper`.
- **Source:** `pages/shopper.html` + `src/shopper-app.js`; backend `api/agents/endpoint-shopper-run.js` (x402, $0.01 base + downstream budget); discovers endpoints via the Bazaar registry; `public/paywall.html` for the 402 case.
- **Current flow:** 5 required (+3 optional) — enter a task (or example chip) → (optional) adjust budget slider ($0.10–$2.00, default $0.50) → click **Run Task** (button "Running…", skeleton cards) → `POST /api/agents/endpoint-shopper-run` `{ task, maxCostUsd }` → agent emits a step trace **discover** 🔍 → **plan** 🗺 → **call** ⚡ (per endpoint: URL + USDC cost + snippet) → **synthesize** 🧠 → timeline + **Total spent** row + **Final Answer** card; button re-enabled.
- **What works today:** real autonomous discover→plan→call→synthesize loop over the live Bazaar registry; budget slider; per-call cost + snippet in the trace; total-spent accounting; final synthesized answer; "Free (no paid calls executed)" path; `402` → paywall card "Pay with Wallet" → `/paywall.html?req=…&return=/shopper`; error/retry card; disabled-button hints for empty task / budget < $0.01.
- **Real APIs / dependencies already wired:** `/api/agents/endpoint-shopper-run`, downstream x402 endpoints discovered via the Bazaar, `/paywall.html`.
- **Where it's mediocre, thin, or unfinished:** the run is fire-and-forget — no streaming (the trace appears, but there's no live SSE feel of the agent thinking), no way to pause/cancel mid-run, no approval gate before it spends. The budget is a number, not a *policy* (no per-provider cap, no "ask me before any call over $X"). There's no saved run history, no shareable result, no re-run with the same plan but cheaper providers. The agent doesn't show *why* it picked one endpoint over another (no cost/quality reasoning surfaced). It doesn't reuse the `/arbitrage` cheapest-provider logic, so it may overpay. Final answers aren't attested the way `/fact-checker` and `/tutor` results are.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Live thinking stream + interrupt.** Convert the run to a real SSE stream so each discover/plan/call/synthesize step appears as it happens with live cost ticking, and add a **Pause / Stop** that halts before the next paid call — the agent must never spend after you say stop.
- **Spend policy, not just a budget.** Let the user set rules: hard cap, per-call max, "approve any call over $X", "prefer cheapest provider". Show the policy as visible rails in the trace, and have the agent narrate when a rule changes its choice.
- **Cost-reasoned routing via arbitrage.** Before each call, route through the `/api/bazaar/arbitrage` cheapest-healthy provider for that capability and show the savings ("chose Provider B, saved $0.004 vs Provider A") — make frugality legible and provable.
- **Attested run receipt.** Produce a SHA-256-attested run summary (task, plan, every paid call + tx, total spent, final answer) shareable at a permalink — the same trust artifact pattern as `/fact-checker`/`/tutor`, so a result can be verified later.
- **Saved runs + re-shop.** Persist run history; let a user re-run a saved task to see if it's cheaper now, or fork the plan with a tighter budget.
- **Cross-feature wiring:** discover from the same registry that powers `/bazaar`; offer "watch this capability's price" via the Bazaar alert layer; deep-link each paid call to a `/pay/calls`-style permalink; let a successful GLB-producing call open in the avatar editor; expose the shopper as a callable capability other agents (e.g. `/play/arena` strategists) could invoke.

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
4. **Delete this task file** — `prompts/feature-innovation/09_03_endpoint-shopper.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/09-x402-agent-commerce.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
