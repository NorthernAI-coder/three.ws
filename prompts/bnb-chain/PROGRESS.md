# BNB Chain Campaign — Progress Log

Append-only. Each completing agent adds a dated entry: prompt #, what shipped, real proof
(tx hashes, block numbers, JSON responses), gaps noticed for other prompts.

---

## 2026-07-07 — Campaign created

Research basis: 101-agent deep-research run + bnb-chain org repo dig (verified facts and
refuted claims recorded in `00-CONTEXT.md`). Owner approved all three tracks. No prompt
executed yet.

---

## 2026-07-08 — Prompt 01: BNB chain constants + RPC failover lib — SHIPPED, verified live

**Outcome: `api/_lib/bnb/chains.js` done and proven.** Built by a concurrent agent sharing
this worktree; independently re-verified line-by-line against `00-CONTEXT.md` and the spec
rather than trusted as-is (untracked, not yet committed).

- `BNB_CHAINS.bscMainnet.greenfieldHubs` — all six hub addresses (crossChain, tokenHub,
  bucketHub, objectHub, groupHub, multiMessage) match `00-CONTEXT.md` verbatim.
  `bscMainnet.id=56` (5 public RPCs), `bscTestnet.id=97` (4 public RPCs, default network).
- `getPublicClient(network, opts)` — viem `fallback()` transport (deterministic order,
  `rank:false`), 5s per-RPC timeout, cached per network. Accepts numeric ids and string
  aliases (`'bsc'`/`'mainnet'`/`'testnet'`) beyond the spec's literal names — ergonomic
  superset, not a deviation.
- `probeBlockTime(network, sampleBlocks=200)` — `{network, avgBlockTimeMs, latestBlock,
  sampleBlocks, target, measuredAt}`; throws typed `BnbRpcError{tried:[...]}` on total
  failure. `isEvmAddress`/`assertBscAddress` reuse viem's `isAddress`/`getAddress`.
- **Tests:** `tests/bnb-chains.test.js` — 12 passed + 1 skipped (BNB_LIVE_RPC-gated) by
  default; with `BNB_LIVE_RPC=1` → **13/13 passed**, live smoke test asserted
  `avgBlockTimeMs < 700ms` for real.

**Live proof the 0.45s block-time claim holds today** (real public RPC, not mocked):
```json
{ "network": "bscMainnet", "avgBlockTimeMs": 450, "latestBlock": 108693266,
  "sampleBlocks": 200, "target": 450, "measuredAt": "2026-07-08T00:39:03.963Z" }
```

**Status: DONE.** Every other BNB prompt can now import this lib. Not yet committed —
still untracked in the shared worktree pending an explicit commit pass.
