# 03 — Gas-free ERC-8004 agent registration on BSC

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 02** (`api/_lib/bnb/megafuel.js`), which needs 01. Run them first if missing.

## Why
ERC-8004 identity registry is ALREADY live on BSC(56) at our CREATE2 address
(`contracts/DEPLOYMENTS.md`, `src/erc8004/abi.js`). Right now a new agent needs BNB for gas
to register. Make **registration gasless** via MegaFuel — a brand-new empty wallet mints its
agent identity from the first click. This is the single most demo-able "only on BNB Chain"
flow: zero-balance wallet → on-chain identity, no faucet, no funding. (bnb-chain's own
`bnbagent-sdk` does exactly this — we're matching it natively in our stack.)

## Build — `api/bnb/register-agent.js` (server endpoint) + wire to existing identity UI
- Free plain-handler endpoint (00-CONTEXT free pattern). `POST` body: `{ signedRegisterTx }`
  OR `{ agentMeta, accountAddress }` depending on where signing happens — prefer the client
  signs (never take a raw private key server-side), server relays via `sendGasless`.
- Flow: accept the user's signed ERC-8004 `register` tx (gasPrice 0), call
  `megafuel.sendGasless('bscTestnet', ...)`, return `{ hash, mode, agentId?, explorerUrl }`.
  Reuse the ERC-8004 ABI from `src/erc8004/abi.js` — do NOT redefine it.
- On sponsorship decline, self-pay path still completes (prompt 02 guarantees it) — surface
  `mode` so the UI can say "sponsored" vs "you paid gas".
- Wire a "Register on BNB (gasless)" affordance into the existing ERC-8004 identity surface
  (find it: grep `erc8004` under `src/` and `pages/`; add the button where identity is
  created, network-selectable to BSC testnet). Show the resulting agentId + BscScan link.

## States
Empty wallet, no BNB → sponsored path mints anyway (the whole point; prove it). Sponsorship
unavailable → clear "you'll pay ~$0.001 gas" prompt, then self-pay. Already-registered
address → surface existing agentId, don't double-mint. Tx revert → decode + show reason.

## Tests (`tests/bnb-register-agent.test.js`)
- Endpoint relays a signed tx through `sendGasless` (mocked) and returns the hash + mode.
- Rejects a request missing the signed tx / address with 400.
- Parses `agentId` from a mocked `Transfer`/`Registered` receipt log.
- Uses synthetic addresses only.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] REAL testnet proof: register an agent from a freshly-created wallet; paste the tx hash, the minted `agentId`, and the BscScan link. If sponsored, note `gasPrice 0` and that the wallet held 0 tBNB before the tx — that screenshot is the campaign's headline.
- [ ] `docs/`: add a "Gasless agent registration on BNB" section to the ERC-8004 / identity doc (find the existing one under `docs/`), with the named use-case and a runnable example.
- [ ] `data/changelog.json`: entry (tags `feature`, `sdk`) — "Register your agent identity on BNB Chain with zero gas".
