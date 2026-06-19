# 🚀 Innovation Brief — Pay-Per-Call (x402)

> **Task file:** `prompts/feature-innovation/09_01_pay-per-call.md`
> **Surface:** `/pay`, `/pay/calls`, `/pay/c/<slug>`
> **Primary source:** `public/pay/index.html`, `public/pay/calls/index.html`, `public/pay/c/index.html`, `api/x402-pay.js`, `api/mcp`, `api/x402-checkout.js`, `api/x402-skus.js`, `api/x402-checkout-record.js`, `api/_lib/x402-bsc-direct.js`, `api/agents/[id]/solana`, `public/x402.js`
> **Atlas reference:** `docs/ux-flows/09-x402-agent-commerce.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a developer, agent-builder, or curious power-user who wants to pay for a single API call — no account, no subscription, no API key — and watch real money settle on-chain in under a second, then see a real result (including a live 3D model). `/pay` is the canonical demonstration that pay-per-call HTTP payments (x402) are not a whitepaper but a working primitive on three.ws. `/pay/c/<slug>` is its commercial twin: any merchant can mint a branded hosted checkout for one of their paid endpoints.

"Gamechanging" here means the moment between intent and result feels like magic — you type `validate https://…/model.glb`, a server-held agent wallet (or your own Phantom/MetaMask) pays $0.001 of real USDC, the settlement timeline races through `challenge → built → verified → dispatched → settled`, and a rotating GLB appears in the chat with a Solscan receipt. No competitor offers a one-click, multi-rail (Solana + BSC), wallet-optional pay-per-call console that renders the *actual product* (a 3D model) of the call it just paid for. Build that.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Stripe Checkout, Vercel's deploy stream, Linear's command palette, Coinbase's onchain receipts). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/pay` (chat console), `/pay/calls` (static share/OG permalink for one completed call), `/pay/c/<slug>` (hosted merchant checkout).
- **Source:** `public/pay/index.html` (inline module scripts hold all app logic), `public/pay/calls/index.html` (static OG view), `public/pay/c/index.html` + `public/x402.js`; backends `api/x402-pay.js` (SSE payer + `?agents=1`/`?balance=1`/`?feed=1`/`/og`), `api/mcp` (402 probe + dispatch), `api/x402-checkout.js` (`action=prepare|encode`), `api/x402-skus.js`, `api/x402-checkout-record.js`, `api/_lib/x402-bsc-direct.js`, `api/agents/[id]/solana`.
- **Current flow:** 4 required steps (+~4 optional) — chat page with quick-tool chips + prompt input; choose a tool (chip or typed prompt, deep links auto-fire); POST `/api/x402-pay` (SSE) advances the settlement timeline with real ms timings + settle-tx prefix; on `result` a receipt + MCP output renders (model-processing tools render a live `<model-viewer>` GLB); ticker/balance/feed refresh.
- **What works today:** Three real payer modes — server/agent wallet via SSE, Phantom (Solana USDC), MetaMask/EVM on the "BNB Chain" tab (`approve` + `pay(bytes32)`). MCP tools (`list_tools`, `validate`, `inspect`, `optimize`, `search_avatars`) dispatch live; GLB results render in 3D; Solscan tx links; recent-calls ticker; first-visit walkthrough (`localStorage x402:seen-walk`); deep links `/pay?validate=`, `?inspect=`, `?optimize=`, `?list=1`. `/pay/c/<slug>` resolves a SKU, probes the live 402 price, opens the `/x402.js` modal, records the call.
- **Real APIs / dependencies already wired:** `/api/x402-pay` (SSE), `/api/mcp`, `/api/x402-checkout`, `/api/x402-skus`, `/api/x402-checkout-record`, `/api/agents/{id}/solana`, Solana mainnet RPC (`api.mainnet-beta.solana.com`), x402 facilitator (verify/settle), Solscan, BSC `ThreeWSPayments` contract (`0x…1B72Cc`), `/vanity-wallet` grinder.
- **Where it's mediocre, thin, or unfinished:** the experience is a single-shot console — no concept of *chained* paid calls, saved recipes, or a spend budget. The "recent paid calls" ticker is decorative, not navigable into insight. `/pay/c/<slug>` has no self-serve way for a merchant to *create* a SKU (it only renders one). The agent-wallet picker is functional but not delightful — no live balance-per-agent, no top-up shortcut beyond the gen overlay. There is no shareable "I paid for this" artifact richer than the static `/pay/calls` page, and no programmatic curl/SDK snippet a developer can copy to reproduce the exact paid call.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Replayable paid recipes.** Let a user chain calls (validate → optimize → inspect) into a named "recipe", show the total cost preview before running, then execute the whole chain over one SSE stream with a per-step receipt. Persist recipes to share via `/pay?recipe=<id>`.
- **Copy-as-code receipt.** On every completed call, surface a one-click "Reproduce this call" panel with a real `curl` (showing the `402` → `X-PAYMENT` retry) and an `agent-payments-sdk` snippet pre-filled with the exact endpoint, tool, and price. Make the invisible protocol legible.
- **Self-serve SKU minter.** Add a tiny `/pay/c/new` flow (writing through `api/x402-skus.js`) so any merchant can paste a paid endpoint URL, name the action, pick branding, and get a live `/pay/c/<slug>` link — turning `/pay` from a demo into a product anyone can launch.
- **Live spend HUD + budget guard.** Show real-time agent-wallet balance with a per-session budget you can cap; the timeline refuses to dispatch a call that would exceed it, with a one-tap top-up. Reuses the funding UX from `/unstoppable`.
- **Cross-feature wiring:** when a paid MCP call produces a GLB, offer "Open in the avatar editor" / "Mint to /forever as an inscription record" / "Add this endpoint to my /shopper budget agent". Surface "cheaper provider available" by querying `/api/bazaar/arbitrage` for the same capability and deep-linking to `/arbitrage?q=`.
- **Settlement timeline as an embeddable widget.** Extract the timeline into a tiny embeddable so `/ibm/x402-demo`, `/bazaar`, and `/agent-exchange` can all show the same beautiful settlement choreography — one canonical visual for "money moved on-chain".

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
4. **Delete this task file** — `prompts/feature-innovation/09_01_pay-per-call.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/09-x402-agent-commerce.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
