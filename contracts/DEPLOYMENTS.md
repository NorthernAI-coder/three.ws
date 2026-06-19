# ERC-8004 Contract Deployments

All three registries are deployed via CREATE2, giving the same address on every
supported EVM chain within each environment class (mainnet vs. testnet).

## Provenance

Deployment transaction hashes from the original CREATE2 broadcast were not
captured per chain at deploy time. Rather than leave the record as bare `TODO`s,
each live contract is **verified by on-chain bytecode**: `scripts/verify-onchain-parity.mjs`
performs an `eth_getCode` sweep against the public RPCs in `api/_lib/erc8004-chains.js`
and asserts non-empty runtime code at every declared address. The
`bytecode ✓ (YYYY-MM-DD)` notes below are the dates of those reads. Re-run any
time with:

```
VERIFY_ONCHAIN_CHAINS=all npm run verify:onchain   # full sweep
npm run verify:onchain                              # build-gate subset (Base + Base Sepolia)
```

The IdentityRegistry + ReputationRegistry share one address per network class
(CREATE2-deterministic). A single explorer link below resolves to the contract
on any listed chain; the per-chain bytecode-verified status is the authoritative
liveness signal.

## Mainnet

Chains with confirmed bytecode (verified 2026-06-19): Ethereum (1), Optimism (10),
BSC (56), Gnosis (100), Polygon (137), Mantle (5000), Base (8453),
Arbitrum One (42161), Celo (42220), Avalanche (43114), Linea (59144), Scroll (534352).

> **Not yet deployed on Fantom (250), zkSync Era (324), Moonbeam (1284).** An
> `eth_getCode` sweep on 2026-06-19 returned `0x` (no code) at the registry
> addresses on these three chains across multiple independent RPCs. zkSync Era
> derives CREATE2 addresses differently from the EVM, so the canonical address is
> not reachable there without a chain-specific deploy. Registration / reputation
> writes on these chains will revert until the registries are deployed (deploy
> backlog). The address columns are kept for parity; liveness is per the bytecode
> notes only.

