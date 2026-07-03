# Task 09 — Platform Agents as Real Buyers + On-Chain Deployments in the Loop

## Mission

The owner's vision is an agent-to-agent economy, not a cron paying itself:
autonomous agents and on-chain deployments should be the ones generating the
tips, purchases, and service calls. Wire the platform's existing autonomous
agents to be genuine x402 buyers inside the ring (their spend funded from and
returning to controlled wallets), and make the platform's on-chain programs
part of the visible economic activity — so the ring's volume is real agents
doing real work, every minute.

## Context you must know

- Buyer-side clients already exist: `api/_lib/x402/pay.js` (`payX402`),
  `api/_lib/x402-buyer-fetch.js`, `api/_lib/x402-buyer-axios.js`,
  `packages/x402-mcp/src/lib/x402-buyer.js` + `tools/pay-and-call.js`.
- Existing autonomous actors to enlist (read each before wiring):
  - **Endpoint shopper** — `api/agents/endpoint-shopper-run.js` (itself a paid
    endpoint): an agent that shops endpoints. Natural ring citizen.
  - **Agora citizens** — `workers/agora-citizens/` + `api/agora/[action].js`:
    agents that post/claim/work/earn (devnet AgenC). They have wallets and
    action loops already.
  - **Live-feed seeder** — registry entry `live-feed-seeder`
    (`autonomous-registry.js:2699-2711`).
  - **Agent identities with custodial Solana wallets** —
    `api/_lib/agent-wallet.js` (`ensureAgentWallet`,
    `recoverSolanaAgentKeypair`) with spend limits enforced by
    `api/_lib/agent-trade-guards.js` (`enforceSpendLimit`, custody events).
- On-chain programs in the tree: skill licenses
  (`contracts/skill-license/` + `api/_lib/skill-license-onchain.js` →
  1/1 SPL NFT + PDA per purchased skill), agent invocation events
  (`contracts/agent-invocation/` + `agent-protocol-sdk/`), AgenC task
  marketplace (`packages/agenc-mcp/`, `api/agenc/`).
- Money rule: every buyer wallet in this task is platform-controlled (agent
  custodial wallets ARE platform-controlled — encrypted secrets in
  `agent_identities.meta`, `WALLET_ENCRYPTION_KEY`). Their USDC comes from the
  ring treasury and their revenue flows back to it. Task 06's
  `ringAllowedAddresses()` must include any wallet you enlist.

## Tasks

1. **Agent-buyer roster.** Pick 3–6 existing platform agents (real
   `agent_identities` rows with custodial Solana wallets — create them via the
   normal `ensureAgentWallet` path if none are suitable). For each, define a
   persona-consistent buying behavior over the task-08 catalog: the shopper
   buys intel + health checks; an agora citizen tips dancers and pays club
   cover after completing work; a curator agent buys skill-marketplace
   listings + billboards. Encode these as small behavior modules under
   `api/_lib/x402/agents/` (one file per persona) that the ring tick (task 04)
   can invoke as alternative buyers — the payment still goes through `payX402`
   with the agent's keypair, spend-limit-checked via `enforceSpendLimit`, and
   custody-logged.
2. **Fund + recycle agent floats.** Extend `ring-rebalance` semantics (without
   touching its treasury→payer core): a `float-top-up` step that keeps each
   roster agent's USDC between floor and ceiling (env
   `X402_RING_AGENT_FLOAT_ATOMIC`, default $2) from the treasury, and sweeps
   overflow back. Every movement logged to `x402_ring_ledger` (kind `fund`).
   All counterparties must pass `ringAllowedAddresses()`.
3. **Revenue flows back.** Where a bought service pays out to a seller (tips to
   a dancer agent, marketplace sale proceeds), confirm the seller wallet is
   also platform-controlled and its earnings are visible in the ledger — the
   loop stays closed through the *business* layer, not just the settlement
   layer. Document each flow's path in the module docstring.
4. **On-chain deployments in the loop.** Wire ONE real on-chain program
   interaction into the rotation at low cadence (e.g. hourly): an agent
   purchasing a skill license mints the real license NFT
   (`skill-license-onchain.js`), or an AgenC/agora task completion emits its
   real on-chain event (devnet per existing config). Fee payer must be a ring
   wallet; frequency and rent bounded (`X402_RING_ONCHAIN_EVERY_N_TICKS`,
   default 60; skip cleanly if program env is absent). This is the
   "on-chain deployments being utilized" requirement — real program calls,
   visibly logged, not simulated.
5. **Attribution surface.** Agent-driven purchases must be attributable:
   include `agent_id` in the `x402_autonomous_log` rows (column exists or add
   via migration) so the dashboard (task 10) can show *which agent* bought
   *what* — that's what makes it an agent economy on the surface, not a cron.
6. **Tests.** Persona behavior selection (deterministic given a tick seed),
   float top-up bounds, allowlist enforcement on every new counterparty,
   spend-limit integration (over-limit agent purchase is refused by
   `enforceSpendLimit` and logged, not thrown through the tick).
7. **Docs + changelog.** New `docs/x402-ring-economy.md` section "Agents in the
   ring": roster, personas, float mechanics, on-chain cadence. Changelog entry
   (tags: `feature`) — holders should read "platform agents now buy and sell
   services from each other on-chain, continuously".

## Files you own

`api/_lib/x402/agents/` (new), `ring-rebalance.js` float step (coordinate: task
04 owns its cadence consts), migration for `agent_id` attribution if needed,
tests, `docs/x402-ring-economy.md`, `data/changelog.json`.

## Constraints

- Every wallet added to the flow is platform-controlled and registered in
  `ringAllowedAddresses()` — verify with task 03's verify script extended to
  list roster agents.
- Agent spend limits (`agent-trade-guards.js`) are enforced on every agent
  purchase — no bypass because "it's internal".
- On-chain program calls follow the programs' existing network config (devnet
  where that's what's deployed) — no new mainnet program deploys in this task.
- No $THREE or third-party-coin purchases here — USDC service payments only
  (the commit gate in CLAUDE.md applies to anything else).
- Personas are labeled internal in logs — never presented as organic users.

## Acceptance criteria

- [ ] ≥3 agent personas actively buying in a 10-tick local run — show
      `x402_autonomous_log` rows with distinct `agent_id`s and settle sigs.
- [ ] Floats topped up and swept within bounds across the run (ledger rows).
- [ ] One real on-chain program interaction landed and linked (signature +
      explorer link, devnet acceptable).
- [ ] Over-limit purchase refused via `enforceSpendLimit` (test).
- [ ] All new counterparties pass the leak scanner (task 06) clean.
- [ ] `npm test` green; docs + changelog landed.
