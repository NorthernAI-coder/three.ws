# Task: Re-deploy ThreeWSPayments on Base + Verify Bytecode

## ✅ RESOLVED 2026-06-15 — no redeploy needed

The premise ("Base deploy is dead, must re-run") was incorrect. The contract is
**already live** on Base at `0x31B13cDe47431EfcC8616C8495204e6E6C2Ded34`, bytecode
confirmed on-chain (1243 bytes, `owner()` = the deployer EOA, Base USDC embedded as the
`USDC` immutable). The deploy tx `0xb6fcf60b…` emitted `Deployed(0x31B13cDe…, 0x5ef7…)`
from `ThreeWSFactory`; the original "no code" reading was a stale/unsynced RPC. The
predicted address == deployed address (re-derived via CREATE2), so there was never a
collision or salt mismatch.

Outcome:
- Diagnosis + bytecode confirmation done on-chain (see `contracts/DEPLOYMENTS.md`).
- Source restored to `contracts/ThreeWSPayments.sol` + `contracts/ThreeWSFactory.sol`
  (compiling them reproduces the live BSC init-code hash byte-for-byte).
- Payment routing decided: `X402_PAY_TO_BASE` stays the **EOA** — correct for Base's
  facilitator `exact` scheme; the contract is load-bearing only on BSC's `direct` scheme.
  No env change.
- Basescan verification: PENDING only on a `BASESCAN_API_KEY` — run
  `scripts/verify-threews-payments-base.mjs` (it's wired to the Etherscan v2 API).

## Context

`ThreeWSPayments` is the x402 pay-per-call receiver contract. Per
`contracts/DEPLOYMENTS.md`, it is live on BSC (`0x00000000381f…`) and Arbitrum
(`0xed369648…`), but on **Base the deploy tx mined successfully yet the predicted
address `0x31B13cDe…` has no code** — explicitly marked "treat as **not deployed**,
must re-run." Base is the platform's primary EVM payment chain, so this is the most
important x402 receiver and it's currently dead.

## Goal

ThreeWSPayments live on Base with confirmed bytecode, the real deployed address
recorded, and every config/env reference pointing at it.

## Files to Read First

- `contracts/DEPLOYMENTS.md` — "ThreeWSPayments" section; Base row + the deploy
  command at the bottom (`scripts/deploy-multichain.mjs` lives in the 3D-Agent repo)
- `contracts/vanity/payments-bsc-deployed.json` — grind artifact, salt, init-code hashes
- `api/_lib/x402-spec.js`, `api/_lib/x402-paid-endpoint.js` — where the receiver /
  `X402_PAY_TO_BASE` is consumed (currently `0x4022de2d…`, the deployer EOA — confirm
  whether payments should route to the contract or the EOA)

## What to Build / Do

1. **Diagnose the failed deploy.** The Base tx mined but produced no code — usually a
   CREATE2 collision, an out-of-gas constructor, or a salt/init-code mismatch.
   Re-derive the predicted address locally from the salt + Base USDC
   (`0x833589fCD6…`) init code and compare to `0x31B13cDe…`. Decide: re-use the
   vanity salt (accepting a non-zero-prefix address, as the doc notes Base never
   landed the prefix) or grind a fresh Base-specific salt.

2. **Fund + deploy.** Deployer EOA needs ETH on Base. Run the multichain deploy
   (Base only) with the chosen salt.

3. **Confirm bytecode** — `cast code <addr> --rpc-url $BASE_RPC_URL` must be
   non-empty. Do not record the address until this passes.

4. **Verify source** on Basescan.

5. **Decide payment routing.** If x402 on Base is meant to settle into this contract
   rather than the EOA, update `X402_PAY_TO_BASE` (Vercel env via REST API — the CLI
   writes empty secrets) and any hardcoded reference. If the EOA is intentional
   (simple receiver), document that and leave it, but still record the contract.

6. **Update DEPLOYMENTS.md** — replace the Base "not deployed" warning with the real
   address + tx link, and note bytecode confirmed.

## Constraints

- A mined tx is NOT proof of deployment — bytecode check is mandatory.
- Do not touch the BSC/Arbitrum rows; they're live.
- Never force config to an address with no code.
- Env writes go through the Vercel REST API, not `vercel env add` (writes empty
  secrets under the plugin wrapper).

## Success Criteria

- `cast code <base ThreeWSPayments> --rpc-url $BASE_RPC_URL` returns non-empty.
- Contract verified on Basescan.
- DEPLOYMENTS.md Base row shows the real address + tx link, no warning.
- x402 Base payment routing is correct and documented.
- An x402 paid call on Base settles to the intended recipient (verify with task 10).