| Contract             | Address                                      | Provenance              |
| -------------------- | -------------------------------------------- | ----------------------- |
| IdentityRegistry     | [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) | bytecode ✓ (2026-06-19) on 12 chains; tx unrecoverable |
| ReputationRegistry   | [`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`](https://basescan.org/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63) | bytecode ✓ (2026-06-19) on 12 chains; tx unrecoverable |
| ValidationRegistry   | not deployed on mainnet                      | pending mainnet deploy (`src/erc8004/abi.js` MAINNET.validationRegistry = '') |

## Testnet

Chains (all bytecode-verified 2026-06-19): BSC Testnet (97), Ethereum Sepolia (11155111),
Base Sepolia (84532), Arbitrum Sepolia (421614), Optimism Sepolia (11155420),
Polygon Amoy (80002), Avalanche Fuji (43113).

| Contract             | Address                                      | Provenance              |
| -------------------- | -------------------------------------------- | ----------------------- |
| IdentityRegistry     | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) | bytecode ✓ (2026-06-19) on 7 testnets; tx unrecoverable |
| ReputationRegistry   | [`0x8004B663056A597Dffe9eCcC1965A193B7388713`](https://sepolia.basescan.org/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) | bytecode ✓ (2026-06-19) on 7 testnets; tx unrecoverable |
| ValidationRegistry   | [`0x8004Cb1BF31DAf7788923b405b754f57acEB4272`](https://sepolia.basescan.org/address/0x8004Cb1BF31DAf7788923b405b754f57acEB4272) | bytecode ✓ (2026-06-19) on 7 testnets; tx unrecoverable |

## Platform validator (ValidationRegistry attestor)

The platform validator is the EVM key that signs glTF/schema validation
attestations (`recordValidation`) when an agent is registered. It must be
allow-listed via `addValidator(<addr>)` by the registry owner on every chain it
attests on, funded with gas, and stored as the `VALIDATOR_PRIVATE_KEY` secret in
Vercel (never committed). Provision/rotate with
[`scripts/erc8004/provision-validator-key.mjs`](../scripts/erc8004/provision-validator-key.mjs).

| Address | Allow-listed chains | Notes |
| ------- | ------------------- | ----- |
| `0x93Bc7EfB0059B784465619FC73C2db8D01b1CD04` | TODO: run `addValidator` per chain | Provisioned 2026-06-15. Pending funding + allow-list (testnet first: Base Sepolia 84532). |

## CREATE2 Factory (ThreeWSFactory)

Custom vanity-prefixed CREATE2 deployer used to obtain matching addresses across chains.

| Chain            | Address                                      | Deployer EOA             | Deployed   | Tx |
| ---------------- | -------------------------------------------- | ------------------------ | ---------- | -- |
| BSC (56)         | `0x00000000D49195AE81759cd247cFeDD9D0B479df` | `0x4022de2D...C0564f402` | 2026-05-11 | — |
| Base (8453)      | `0x00000000D49195AE81759cd247cFeDD9D0B479df` | `0x4022de2D...C0564f402` | 2026-05-14 | [`0x20bbd8a8…`](https://basescan.org/tx/0x20bbd8a8f948a1d01eae17e2df919963ab92b6bcb86c326377d28d224bdb6923) |
| Arbitrum (42161) | `0x00000000D49195AE81759cd247cFeDD9D0B479df` | `0x4022de2D...C0564f402` | 2026-05-14 | [`0xa91d7cb7…`](https://arbiscan.io/tx/0xa91d7cb722fdcb1bc739b2161db7acdf911692837ec574bc9434e0eaf5be0747) |

Bytecode SHA-256 `424e78aad2b19a37…` (1278 bytes) is identical on all three chains.

**Vanity salt** (deployed via Arachnid proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C`, prefix `0000000`):
```
0xfc1ecd1953bb17cf798c1eaeed287873008f3a3038f438e9e74c3b33ce370ef5
```
- Factory init code hash: `0x30f9d9020bf9622bbe7f8a1625d447efe350dfafd0a91e6dbd62d56547db835f`
- Grind: 96,448,706 attempts in 101.1 s, generated 2026-05-10T11:40:46Z (lucked into 8 zeros while targeting 7)

- Source: `ThreeWSFactory.sol`, solc v0.8.35, optimizer 200 runs, MIT, verified on BscScan.
- ABI:
  - `deploy(bytes32 salt, bytes initCode) → address` — wraps `CREATE2(0, initCode, salt)`, reverts `"create2 failed"` on zero address.
  - `predict(bytes32 salt, bytes32 initCodeHash) → address` (view).
  - Event: `Deployed(address indexed addr, bytes32 indexed salt)`.
- Vanity 8-byte zero prefix (`0x00000000…`) saves calldata gas on every `deploy`/`predict` call.
- To replicate on a new chain, use the same EOA + nonce + init code so CREATE2 yields the same address.

## ThreeWSPayments (x402 pay-per-call receiver)

Deployed via `ThreeWSFactory.deploy(salt, initCode)`. Constructor takes the chain's
canonical USDC token, so each chain's init code differs → the cross-chain CREATE2
address parity that the factory itself enjoys does **not** apply here. The vanity
8-zero prefix only landed on BSC; Base and Arbitrum produced ordinary addresses
from the same salt.

**Owner:** `0x4022de2d36c334e73c7a108805cea11c0564f402` (deployer EOA)

**Vanity salt** (BSC-targeted, prefix `00000000`, case-insensitive):
```
0x5ef7540f7c609d04ab6d3997bc8c38f0f31ce09acccff2c11bcb3909ad542cde
```
- Factory / deployer:    `0x00000000d49195ae81759cd247cfedd9d0b479df`
- BSC init code hash:    `0xb55479df540c0e4efae39a0181051754cc236a9934f03805a743f4290178569e`
- Grind: 2,859,887,864 attempts in 22.3 s, generated 2026-05-10T13:58:54Z

| Chain            | USDC                                         | ThreeWSPayments                              | Tx |
| ---------------- | -------------------------------------------- | -------------------------------------------- | -- |
| BSC (56)         | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` | [`0x00000000381f09742a30a5a49975514AeC1B72Cc`](https://bscscan.com/address/0x00000000381f09742a30a5a49975514AeC1B72Cc) | [`0xc4f4e87f…`](https://bscscan.com/tx/0xc4f4e87f67c70044a8682ea50d59fbc04e9777f453538a6916075f5409e5b7ef) |
| Arbitrum (42161) | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | [`0xed3696489490dbfAFD82996ADB11165A56c33c49`](https://arbiscan.io/address/0xed3696489490dbfAFD82996ADB11165A56c33c49) | [`0xca39a600…`](https://arbiscan.io/tx/0xca39a6003e8a6144662aceae43ee2b2c5107e426e16ccf58a406d66d38f34e5f) |
| Base (8453)      | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | [`0x31B13cDe47431EfcC8616C8495204e6E6C2Ded34`](https://basescan.org/address/0x31B13cDe47431EfcC8616C8495204e6E6C2Ded34) | [`0xb6fcf60b…`](https://basescan.org/tx/0xb6fcf60b4ca16d25e135f91046107e78518fca9aa4f180d5110a5116bcdfe4d0) |

### Base deploy status — LIVE, bytecode confirmed (re-verified 2026-06-15)

The earlier "tx mined but address has no code → treat as **not deployed**" note was
**wrong** — a stale/unsynced RPC reading at deploy time. The deploy succeeded. Proof,
re-checked on-chain against live Base RPC:

- Deploy tx [`0xb6fcf60b…`](https://basescan.org/tx/0xb6fcf60b4ca16d25e135f91046107e78518fca9aa4f180d5110a5116bcdfe4d0)
  emitted `Deployed(addr=0x31B13cDe…, salt=0x5ef7540f…)` from `ThreeWSFactory` — so the
  predicted address **is** the deployed address (no CREATE2 collision, no salt mismatch).
- `eth_getCode(0x31B13cDe…)` returns **1243 bytes** (non-empty). `owner()` →
  `0x4022de2D36C334E73C7a108805Cea11C0564f402` (the deployer EOA, as on BSC/Arbitrum),
  and Base USDC `0x833589fCD6…` is embedded as the `USDC` immutable (BSC USDC is not).
- Independently re-derived: compiling the in-repo source (`contracts/ThreeWSPayments.sol`,
  solc `0.8.35`, optimizer 200) reproduces the **exact** recorded BSC init-code hash
  `0xb55479df…` and live BSC address — confirming source + settings are byte-for-byte
  correct — and CREATE2(`factory`, salt, Base-USDC init code) → `0x31B13cDe…`. The Base
  init-code hash is `0x253291817df177b537145a05d0221065be924cffa606b387221b5c6bf8f1c475`.
  (1243 bytes runtime, vs BSC's 1278, differs only because each chain's USDC enters the
  constructor as an immutable.)

**Basescan verification: PENDING (not yet verified).** Source + exact settings are
captured in-repo; run `scripts/verify-threews-payments-base.mjs` with a
`BASESCAN_API_KEY` set to publish (constructor args:
`(0x4022de2D…, 0x833589fCD6…)`). The script prints the Standard JSON Input bundle for
manual UI verification when no key is present.

### Base payment routing — EOA `payTo` is intentional (no redeploy / no redirect)

`X402_PAY_TO_BASE` stays the EOA `0x4022de2D36C334E73C7a108805Cea11C0564f402`, **not**
the contract. Base x402 settles via the `exact` scheme (EIP-3009
`transferWithAuthorization` / Permit2) through the CDP facilitator, which performs a
plain ERC-20 USDC transfer to `payTo` — it never calls `pay(bytes32)` on the recipient.
An EOA receiver is correct there: funds land directly and stay liquid. Pointing `payTo`
at the contract would route USDC in via a raw transfer with **no `Payment` event**,
recoverable only through the contract's `withdraw()` — strictly worse.

`ThreeWSPayments` is load-bearing only on **BSC** (`X402_PAY_TO_BSC` = the contract),
where Binance-Peg USDC implements no EIP-3009 and no facilitator advertises `eip155:56`,
so the contract-mediated `pay(bytes32)` "direct" scheme is the only option (see
`api/_lib/x402-bsc-direct.js`). The Base instance exists for cross-chain parity and as an
on-chain record; the Base x402 flow has no code path that calls it, and Base payments
have been settling correctly to the EOA all along.

Deploy command (run from 3D-Agent repo where `scripts/deploy-multichain.mjs` lives):
```
PK=<deployer-private-key> \
PAYMENTS_SALT=0x5ef7540f7c609d04ab6d3997bc8c38f0f31ce09acccff2c11bcb3909ad542cde \
BASE_RPC_URL=... ARB_RPC_URL=... BSC_RPC_URL=... \
node scripts/deploy-multichain.mjs
```

## AgentPayments (EVM agent-token payment engine)

EVM port of the Solana `pump_agent_payments` program. One deployment per chain
serves every agent token on that chain. Deploy + wiring guide:
[`AGENT_PAYMENTS.md`](AGENT_PAYMENTS.md). Source: [`src/AgentPayments.sol`](src/AgentPayments.sol).
Owner = protocol/global buyback authority (set to the platform multisig).

Unlike `ThreeWSPayments`, the constructor takes only `owner` (no chain-specific
immutable), so a CREATE2 deploy via `ThreeWSFactory` with a shared salt yields the
**same** address on every chain. Plain `new` deploys produce per-chain addresses
(nonce-dependent) — fill in whichever you used.

| Chain | Chain ID | AgentPayments | Owner | Routers allow-listed | Tx |
| --- | --- | --- | --- | --- | --- |
| Ethereum | 1 | TODO: fill after deployment | TODO | TODO | TODO |
| Base | 8453 | TODO: fill after deployment | TODO | TODO | TODO |
| Arbitrum One | 42161 | TODO: fill after deployment | TODO | TODO | TODO |
| Polygon | 137 | TODO: fill after deployment | TODO | TODO | TODO |
| BNB Smart Chain | 56 | TODO: fill after deployment | TODO | TODO | TODO |
| Avalanche | 43114 | TODO: fill after deployment | TODO | TODO | TODO |

After filling a row, set the matching `agentPayments` address in
[`agent-payments-sdk/src/evm/addresses.ts`](../agent-payments-sdk/src/evm/addresses.ts)
and run `npm run build` in `agent-payments-sdk/`.

## Notes

- Addresses are authoritative in [`src/erc8004/abi.js`](../src/erc8004/abi.js) (`REGISTRY_DEPLOYMENTS`).
- Changing any address requires redeployment and updating `REGISTRY_DEPLOYMENTS` in `abi.js` and `api/_lib/erc8004-chains.js`.
- Deploy scripts: [`script/Deploy.s.sol`](script/Deploy.s.sol) (testnet), [`script/DeployValidationMainnet.s.sol`](script/DeployValidationMainnet.s.sol) (mainnet ValidationRegistry).
- 15-chain deploy command list: [`script/deploy-validation-registry.sh`](script/deploy-validation-registry.sh).
- After deployment: run `computeAddress(DEPLOYER_ADDRESS)` in the script (dry-run) to confirm the address, then update `validationRegistry` in `src/erc8004/abi.js` and `sdk/src/erc8004/abi.js`.
