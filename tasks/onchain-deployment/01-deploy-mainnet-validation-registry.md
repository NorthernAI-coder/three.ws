# Task: Deploy Mainnet ValidationRegistry + Wire Addresses

## Context

three.ws ships ERC-8004 on-chain agent identity. IdentityRegistry and
ReputationRegistry are deployed deterministically (CREATE2) across all 15 mainnet
chains, but **ValidationRegistry is only on testnet**. Mainnet clients currently
break:

- `src/erc8004/abi.js` — mainnet `validationRegistry: ''` (empty string)
- `sdk/src/erc8004/abi.js` — mainnet `validationRegistry: null`
- `src/erc8004/validation-recorder.js` lines 63–65 — throws "No Validation
  Registry deployed" when the address is falsy.

So any user trying to record a glTF/schema validation attestation on Base mainnet
hits a hard error. This task deploys the contract deterministically and wires the
address everywhere.

## Goal

ValidationRegistry live at one deterministic address across all 15 mainnet chains,
with that address present and identical in all three address sources, and
`recordValidation()` working on mainnet.

## Files to Read First

- `contracts/script/DeployValidationMainnet.s.sol` — CREATE2 deploy script;
  hardcodes IdentityRegistry `0x8004A169…`, Arachnid factory, salt
  `keccak256("ValidationRegistry", 1)`, includes `computeAddress()` dry-run helper
- `contracts/script/deploy-validation-registry.sh` — 15-chain orchestration
- `contracts/DEPLOYMENTS.md` — deployment record (mainnet ValidationRegistry row is TODO)
- `contracts/foundry.toml` — only Base is configured; you'll add RPC/Etherscan vars
- `src/erc8004/abi.js`, `sdk/src/erc8004/abi.js`, `api/_lib/erc8004-chains.js` — the
  three address sources that must agree

## What to Build / Do

1. **Predict the address.** Run the script in dry-run mode (`computeAddress(DEPLOYER)`)
   to get the deterministic ValidationRegistry address. Confirm it carries the
   `0x8004C…` vanity prefix consistent with the testnet deployment. If the salt
   does not produce a `0x8004…` address, stop and surface — do not deploy to a
   non-vanity address that breaks the family convention.

2. **Fund the deployer.** The deployer EOA `0x4022de2D…C0564f402` needs gas on each
   of the 15 chains. Confirm balances before broadcasting; report any underfunded
   chain rather than partially deploying.

3. **Deploy** via `deploy-validation-registry.sh` (or chain-by-chain `forge script
   … --broadcast --verify`). Verify source on each explorer.

4. **Confirm bytecode** on every chain: `cast code <addr> --rpc-url <chain>` must
   return non-empty. A mined tx is not proof of deployment (see the Base
   ThreeWSPayments incident in DEPLOYMENTS.md — tx succeeded, no code).

5. **Wire the address** into all three sources, identically:
   - `src/erc8004/abi.js` → mainnet `validationRegistry`
   - `sdk/src/erc8004/abi.js` → mainnet `validationRegistry`
   - `api/_lib/erc8004-chains.js` → each mainnet chain's registry block

6. **Allow-list the platform validator** on each chain (`addValidator(<validator
   addr>)` via `cast send`). This is owner-gated; the deployer is the owner. The
   validator address is the key the platform uses to sign glTF attestations
   (coordinate with task 07).

7. **Update DEPLOYMENTS.md** — fill the mainnet ValidationRegistry address and one
   tx hash per chain with explorer links (feeds task 05).

## Constraints

- All 15 chains or none for the address field — if a chain can't be funded, deploy
  the rest, but mark the missing chain explicitly in DEPLOYMENTS.md and leave its
  `erc8004-chains.js` entry pointing at the deterministic address only once code is
  confirmed there. Never list an address that has no code.
- Do not change the salt or factory — address parity with testnet/other contracts
  depends on it.
- zkSync Era uses a different EVM; verify its address separately (the script notes
  this).

## Success Criteria

- `cast code <validationRegistry> --rpc-url <each mainnet chain>` returns non-empty.
- `src/erc8004/abi.js`, `sdk/src/erc8004/abi.js`, `api/_lib/erc8004-chains.js` all
  carry the same mainnet ValidationRegistry address (task 05's parity script passes).
- A mainnet `recordValidation()` call from `validation-recorder.js` succeeds instead
  of throwing.
- DEPLOYMENTS.md mainnet ValidationRegistry row has a real address + per-chain tx links.
- Changelog entry added (`data/changelog.json`, tag: infra/security).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/onchain-deployment/01-deploy-mainnet-validation-registry.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
