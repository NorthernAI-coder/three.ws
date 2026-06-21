# P59 · Deploy AgentPayments across EVM chains

> **Workstream:** On-chain & contracts · **Priority:** P0 · **Effort:** L · **Depends on:** none

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (on-chain section).
2. three.ws monorepo: EVM contracts via Foundry in `contracts/`; Solana programs via Anchor in `contracts/agent-invocation/` and `contracts/skill-license/`. EVM SDK addresses live in `agent-payments-sdk/src/evm/`. ERC-8004 deploy metadata in `contracts/` + `api/_lib/erc8004-chains.js`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never reference any other coin/token.

## Context
`contracts/src/AgentPayments.sol` (406 lines) is the EVM port of the Solana `pump_agent_payments` program. It is the on-chain engine behind three.ws **agent tokens**: a payer pays an agent in any ERC-20 (or native via the EIP-7528 sentinel `0xEeee…EEeE`), `distributePayments` splits the vault by `buybackBps`, the agent authority `withdraw`s its share, and `buybackTrigger` (owner-only) swaps the buyback slice into the agent token via an allow-listed router and burns it to `0x…dEaD`.

State so far:
- **Tested, not deployed.** `contracts/test/AgentPayments.t.sol` — 16 tests, all passing (`forge test --match-contract AgentPaymentsTest`). Foundry profile in `contracts/foundry.toml`: solc `0.8.24`, optimizer 200 runs, `via_ir = false`.
- **Deploy script ready:** `contracts/script/DeployAgentPayments.s.sol:DeployAgentPayments` — `new AgentPayments(owner)` where `owner = vm.envOr("AGENT_PAYMENTS_OWNER", msg.sender)`. Owner is the protocol/global buyback authority — must be the platform multisig in production, never a hot EOA.
- **CREATE2 deployer exists:** `ThreeWSFactory` at `0x00000000d49195ae81759cd247cfedd9d0b479df` (verified on Base/BSC/Arbitrum, bytecode SHA-256 `424e78aad2b19a37…`). Because `AgentPayments`'s constructor takes only `owner` (no chain-specific immutable), a CREATE2 deploy with a shared salt yields the **same** address on every chain — unlike `ThreeWSPayments`, whose per-chain USDC immutable broke address parity (`contracts/DEPLOYMENTS.md`).
- **SDK is waiting:** `agent-payments-sdk/src/evm/addresses.ts` defines `EVM_CHAINS` for chain IDs `1, 8453, 42161, 137, 56, 43114` with every `agentPayments` set to `UNDEPLOYED` (= `ZERO_ADDRESS`). `isAgentPaymentsDeployed(chainId)` returns `false` everywhere, and `new EvmAgent(token, chainId)` throws `"AgentPayments contract is not deployed on chain N"` at construction.
- Full guide already written: `contracts/AGENT_PAYMENTS.md`. Deployment ledger: the **AgentPayments** table in `contracts/DEPLOYMENTS.md` (all rows `TODO`).

## Problem / opportunity
The entire EVM agent-token path is dark. The SDK client (`EvmAgent`, `EvmAgentOffline`, `AGENT_PAYMENTS_ABI`) ships, but every call throws because no contract exists on-chain. Deploying once per chain, bytecode-verifying, allow-listing the buyback router, and filling six addresses into the SDK flips EVM agent payments live across Base, Arbitrum, BSC, Polygon, Ethereum, and Avalanche.

## Mission
Deploy `AgentPayments` to all six SDK-supported EVM chains (testnet first, then mainnet), bytecode-verify each, allow-list the canonical swap router per chain, wire every address into the SDK, record each deployment, and announce it in the changelog.

## Scope
**In scope:** Testnet dry-run (Base Sepolia + at least one other testnet); mainnet deploys to chains 1/8453/42161/137/56/43114; explorer bytecode verification; `setRouterAllowed` per chain; updating `agent-payments-sdk/src/evm/addresses.ts` + SDK rebuild; filling the `contracts/DEPLOYMENTS.md` AgentPayments table; changelog entry.

