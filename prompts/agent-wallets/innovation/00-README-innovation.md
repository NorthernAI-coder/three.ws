# Agent Wallets — the Innovation Program

> This is **not** the baseline coverage program (that's `../00-README-orchestration.md`
> + tasks `01–06`, which put the wallet chip/HUD/vanity/trade/fork on every surface).
> Assume that baseline has shipped or is shipping. **Do not rebuild it. Build ON it.**
>
> This program exists to make three.ws agent wallets something **no other platform
> has** — features users screenshot, share, and switch platforms for. Each task below
> invents one. Pick a task, own it end to end, ship it for real, then improve it, then
> delete the task file.

---

## The thesis

Every wallet product on earth shows a balance and a send button. That is table
stakes and we already have it. The opportunity nobody has captured: **an AI agent
has its own self-custodied wallet, its own 3D body, its own on-chain identity, its
own lineage of forks, and it earns money autonomously.** That combination unlocks
an economy of *living, self-governing, social money* that a human-centric wallet
literally cannot express.

We are going to build that economy. The north star for every task: a stranger sees
it, says *"wait, agents can do THAT with money?"*, and shares it.

## What you are building on (read this — it's all real, all wired)

**Agent identity & wallet core**
- `api/_lib/agent-wallet.js` — `ensureAgentWallet`, `getOrCreateAgentSolanaWallet`,
  `recoverSolanaAgentKeypair` (audited key access), `delegatedSpend`,
  `triggerSkillPayment`, `getSolanaAddressBalances`, `provisionAgentWallets`.
- `api/_lib/agent-trade-guards.js` — `enforceSpendLimit`, `getSpendLimits`/`setSpendLimits`,
  `recordCustodyEvent`, `getDailySpendUsd`. **Every fund-moving path must go through these.**
- Agent record: `GET /api/agents/:id` → `{ is_owner, solana_address, wallet_ready, meta, payments }`
  (secrets stripped server-side; `meta` is the jsonb source of truth).

**Money rails (all live on Solana mainnet — never mock)**
- Public balance: `GET /api/agents/:id/solana` · activity: `…/solana/activity` ·
  holdings: `…/solana/holdings` · custody ledger: `…/solana/custody` ·
  spend limits: `…/solana/limits`.
- Vanity grind + money-safe sweep: `GET|POST /api/agents/:id/solana/vanity`
  (`handleVanity` + `sweepWalletToAddress` in `api/agents/solana-wallet.js`).
- Withdraw/sweep: `POST /api/agents/:id/solana/withdraw`.
- Discretionary trade: `…/solana/trade`, `…/solana/trade-history` (`api/agents/solana-trade.js`).
- Viewer-signed, non-custodial tip/pay: `src/shared/agent-tip.js` (SOL + USDC),
  modal `src/shared/agent-tip-modal.js`.
- x402 (agent pays / gets paid): `api/agent-wallet-bridge.js` (status/quote/pay SSE),
  `api/agents/x402/[action].js`, `api/_lib/x402.js`, `api/_lib/x402-spec.js`,
  `api/_lib/x402-spending-cap.js`. Settlement asset is USDC; **the only coin we
  promote is `$THREE`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).

**Identity, lineage, social**
- Agent fork (one agent, one owner, fresh wallet, lineage): `POST /api/marketplace/agents/:id/fork`
  (`handleFork`, `fork_of` + `forks_count` columns). Avatar fork: `POST /api/avatars/fork`.
- Vanity: browser grinder `src/solana/vanity/grinder.js` (`grindVanity`, WASM),
  server grinder `grinder-node.js`, brand mark `brand.js` (`3ws`), plus the in-flight
  `mnemonic-grinder.js` / `sealed-envelope.js`.
- On-chain identity: ERC-8004 (`src/erc8004/*`, `contracts/`), reputation
  (`src/reputation-ui.js`, `…/reputation`).

**Surfaces & presentation**
- Shared chip: `src/shared/agent-wallet-chip.js` (`walletChipHTML`, `walletChipEl`,
  `wireWalletChips`, `getWalletStatus`). Rich affordance: `src/agent-wallet/affordance.js`.
- Wallet hub: `src/agent-wallet-hub/` (tabbed). 3D: `avatar-sdk/`, `src/viewer.js`,
  `<model-viewer>`. IRL/AR: `src/irl.js`, `src/irl/*`, `src/ar/webxr.js`.
- OG share images: `/api/og/agent?id=`. RPC: same-origin Helius proxy
  (`SOLANA_RPC` in `src/erc8004/solana-deploy.js`; `solanaConnection`/`solanaPublicConnection`
  in `api/_lib/agent-pumpfun.js`).

