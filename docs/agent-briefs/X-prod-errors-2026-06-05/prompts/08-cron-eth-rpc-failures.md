# Fix 08 — `index-delegations` cron ETH RPC failures (P1, ~40 lines)

## The errors (verbatim)

```
{"stage":"index-delegations","chainId":1,"error":"RPC HTTP 429 from https://1rpc.io/eth"}
{"stage":"index-delegations","chainId":1,"error":"RPC eth_getLogs error: method not available"}
{"stage":"index-delegations","chainId":1,"error":"RPC HTTP 400 from https://1rpc.io/eth"}
{"stage":"index-delegations","chainId":1,"error":"RPC eth_getLogs error: block range extends beyond current head block"}
{"stage":"index-delegations","chainId":1,"error":"fetch failed"}
{"stage":"index-delegations","chainId":84532/421614/11155111/11155420,"warning":"time-budget-exceeded"}
```

`/api/cron/index-delegations` (mainnet chainId 1 + testnets). The cron fails to index
delegation events.

## Root cause

The delegation indexer relies on **public, free Ethereum RPC endpoints** (`https://1rpc.io/eth`)
that:
- rate-limit us (HTTP 429),
- **don't support `eth_getLogs`** on the free tier (`method not available`),
- reject malformed/oversized requests (HTTP 400, `block range extends beyond current head`),
- and intermittently fail (`fetch failed`).

Plus a logic bug: we query a **block range past the chain head** (`block range extends
beyond current head block`) — we're not clamping `toBlock` to the latest block. And multiple
testnet chains blow the **time budget** because indexing is serial/over-wide.

## Required fix

Find the cron: `api/cron/[name].js` (the `index-delegations` stage). Trace RPC URL
selection, the `eth_getLogs` call, and block-range math.

1. **Use a real RPC provider that supports `eth_getLogs`.** Public `1rpc.io/eth` is
   inadequate. Use the configured Alchemy/Infura/QuickNode endpoint (check `.env` /
   `vercel env` for an existing key — this codebase already does Solana RPC and EVM work, so
   a paid EVM RPC may exist). If none is configured, surface that to the user; never ship a
   cron that depends on a free endpoint that doesn't support our calls.
2. **Clamp the block range.** Before `eth_getLogs`, fetch `eth_blockNumber` and set
   `toBlock = min(desiredTo, head)`. Never request beyond head. Chunk large ranges into
   bounded windows (e.g. ≤ provider max, commonly 10k blocks) and paginate.
3. **Backoff + rotation on 429.** Bounded exponential backoff; optionally rotate across a
   small set of configured providers. On persistent failure for a chain, log and continue —
   one chain's RPC outage must not abort the whole cron.
4. **Respect the time budget.** The `time-budget-exceeded` warnings mean we do too much per
   invocation. Persist a per-chain cursor (this codebase already has cursor patterns — see
   `pumpfun-monitor-cursor` migration) so each run resumes from the last indexed block and
   does a bounded amount of work, then exits cleanly within budget.
5. **Handle `fetch failed`** as a transient: retry within budget, else checkpoint and resume
   next run. Never lose the cursor.

## Verification

- Run the cron locally/preview against the real RPC: it indexes delegation events for
  mainnet without 429/method-not-available, and resumes from its cursor.
- Force a bad block range → confirm it's clamped to head, no `beyond current head` error.
- Confirm each testnet chain completes within the time budget (cursor-bounded work).
- Post-deploy logs: `index-delegations` errors/time-budget warnings gone.

## Definition of done

The indexer uses an RPC that supports `eth_getLogs`, clamps and chunks block ranges, backs
off on 429, persists a per-chain cursor so each run stays within budget, and a single chain
failure doesn't abort the run.
