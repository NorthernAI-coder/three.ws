# 02 — MegaFuel gasless-send client (with self-pay fallback)

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: 01** (`api/_lib/bnb/chains.js`). If missing, run prompt 01 first.

## Why
This is the crown-jewel capability: send a transaction from a plain private-key EOA that
pays ZERO gas, sponsored at the block-building layer. No smart account, no delegation —
impossible on Ethereum L1/Base. Wrap MegaFuel's API cleanly so every downstream prompt
(03 registration, 15 world-moves) gets gasless sends for free, with an automatic self-pay
fallback so nothing ever hard-fails.

## Build — `api/_lib/bnb/megafuel.js`
Use `megafuel-js-sdk` if it cleanly wraps the two RPC methods; otherwise call them directly
via viem/fetch (document the choice). Endpoints in 00-CONTEXT (testnet default). Export:
- `isSponsorable(network, txRequest)` → calls `pm_isSponsorable`; returns `{ sponsorable:boolean, sponsorInfo|null, reason }`. Never throws on a policy "no" — that's a normal answer.
- `sendGasless(network, { account, tx })` → builds the tx with `gasPrice: 0`, checks `isSponsorable`; if yes, signs + submits via MegaFuel's `eth_sendRawTransaction`; returns `{ hash, mode:'sponsored', sponsor }`. **If not sponsorable OR MegaFuel errors/times out → automatically self-pay**: resubmit via the standard `getPublicClient` (prompt 01) with normal gas, return `{ hash, mode:'self-pay', reason }`. This dual path is mandatory (00-CONTEXT: outage → self-pay).
- `sendGasless` accepts an injected signer (viem account) — never read a private key inside this file; caller passes it.

## States
Policy declines sponsorship → self-pay silently, surface `mode`. MegaFuel 5xx/timeout →
self-pay. Self-pay also fails (no gas, revert) → typed error with the on-chain reason.
Malformed tx → 400-style typed error before any network call.

## Tests (`tests/bnb-megafuel.test.js`)
- `isSponsorable` maps a mocked `{sponsorable:true}` and `{sponsorable:false,reason}` correctly.
- `sendGasless` sponsored path: mock `pm_isSponsorable=true` + raw send → `mode:'sponsored'`.
- **Fallback path** (the important one): mock `pm_isSponsorable=false` → asserts a self-pay submit happened and `mode:'self-pay'`. Also mock MegaFuel throwing → still self-pays.
- No private key ever appears in the module (grep-style assertion in test or code review note).
- Use a synthetic/testnet throwaway account; never a real third-party key.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] Live probe `pm_isSponsorable` against the public testnet MegaFuel endpoint with a real sample tx; paste the raw JSON reply in PROGRESS (even a policy "no" is valid proof the wire works).
- [ ] If a real sponsored send succeeds on testnet, paste the tx hash + BscScan link showing `gasPrice 0`. If sponsorship is gated behind a NodeReal account we lack, prove the self-pay path with a real testnet tx hash and record the exact policy-signup step in PROGRESS.
- [ ] `.env.example`: add `NODEREAL_MEGAFUEL_KEY=` (commented, optional) — code must work without it.