**Data**
- Tables (real, in `api/_lib/schema.sql` + `api/_lib/migrations/`): `agent_identities`,
  `agent_payment_intents`, `agent_revenue_events`, `agent_payout_wallets`,
  `agent_withdrawals`, `agent_custody_events`, `agent_skill_prices`, `x402_receipts`.
  Add new tables as **additive idempotent migrations** (`alter table … add column if not
  exists`, `create table if not exists`) in `api/_lib/migrations/` and mirror in `schema.sql`.

## The tasks

| # | Feature | One-line |
|---|---|---|
| 01 | **Treasury Autopilot** | Owner-authored rules the agent runs on its OWN wallet autonomously. |
| 02 | **Lineage Royalties** | Forks stream a creator-set share of earnings up the family tree. |
| 03 | **Vanity Constellation** | Community grind-pools + sealed-envelope vanity gifting + rarity. |
| 04 | **Living Wallet Aura** | Wallet state drives the agent's 3D/AR body, everywhere, live. |
| 05 | **Programmable Paywalls** | Inline x402 tip-to-unlock + persistent supporter badges. |
| 06 | **Economy Passport** | A shareable, on-chain-verifiable earnings+trust+lineage card. |
| 07 | **A2A Commerce Exchange** | Agents autonomously hire & pay agents, visualized live. |
| 08 | **Harmonize & Verify** | Run LAST: make all seven feel like one product; prove it live. |

Tasks 01–07 are independent — run as many agents in parallel as you want. 08 runs last.

## Operating rules (non-negotiable — these OVERRIDE any instinct to cut a corner)

1. **Invent, don't imitate.** If the feature looks like something a normal wallet
   already has, you've aimed too low. Re-read the task's "screenshot moment" and raise
   the bar. Think second-order: what does this unlock elsewhere? Wire that too.
2. **100% wired, real APIs, real chain, real money paths.** No mocks, no fake data, no
   sample arrays, no `setTimeout` fake progress, no TODOs, no stubs, no
   `throw new Error('not implemented')`. Every number traces to a real call you can see
   in the Network tab. Funds move only through the custody guards above.
3. **Every state designed** — loading (skeletons), empty (tells the user what to do),
   error (actionable + recoverable), populated, overflow. Microinteractions, hover/active/
   focus, reduced-motion, keyboard, ARIA, responsive at 320/768/1440.
4. **Ownership is server truth.** Owner vs visitor vs logged-out gating is enforced on
   the server (`user_id === auth.userId`) AND owner-only controls are absent from the
   DOM for non-owners. Never client-only gate anything that moves funds. One agent, one
   owner — to brand/spend someone else's agent you must fork it first.
5. **`$THREE` is the only coin.** Never name, hardcode, or recommend any other token in
   code, copy, tests, or fixtures. USDC/SOL are payment rails, not coins we promote.
6. **Shared worktree — other agents are editing live.** Stage explicit paths only (never
   `git add -A`/`git add .`). Re-run `git status` + `git diff --staged` right before
   committing. Reuse the shared components above; if you'd duplicate one, extend it
   instead. Push to **both** remotes (`threeD`, `threews`) only when asked.
7. **Changelog.** Every user-visible change gets a real, holder-readable entry in
   `data/changelog.json`; run `npm run build:pages` to validate. (Do NOT run
   `npm install` — the environment forbids it.)

## Definition of done (per task)

- [ ] Feature is invented to a gamechanging bar, fully built, reachable from the real UI.
- [ ] Reuses the shared wallet components/endpoints; no duplicated wallet logic.
- [ ] No mocks/fake data/TODOs/stubs/other-coin refs anywhere in your diff.
- [ ] Every state designed; a11y + responsive + reduced-motion covered.
- [ ] Server enforces ownership/limits; fund moves audited via `recordCustodyEvent`.
- [ ] Browser-verified (`npm run dev`) as owner, visitor, and logged-out: zero console
      errors/warnings from your code; real API calls captured succeeding.
- [ ] `npm test` green; tests added for new helpers/endpoints/invariants.
- [ ] Real changelog entry; `npm run build:pages` passes.
- [ ] **Then improve it.** Step back and ask: *"what would make a senior engineer say
      'I didn't know I needed this'?"* Build that one thing. Re-verify.
- [ ] Write a short summary of what shipped + the verified end-to-end flow.
- [ ] **Delete your task file.** When 01–08 are all deleted, delete this README too.
