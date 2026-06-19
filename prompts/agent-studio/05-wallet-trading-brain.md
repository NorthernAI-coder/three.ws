# P4 — Money & Trading Brain (wallet + visual sniping/trading rules, real Solana)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md` and
`STRUCTURE.md` first. **Prerequisite:** P0 (`01-foundation.md`) is merged. Read the "Integration
notes for P1–P5" at the top of `src/studio/agent-studio-store.js`. Mount into the **Money** and
**Skills** tabs. This is the **gamechanging crypto** prompt — treat it with the most care.

## The vision you are enabling

Other platforms give traders a dashboard of numbers. We give them a **character with a brain (P1), a
memory of every trade (P2), a body (P3), and now its own money and a visually-programmed trading
mind.** The user funds their agent, draws its sniping/trading rules as a visual flow, and watches the
agent execute — celebrating fills, flagging dumps, learning from losses — live, on the avatar that
follows them across the site. Sniping, trading, launching, buying, selling become something you do
*with a companion you raised*, not a form you submit. Make this the reason people choose three.ws.

We already have: custodial wallets (`api/_lib/agent-wallet.js` — AES-256-GCM, `generateAgentWallet`,
`generateSolanaAgentWallet`, `getOrCreateAgentEvmWallet`), the `agent-wallet-chip` component
(`src/shared/agent-wallet-chip.js`), wallet routes in `api/agents.js`, the coin system (`api/coin/`,
`api/_lib/coin/distribution.js`, `api/_lib/coin/treasury.js`), pump.fun launch (`pages/launch.html`),
real Solana RPC, and on-chain skill licenses (`api/_lib/skill-license-onchain.js`).

## Your mission

### 1. Money panel — the agent's wallet, made visual and safe
- Show the agent's real Solana wallet (balance, holdings, P&L, recent txns from real RPC), the vanity
  prefix/suffix (commit `2486d790c`), and the wallet chip. Fund / withdraw / view-on-explorer flows,
  all real. The private key stays server-side (custodial) — never expose it; reuse the existing
  encryption + CSRF patterns exactly.
- Designed states: unfunded (clear funding CTA + risk copy), low balance, pending tx, failed tx
  (actionable recovery), empty holdings.

### 2. Trading Brain — visual sniping/trading rules (the centerpiece)
- A **visual rule builder** where the user composes trading behavior as connected blocks: triggers
  (new launch matches filter, price crosses level, liquidity/holder thresholds, watchlist event),
  conditions (risk caps, max position, cooldowns, rug checks), and actions (snipe/buy/sell/ladder/
  take-profit/stop). This pairs with P1's Brain graph: the **brain reasons, this executes.** Define and
  honor the node/execution interface P1 specified; the agent can ask its LLM brain to approve/scale an
  action before firing.
- Two modes, both first-class: **assisted** (agent proposes, user one-taps to confirm) and
  **autonomous** (agent executes within hard, user-set guardrails — caps, allowlists, kill switch).
  Autonomy must be explicit, revocable, and auditable. Default to assisted.
- **Real execution only:** route through the real Solana stack already in the repo (RPC, pump.fun,
  the coin/treasury/distribution libs). Real quotes, real slippage, real signatures, real
  confirmations. No simulated fills, no fake P&L, no paper-trading dressed up as real.
- Every action writes a **trade memory** (coordinate with P2: `add()` the trade, outcome, and lesson)
  and emits a market/trade event through `studio.emitMarket(...)` so the avatar reacts live and P5's
  site-wide presence shows it.

### 3. Safety, trust, and honesty (non-negotiable for money)
- Hard guardrails enforced **server-side**, not just UI: max spend per tx/day, allowlist/denylist,
  mandatory rug/honeypot checks before buys, cooldowns, and a global kill switch that halts the agent
  instantly. Never let a config error spend funds — fail safe.
- Full audit log of every decision + execution, exportable. Clear, non-hyperbolic risk disclosures.
  Never imply guaranteed returns.

## The coin rule (read carefully)
**$THREE (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the only coin three.ws promotes.** The
trading engine is generic, coin-agnostic plumbing operating on **runtime-supplied mints** the user
chooses or that come from launch records — that is the allowed mechanical exception. Do **not**
hardcode, name, market, seed fixtures with, or recommend any specific non-$THREE mint anywhere in
source, copy, tests, or commit messages. Synthetic placeholders only in any test
(e.g. `THREEsynthetic1111…`); never a real mainnet mint.

## Definition of done
- Money panel shows real on-chain wallet state; fund/withdraw/explorer all real and safe.
- Visual rule builder composes real triggers/conditions/actions; assisted + autonomous both work with
  enforced server-side guardrails and a working kill switch.
- Executions are real (real signatures/confirmations), write trade memories (P2), and drive live
  avatar reactions via `studio.emitMarket` (P5).
- Audit log complete and exportable. All states designed. No fake fills/P&L anywhere.
- No console errors; `npm test` passes; network tab shows real RPC/pump.fun/coin calls. Changelog entry added.

## Operating rules (override defaults)
No mocks/stubs/TODOs/simulated fills/fake P&L/sample arrays. $THREE is the only coin promoted; engine
uses runtime mints only — never paste a real third-party mint. Custodial key never leaves the server.
Design tokens only. Stage explicit paths (never `git add -A`); re-check `git diff --staged` before
commit. Own `src/studio/money/**`, `api/trading/**`, extensions to `api/coin/**` and
`api/_lib/agent-wallet.js`. Coordinate trade memories with P2, the execution interface with P1, and
events with P5 via the `studio` contract.

## When finished
Self-review (CLAUDE.md's five checks). Then push the edge — e.g. a "rule backtest against real
historical launches" preview (clearly labeled as historical, never presented as a guarantee), a
shareable trade card the avatar "presents" on a win, or trophy unlock signals for P3. Build it. Then
**delete this prompt file** (`prompts/agent-studio/05-wallet-trading-brain.md`) and report what you
shipped + the guardrail config shape and the market-event types P5 should handle.
