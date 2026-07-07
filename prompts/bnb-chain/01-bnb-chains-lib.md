# 01 — BNB chain constants + RPC failover lib

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: none.** This is the foundation every other prompt imports.

## Why
Every BNB prompt needs the same chain metadata, a resilient RPC client, and a way to prove
the 0.45s block claim. Centralize it once so no prompt hand-rolls RPC URLs or hardcodes the
hub addresses from 00-CONTEXT.

## Build — `api/_lib/bnb/chains.js`
Small, dependency-light module (viem preferred; it's installed). Export:
- `BNB_CHAINS` — `{ bscMainnet: {id:56, rpcs:[...], explorer, greenfieldHubs:{crossChain,tokenHub,bucketHub,objectHub,groupHub,multiMessage}}, bscTestnet: {id:97, rpcs:[...], explorer}, }`. Copy the mainnet hub addresses **verbatim from 00-CONTEXT** (do not invent). Include ≥2 public RPC URLs per network for failover.
- `getPublicClient(network)` — returns a viem public client with RPC failover: try each RPC in order, cache the first healthy one, re-probe on failure. Default network `bscTestnet`.
- `probeBlockTime(network, sampleBlocks = 200)` — fetch `latest` and `latest - sampleBlocks`, return `{ avgBlockTimeMs, latestBlock, target: network==='bscMainnet' ? 450 : null, measuredAt }`. This is what the latency-proof surfaces (14–17) consume.
- `isEvmAddress(s)` / `assertBscAddress(s)` helpers.

## States / robustness
All RPCs down → throw a typed `BnbRpcError` with the list of URLs tried (callers surface 503).
Never hang: per-RPC timeout (default 5s). No secrets in this file — RPC URLs are public.

## Tests (`tests/bnb-chains.test.js`)
- `BNB_CHAINS.bscMainnet.greenfieldHubs.crossChain` equals the exact 00-CONTEXT address.
- `isEvmAddress` accepts a checksummed 0x40-hex, rejects Solana base58 + junk.
- `getPublicClient` failover: mock first RPC throwing → second used (inject a fake transport).
- `probeBlockTime` shape asserted against a mocked block pair (numbers, not live) so the test is deterministic; ALSO include one `it.skip`-able live-RPC smoke test guarded by `process.env.BNB_LIVE_RPC` that asserts mainnet avg < 700ms.

## Definition of done
Inherit 00-CONTEXT DoD. Additionally:
- [ ] Run `probeBlockTime('bscMainnet')` live once; paste the real `{avgBlockTimeMs, latestBlock}` into PROGRESS (this is our own proof the 0.45s claim holds today).
- [ ] `docs/` not required yet (internal lib) — but add a one-line JSDoc header on each export.