**Out of scope:** Any Solana-side work (the Solana path binds to pump.fun's live `AgenTMiC2…` — no deploy needed). Changing the contract logic. ERC-8004 registry redeploys.

## Implementation guide
1. **Decide on CREATE2 vs. plain `new`.** Prefer CREATE2 via `ThreeWSFactory` for one identical address on all six chains — operationally cleaner and matches the existing factory pattern. Compute the init code as `type(AgentPayments).creationCode` ABI-encoded with the `owner` constructor arg; grind/choose a salt and call `factory.predict(salt, initCodeHash)` to confirm the cross-chain address before broadcasting. If you instead use plain `new` (script as-is), addresses will differ per chain (nonce-dependent) — that is acceptable, just record each.
2. **Install + sanity check.**
   ```bash
   curl -L https://foundry.paradigm.xyz | bash && foundryup
   cd contracts && cp .env.example .env
   # Fill DEPLOYER_PK (gas EOA), AGENT_PAYMENTS_OWNER (platform multisig),
   # BASESCAN_API_KEY / per-chain scan keys, and RPC URLs.
   forge test --match-contract AgentPaymentsTest   # expect 16 passing
   ```
3. **Testnet dry-run first** (never mainnet before testnet — Guardrails):
   ```bash
   source .env
   forge script script/DeployAgentPayments.s.sol:DeployAgentPayments \
     --rpc-url $BASE_SEPOLIA_RPC_URL --private-key $DEPLOYER_PK --broadcast --verify
   ```
   Note: `foundry.toml` only declares `base_sepolia` / `base` rpc endpoints + etherscan keys. Add `[rpc_endpoints]` and `[etherscan]` entries for arbitrum, polygon, bsc, ethereum, avalanche before mainnet, or pass `--rpc-url`/`--verifier-url`/`--etherscan-api-key` inline.
4. **Mainnet, one per chain** (swap `--rpc-url`):

   | Chain | Chain ID | USDC (from `addresses.ts`) | Canonical router to allow-list |
   | --- | --- | --- | --- |
   | Base | 8453 | `0x8335…02913` | chain's 0x Exchange Proxy / Uniswap Universal Router |
   | Arbitrum One | 42161 | `0xaf88…5831` | same family |
   | Polygon | 137 | `0x3c49…3359` | same family |
   | BNB Smart Chain | 56 | `0x8AC7…580d` | same family |
   | Ethereum | 1 | `0xA0b8…eB48` | same family |
   | Avalanche | 43114 | `0xB97E…8a6E` | same family |

   ```bash
   forge script script/DeployAgentPayments.s.sol:DeployAgentPayments \
     --rpc-url $BASE_RPC_URL --private-key $DEPLOYER_PK --broadcast --verify
   ```
5. **Allow-list the buyback router per chain.** Buybacks revert with `RouterNotAllowed` until set; the contract also forbids the currency/agent token as the "router" (closes the only path to abuse payer `maxUint256` allowances). Use the **real canonical** DEX router for each chain — never a synthetic address here (it is a live mainnet integration), but never market any non-$THREE mint.
   ```bash
   cast send <AGENT_PAYMENTS_ADDR> "setRouterAllowed(address,bool)" <ROUTER> true \
     --rpc-url $BASE_RPC_URL --private-key $DEPLOYER_PK
   ```
6. **Wire the SDK.** In `agent-payments-sdk/src/evm/addresses.ts`, replace `UNDEPLOYED` with the deployed address for each of the six chains, then:
   ```bash
   cd agent-payments-sdk && npm run build
   ```
   Confirm `isAgentPaymentsDeployed(8453) === true` and `new EvmAgent(token, 8453)` no longer throws.
7. **Record + announce.** Fill the AgentPayments table in `contracts/DEPLOYMENTS.md` (address, chain ID, owner, routers allow-listed, tx hash) per chain. Append a `data/changelog.json` entry (tags: `infra`, `sdk`) — holder-readable: EVM agent payments are live across six chains — then `npm run build:pages`.

## Definition of done
- [ ] Contract tests pass (`forge test` / `anchor test`); changes documented.
- [ ] Deployed addresses recorded + bytecode-verified where applicable; SDK address files updated.
- [ ] User-visible/holder-relevant → `data/changelog.json` entry + `npm run build:pages`.
- [ ] `git diff` self-reviewed.

## Verification
- `forge test --match-contract AgentPaymentsTest` — 16 passing.
- Per chain: `cast code <ADDR> --rpc-url <RPC>` returns non-empty runtime bytecode; explorer shows "Contract Source Code Verified".
- On-chain read: `cast call <ADDR> "allowedRouters(address)(bool)" <ROUTER>` → `true`; `cast call <ADDR> "owner()(address)"` → the multisig.
- SDK roundtrip: in `agent-payments-sdk`, construct `new EvmAgent(<$THREE-or-synthetic-token>, 8453)` and call a read (`getAgentConfig`) against the live contract — it must return without throwing the "not deployed" error.
- After all six rows are filled, confirm no `UNDEPLOYED` remains in `addresses.ts` and `dist/` rebuilt.

## Guardrails
- No mocks. Real testnet first, then mainnet. Never paste a real third-party mint/creator/holder address; use $THREE CA or a synthetic placeholder.
- Never commit private keys/secrets. Stage explicit paths; re-check `git status`. Push only when asked, to BOTH remotes.
- Treat upgrade authority and minter keys as secrets; document rotation. `AGENT_PAYMENTS_OWNER` must be the platform multisig, not the deployer EOA — record which address owns each deployment.
