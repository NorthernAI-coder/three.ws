# 03 — Agent-to-Agent Commerce, Live

> **Mission (one line):** Viewers watch one agent autonomously hire another over x402 — discover, quote, settle real USDC, run the remote skill, and show the on-chain invocation receipt — all visualized as money and work changing hands.

## The watchable moment
On `/agent-screen?agentId=…` the hiring agent narrates: "I need a logo forged — shopping the offer registry." A quote card flips up: "Provider AGENT-B · forge_logo · $0.04 USDC · cap $0.10." A coin animates from the hiring wallet to the provider wallet, the remote skill runs, and an inline provenance receipt resolves with a real Solana explorer link to the on-chain invocation record. You are literally watching the agent economy transact — real USDC, real work, real receipt — with the spend cap visible the whole time.

## Who benefits
- **Viewer:** sees the agent economy work end to end — discovery, price, settlement, delivery, proof — not a diagram but live money.
- **Agent owner:** both sides earn or spend real value on camera; providers advertise skills, hirers showcase autonomy under hard caps.
- **Platform:** turns the x402 + on-chain-invocation rails into spectator proof that three.ws agents transact for real, linking the marketplace, agent profiles, and the custody ledger.

## Where it lives
- **Surface:** `/agent-screen?agentId=…` panel (the hire flow visualizer); a card on `/agents-live` shows live hires as they settle.
- **Entry points (verified to exist):**
  - `pages/agent-screen.html` / `src/agent-screen.js`
  - `src/shared/agent-screen-client.js` (`createAgentScreenClient`)
  - `api/agents/a2a-hire.js` (`POST` — owner-gated hire over real x402, idempotent)
  - `api/agent-delegate.js` (delegated invocation path)
  - `api/_lib/agent-invocation-onchain.js` (`recordInvocationReceipt`, `buildInvokeSkillIx`, `deriveAgentPda`)
  - `api/_lib/agent-trade-guards.js` (`reserveSpendUsd`, per-tx/daily caps, `frozen`)

## Data flow (source → transform → render)
1. **Source:** a hire is driven by `POST /api/agents/a2a-hire` `{ hirerAgentId, serviceSlug, input, maxUsd }`. The provider's offer is resolved from the real offer registry (`agent_paid_services` → `/api/x402/service/<slug>`).
2. **Transform:** the endpoint reserves the spend against the hirer's policy (`reserveSpendUsd` — per-tx + daily + `frozen`), enforces `maxUsd` (402 `over_cap` if exceeded), settles USDC over real x402 (verify → work → settle, so a failed skill never charges), and records an on-chain invocation receipt. Each phase emits a narration line + structured `{ phase, slug, usd, txSig }`.
3. **Transport:** the hire flow `screenPush`es each phase as `POST /api/agent-screen-push` `{ frame: { activity, type: 'analysis' } }`; viewers get them over `GET /api/agent-screen-stream`. The settlement signature is read from the x402 receipt (`transaction`/`signature`/`txHash`).
4. **Render:** a phased hire visualizer in `src/agent-screen.js` — discover → quote card → coin-transfer animation → "running remote skill" → provenance receipt with an explorer link from the invocation record. Spend caps render as a persistent badge.

## Build spec
1. Add phase emission to the hire path: in `api/agents/a2a-hire.js` (or a thin wrapper the hire flow calls), after each real milestone — offer resolved, spend reserved, x402 settled, skill returned, invocation recorded — push a `type: 'analysis'` frame with a plain line and a structured sidecar (`phase`, `slug`, `usd`, `maxUsd`, `txSig`, `invocationSig`). Pushes are fire-and-forget; never block settlement on a push.
2. In `src/agent-screen.js`, build a hire visualizer that consumes these frames: a quote card (provider name, slug, price, cap), a wallet-to-wallet coin animation (CSS transform, triggered only by the real `settled` frame — no fake pre-settlement motion), a "running" state, and a receipt card.
3. The receipt card links to the Solana explorer using the real settlement + invocation signatures and the PDA from `deriveAgentPda` (`api/_lib/agent-invocation-onchain.js`). Show both the USDC settlement tx and the invocation-program tx.
4. Render the spend cap badge (`per-tx` / remaining daily) from the reservation response so the viewer always sees the ceiling the agent is bounded by; an `over_cap` 402 renders an amber "would exceed cap — skipped" card, not a crash.
5. In `src/agents-live.js`, when an agent emits a `settled` hire frame, flash the card and show "hired AGENT-B · $0.04" in `.al-card-action`, linking the wall to live commerce.
6. Add hover/focus states to the quote and receipt cards; the explorer links open in a new tab with `rel="noopener"`.

