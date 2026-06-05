# Brief 10 — index-delegations cron uses dead/limited public ETH RPC (~50 errors)

## The errors
```
{"stage":"index-delegations","chainId":1,"error":"RPC eth_getLogs error: method not available"}
{"stage":"index-delegations","chainId":1,"error":"RPC HTTP 429 from https://1rpc.io/eth"}
{"stage":"index-delegations","chainId":1,"error":"RPC eth_getLogs error: block range extends beyond current head block"}
{"stage":"index-delegations","chainId":1,"error":"RPC eth_getLogs error: You've reached the usage limit..."}
{"stage":"index-delegations","chainId":1,"error":"fetch failed"}
```
Function: `/api/cron/[name]` → `index-delegations`.

## Root cause
The Ethereum mainnet (chainId 1) delegation indexer points at **free public RPCs (`1rpc.io/eth`
and similar) that rate-limit (429), don't support `eth_getLogs`, or are flaky** (`fetch failed`).
Plus the indexer requests a **block range beyond the current head**, meaning the cursor/`toBlock`
math is wrong. So the cron silently fails to index delegations.

## Required fix
1. **Use a real, keyed RPC.** Replace the public endpoint with a proper provider
   (Alchemy/Infura/QuickNode) via env var (e.g. `ETH_RPC_URL` / `ETH_MAINNET_RPC_URL`). Confirm
   which env the indexer reads (`grep` the cron + delegation indexer lib) and set it in prod.
   Don't hardcode `1rpc.io`. Keep a sane fallback list but put the keyed provider first.
2. **Fix the block-range math.** Clamp `toBlock` to `min(cursor+window, currentHead)` so it never
   exceeds the head. Page `eth_getLogs` in bounded ranges (e.g. ≤2k–10k blocks) to avoid provider
   limits. Persist the cursor only after a range succeeds so retries are idempotent
   (`indexer_state` table — see `specs/schema/indexer_state.sql`).
3. **Backoff + don't crash the cron.** On 429/`fetch failed`, backoff and retry the same range
   next run; log structured progress. A transient RPC error must not lose the cursor.

## Done when
- `index-delegations` runs against a keyed RPC, pages within the head block, advances and persists
  its cursor, and logs success — no `method not available` / `beyond current head` / sustained 429.
- Confirm the indexed delegations land in the DB (`agent_delegations`).
