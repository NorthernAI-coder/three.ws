# On-Chain Deployment Completion Plan

Goal: make the three.ws on-chain layer for 3D AI Agents **complete, correct, and
production-professional** — every contract deployed, every address verified,
every registration flow wired end-to-end, and a smoke harness that proves it.

This is the index. Each task below is a self-contained `.md` brief that an agent
can execute independently. They are ordered by dependency; the **Wave** column
shows what can run in parallel.

## Current state (verified 2026-06-14)

Solid:
- ERC-8004 contracts (`contracts/src/{Identity,Reputation,Validation}Registry.sol`),
  25 passing Foundry tests.
- IdentityRegistry + ReputationRegistry deployed deterministically (CREATE2) on
  15 mainnet + 7 testnet chains.
- Pump.fun launch / trade / agent-payments fully built (`api/pump/`, `agent-payments-sdk/`).
- x402 rails live on Solana + Base (`api/x402/`, `api/_lib/x402-*.js`).
- SNS `*.threews.sol` subdomain minting (`src/solana/sns-subdomain.js`).
- Specs published: avatar schema v1, agent-manifest v0.2, 3D Agent Card v1.

Gaps (what these tasks close):
1. Mainnet ValidationRegistry never deployed → mainnet `recordValidation()` throws.
2. ThreeWSPayments on Base mined-but-no-bytecode → treat as not deployed.
3. Solana `agent_invocation` program uses a placeholder ID, never deployed.
4. three.ws self-registration record is empty.
5. DEPLOYMENTS.md tx-hash provenance is all `TODO`; no address-parity guard.
6. No "bind an existing agent to an on-chain identity" product flow.
7. ValidationRegistry attestation not auto-wired into registration.
8. ReputationRegistry data never surfaced in the UI.
9. Solana relayer/buyback/distribution signers unfunded; devnet smoke unrun.
10. No end-to-end on-chain smoke harness.

## Task list

| # | Task | Wave | Blocks |
|---|------|------|--------|
| 01 | Deploy mainnet ValidationRegistry (15 chains) + wire addresses | 1 | 06, 07 |
| 02 | Re-deploy ThreeWSPayments on Base + verify bytecode | 1 | 10 |
| 03 | Deploy Solana `agent_invocation` program + replace placeholder ID | 1 | 10 |
| 04 | Register three.ws itself (ERC-8004) + fill `.well-known` record | 2 | — |
| 05 | Backfill DEPLOYMENTS.md provenance + address-parity guard script | 1 | — |
| 06 | "Bind existing agent → on-chain" flow + auto-populate manifest | 2 | 10 |
| 07 | Wire ValidationRegistry attestation into registration + allowlist | 2 | — |
| 08 | Surface ReputationRegistry in agent profiles + `/agents` directory | 2 | — |
| 09 | Fund Solana relayers, verify buyback/distribution crons + devnet smoke | 1 | 10 |
| 10 | On-chain end-to-end smoke harness (CI-runnable) | 3 | — |

## Definition of done (whole plan)

- No client code path throws "no registry deployed" on any supported mainnet chain.
- Every address in `src/erc8004/abi.js`, `sdk/src/erc8004/abi.js`, and
  `api/_lib/erc8004-chains.js` is identical and matches an on-chain contract with code.
- DEPLOYMENTS.md has a real explorer tx link for every deployed contract.
- A user can create an agent, bind it on-chain, and see it resolve, validate, and
  carry reputation — all from the product UI, no manual scripts.
- `node scripts/onchain-smoke.mjs` (task 10) passes against testnet/devnet in CI.

## Hard rules (inherited from CLAUDE.md)

- The only coin is `$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never
  reference any other mint in code, fixtures, or docs. Use synthetic placeholders.
- No mocks, no stubs, no `throw new Error("not implemented")`. Real RPC, real APIs.
- Stage explicit paths before committing (concurrent agents share this worktree).
- `npx vercel build` clobbers `api/*.js` — never commit esbuild bundles.