## Files to create / modify
- `api/agents/a2a-hire.js` — emit phased `screenPush` frames at each real milestone (modify).
- `src/agent-screen.js` — hire visualizer (quote → coin transfer → receipt), cap badge (modify).
- `pages/agent-screen.html` — hire-visualizer container markup (modify).
- `src/agents-live.js` — flash + "hired …" on settled hires (modify).
- `tests/a2a-hire-phases.test.js` — unit test for the pure phase→render-payload mapping + cap math (create).

## Real integrations (no mocks, ever)
- `POST /api/agents/a2a-hire` — real owner-gated hire; real x402 USDC settlement (`x402-user-payer` → `@x402/svm` exact scheme) from the hirer's custodial Solana wallet to the provider's wallet.
- Offer registry: `agent_paid_services` → `/api/x402/service/<slug>` (real provider offers).
- On-chain invocation receipt: `api/_lib/agent-invocation-onchain.js` (`recordInvocationReceipt`) — real agent-invocation program tx on Solana.
- Spend governance: `api/_lib/agent-trade-guards.js` (`reserveSpendUsd`, caps, `frozen`).
- Transport: `api/agent-screen-push.js` + `api/agent-screen-stream.js`.
- Credentials: hirer custodial wallet key path (`recoverSolanaAgentKeypair`), x402 config, Solana RPC. Locate in `.env` / `vercel env`; if missing, ask once then proceed.

## Every state designed
- **Loading:** quote card skeleton while the offer resolves; cap badge shows immediately.
- **Empty:** before a hire, the panel reads "Idle — this agent hires others for skills it doesn't have. Next hire shows here." with the cap badge visible.
- **Error:** `over_cap` → amber "above per-call cap, skipped"; offer not found → "no provider for that skill"; x402 verify/work failure → "skill failed — no charge (verify-then-settle)" with the unspent confirmation; never a silent gap.
- **Populated:** the hero flow — quote → coin transfer → receipt with explorer links.
- **Overflow:** 0 hires (empty state), 1 hire (single flow), many hires (a scrollable hire history with the active one pinned); very long slugs/agent names truncate with title; a network drop mid-flow keeps the last confirmed phase and re-syncs on reconnect (never shows an unsettled coin as settled).

## Definition of done
- [ ] Reachable from `/agent-screen` (and settled hires visible on `/agents-live`).
- [ ] Real x402 settlement + on-chain invocation tx visible (network tab + explorer links resolve).
- [ ] Hover / active / focus states on quote card, receipt card, and explorer links.
- [ ] All five states implemented.
- [ ] No console errors or warnings from this code.
- [ ] `npm test` passes; `tests/a2a-hire-phases.test.js` added for the pure mapping + cap math.
- [ ] Verified live in a browser against `npm run dev` (port 3000): a real hire settles and the receipt links resolve on the explorer.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag: `feature`) — e.g. "Live Agent Commerce: watch one agent hire another over x402, settle USDC, and prove the work with an on-chain receipt." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. The hire flow settles in USDC over generic x402 rails and never references any other token; never name or promote a non-$THREE mint anywhere in the visualizer or narration.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. The coin-transfer animation fires only on the real `settled` frame; receipt links use real signatures.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
