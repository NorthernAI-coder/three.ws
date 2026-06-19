# 🚀 Innovation Brief — Agent Wallet x402 Pay (3D demo)

> **Task file:** `prompts/feature-innovation/08_05_agent-wallet-x402.md`
> **Surface:** `/play/agent-wallet`
> **Primary source:** `pages/play/agent-wallet.html` → `src/play-agent-wallet.js`; `src/game/avatar-rig.js`, `src/game/play-handoff.js`; bridge `api/agent-wallet-bridge` (prod) or `scripts/agent-wallet-x402-bridge.mjs` on `127.0.0.1:4402` (dev)
> **Atlas reference:** `docs/ux-flows/08-coin-launch-wallets.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is someone who has heard "AI agents can pay for things autonomously" and wants to *see it actually happen* — not a diagram, a real transaction. The feature exists to make autonomous agent payments **tangible and trustworthy**: a 3D avatar walks to a kiosk and pays a real x402 endpoint $0.01 USDC on Solana mainnet, money genuinely leaving the agent's wallet, and returns with the purchased data. It's the most concrete proof that three.ws agents have economic agency.

"Gamechanging" here means turning an abstract protocol (x402, HTTP 402 Payment Required + on-chain settlement) into a **believable, repeatable, trustworthy spectacle**. The user must come away certain the payment was real — real wallet, real chain, real settlement, real Solscan link — and delighted by the embodiment of it. This is the platform's flagship demo of autonomous payments; it should convert skeptics.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Stripe's payment UX clarity, Coinbase Commerce confidence, the polish of a AAA game interaction, Linear's status timelines). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/play/agent-wallet` (`#stage3d` 3D scene: avatar + kiosk + stage board; side panel with topic chips, endpoint card, Pay button).
- **Source:** `pages/play/agent-wallet.html` → `src/play-agent-wallet.js`; `src/game/avatar-rig.js`, `src/game/play-handoff.js`. Bridge: hosted `api/agent-wallet-bridge` (prod) or local `scripts/agent-wallet-x402-bridge.mjs` on `127.0.0.1:4402` (dev).
- **Current flow:** 6 required (+1 optional) — boot loads saved `/play` avatar (`CC_AVATAR_KEY`/`?avatar=`), builds 3D rig, `refreshStatus()` → bridge `?status=1` (address/mode + USD balance, repolls 30s) → `loadQuote()` → bridge `?quote=1&endpoint=…` (name/price/pay-to/tags) → optional topic chip (BTC/ETH/SOL) → "Send avatar to pay — $0.01 USDC" → avatar walks to kiosk, pay ring pulses → `POST` bridge `?pay=1` SSE streams `challenge`(402) → `signing` → `signed`/`submitting` → `done` (settled mainnet), board/kiosk/stepper animate in lockstep → receipt (amount, payer→payTo, Solscan link, purchased crypto-intel payload), avatar celebrates + walks home, session total accrues.
- **What works today:** Real $0.01 USDC mainnet settlement via x402 facilitator; SSE-streamed pay stages animated across 3D scene + stepper; hosted vs. local-dev bridge with different auth models; 401 needs-auth (402→401 "Sign in to pay") and 429 rate-limit handling; live balance + session total; receipt with real Solscan tx link and the purchased intel payload.
- **Real APIs / dependencies already wired:** bridge `status`/`quote`/`pay` (`/api/agent-wallet-bridge` or local `:4402`); paid endpoint `https://three.ws/api/x402/crypto-intel`; Solana mainnet settlement via x402 facilitator; Solscan (tx link). **The payment is real** — $0.01 USDC leaves the wallet.
- **Where it's mediocre, thin, or unfinished:** It's a single demo of a single endpoint paying a fixed amount — it proves the concept but doesn't *expand* it. The trust evidence (this really happened on mainnet) is a Solscan link, not a designed, verifiable receipt a skeptic would accept. The 3D scene is a nice touch but the payment *protocol* (the 402 challenge, the signing, the settlement) is under-explained for the curious. There's no history of past payments, no sense of the agent's spending over time, and no path from "I saw it work" to "let me make my agent do this."

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Make the receipt undeniable.** Build a verifiable, designed receipt: amount, payer agent wallet → endpoint payTo, on-chain signature with a one-tap Solscan verify, and the exact x402 challenge/settlement trace — the artifact that converts a skeptic.
- **Explain the protocol as it happens.** Annotate each SSE stage (402 challenge → sign → submit → settle) inline so the user *understands* what autonomous payment means, not just that it happened. Teach while you delight.
- **A spend ledger.** Persist and surface the agent's real payment history (this session and prior) so the demo reads as an ongoing economic agent, not a one-shot trick. Show session and lifetime spend.
- **More to buy.** Generalize beyond a single endpoint/topic to a small, real catalog of x402-priced data the avatar can fetch — each a genuine settlement — so the agent feels like it has a wallet it actually uses.
- **Cross-feature wiring:** connect to the agent's real custodial wallet used elsewhere (the launch flow's agent wallet, `/avatar-wallet-chat`'s `/api/agent/wallet`) so balance and history are consistent across the platform; offer "fund this wallet" with the same deposit pattern as `/launch`; and let a user pick *their* agent (`/api/agents`) to run the payment, turning the demo into their agent doing real work.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed. (The payment must stay a real on-chain settlement — never fake a tx or signature.)
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation. (Bridge offline, low balance, 401, 429, failed settlement must each have a designed, honest state — "no funds moved" when true.)
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime. (USDC here is the settlement currency of the x402 protocol, not a promoted token — keep it functional, never marketed.)
- **Read before you write.** Match the existing patterns, naming, file organization, and the design tokens in `DESIGN-TOKENS.md`. Consistency compounds.
- **Accessibility + responsive (320 / 768 / 1440) + microinteractions** are part of done, not polish. Semantic HTML, ARIA, keyboard nav, focus rings, sufficient contrast. (The 3D scene must have a reduced-motion-aware, accessible fallback for the pay flow.)
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
4. **Delete this task file** — `prompts/feature-innovation/08_05_agent-wallet-x402.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/08-coin-launch-wallets.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
