# Task: Backfill Deployment Provenance + Address-Parity Guard

## Context

`contracts/DEPLOYMENTS.md` is the authoritative deployment record, but every
deployed contract's **Tx Hash column says `TODO: fill after deployment`** — even for
contracts that are demonstrably live (IdentityRegistry, ReputationRegistry on 15
chains). There's no verifiable on-chain provenance, and no committed Foundry
broadcast logs. Separately, the same registry addresses are duplicated by hand
across **three** files that can silently drift:

- `src/erc8004/abi.js` (`REGISTRY_DEPLOYMENTS`)
- `sdk/src/erc8004/abi.js`
- `api/_lib/erc8004-chains.js`

A professional on-chain deployment has reproducible provenance and a guard that
fails the build if these drift. This task adds both.

## Goal

Every live contract in DEPLOYMENTS.md has a real explorer tx link, and a committed
script verifies that all three address sources agree with each other and with
on-chain bytecode.

## Files to Read First

- `contracts/DEPLOYMENTS.md` — the record to backfill
- `src/erc8004/abi.js`, `sdk/src/erc8004/abi.js`, `api/_lib/erc8004-chains.js`
- `scripts/audit-deploy-artifacts.mjs` — existing build-gate audit (follow its style;
  this is where the parity check should hook in or sit beside)
- `package.json` — how audit scripts are wired into the build

## What to Build / Do

1. **Recover deploy tx hashes.** For each deployed registry on each chain, query the
   chain (or the deployer EOA's history / CREATE2 factory events) for the deployment
   tx and fill DEPLOYMENTS.md with explorer-linked hashes. Where a tx genuinely
   cannot be recovered, write `verified by bytecode (tx unrecoverable)` with the
   `cast code` confirmation date rather than leaving `TODO`.

2. **Write `scripts/verify-onchain-parity.mjs`** that:
   - Loads `REGISTRY_DEPLOYMENTS` from all three sources.
   - Asserts every chainId present in one is present in all, with byte-identical
     addresses per (chain, contract).
   - For a configurable subset (at least Base mainnet + Base Sepolia), does a live
     `eth_getCode` and asserts non-empty bytecode at each non-null address.
   - Asserts no address is a non-empty string while another source has it null/empty
     for the same slot (the ValidationRegistry drift trap).
   - Exits non-zero with a precise diff on any mismatch.

3. **Wire it into the build gate** alongside `audit-deploy-artifacts.mjs` so a drift
   fails CI/the Vercel build.

4. **Add `npm run verify:onchain`** to package.json.

## Constraints

- The live-bytecode portion must degrade gracefully when RPC is unreachable in CI
  (warn, don't hard-fail on network error) but MUST hard-fail on an actual address
  mismatch (that's a config bug, always real).
- Do not auto-edit the abi files from the script — it verifies, humans fix.
- Don't commit Foundry `broadcast/` bundles wholesale; link explorer tx hashes instead.

## Success Criteria

- DEPLOYMENTS.md has a real tx link (or explicit bytecode-verified note) for every
  deployed contract — no remaining `TODO` for live contracts.
- `node scripts/verify-onchain-parity.mjs` passes when the three sources agree and
  fails with a clear diff when they don't (test by temporarily editing one address).
- The check runs in the build gate.
- `npm run verify:onchain` exists.
