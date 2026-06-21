# 31 — Solana RPC & on-chain resilience

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

Solana is the platform default network — launches, trades, payments, skill licenses,
and $THREE all live on-chain. A single RPC provider throttling or going down must not
take the platform with it, and a charge must never settle twice or charge-then-silently-revert.
On-chain money is unforgiving: at $1B, RPC failover, idempotent settlement, and
provable address parity are the difference between a graceful degrade and an
irreversible loss of funds or trust.

## Mission

Guarantee RPC failover/retry across providers, idempotent on-chain operations,
revert-safe confirmations, verified address/program parity, and graceful degradation
(cached/null reads, clear UI) when RPC is impaired — never a charge into the void.

## Map (trust but verify — files move)

- **RPC connection (canonical)** — [api/_lib/solana/connection.js](../../api/_lib/solana/connection.js) —
  `solanaConnection()` (transparent failover), `solanaRpcEndpoints()` (priority chain:
  caller url → `SOLANA_RPC_URL` → Helius → Alchemy → dRPC → Ankr → operator fallbacks →
  PublicNode/Leo/Tatum keyless → public mainnet-beta last), `makeRotatingFetch()` with
  per-endpoint quota cooldown + body validation.
- **RPC fallback class** — [api/_lib/solana/rpc-fallback.js](../../api/_lib/solana/rpc-fallback.js)
  — `RpcFallback` (3 consecutive fails → rotate, 60s cooldown), `rpcFallbackFromEnv()`.
- **Resilience (cockatiel)** — [api/_lib/resilience.js](../../api/_lib/resilience.js) —
  `withBreaker(name, fn, opts)`, `isCircuitError()` (ConsecutiveBreaker, 5 fails, 30s half-open).
- **SDK bridge (graceful null)** — [api/_lib/solana/sdk-bridge.js](../../api/_lib/solana/sdk-bridge.js)
  — pump SDK reads return `null` on transient RPC errors instead of throwing.
- **Confirm guard** — [api/_lib/solana/confirm.js](../../api/_lib/solana/confirm.js) —
  `confirmOrThrow()` throws on reverted tx (catches silent `result.value.err`).
- **Idempotency** — [api/_lib/x402/idempotency-cache.js](../../api/_lib/x402/idempotency-cache.js),
  [api/_lib/migrations/20260504140000_create_payment_intents.sql](../../api/_lib/migrations/20260504140000_create_payment_intents.sql),
  [api/_lib/migrations/20260603120000_payment_intents_tx_hash_unique.sql](../../api/_lib/migrations/20260603120000_payment_intents_tx_hash_unique.sql).
- **Parity/smoke** — [scripts/verify-solana-parity.mjs](../../scripts/verify-solana-parity.mjs)
  (`verify:solana`), [scripts/verify-onchain-parity.mjs](../../scripts/verify-onchain-parity.mjs)
  (`verify:onchain`), [scripts/onchain-smoke.mjs](../../scripts/onchain-smoke.mjs) (`smoke:onchain`).
- **Tests** — [tests/solana-rpc-rotating-fetch.test.js](../../tests/solana-rpc-rotating-fetch.test.js),
  [tests/api/solana-rpc-endpoints.test.js](../../tests/api/solana-rpc-endpoints.test.js),
  [tests/solana-confirm.test.js](../../tests/solana-confirm.test.js).

## Do this

1. **Audit every RPC entry point.** Grep for `new Connection(` / direct RPC URL use
   across `api/` and `workers/`. Every Solana read/write must go through
   `solanaConnection()` (or `RpcFallback`) so it inherits failover — never a single
   hardcoded provider. Fix any that bypass the helper.
2. **Wrap expensive/external calls in a breaker.** For aggregations and third-party
   reads (price, graduation progress, oracle attestations), wrap in `withBreaker`
   from `resilience.js` so a sick provider trips the circuit instead of hammering it.
   Reads use the connection's native rotation; the breaker guards the outer call.
3. **Validate rotating-fetch never leaks bad bodies.** Confirm (per the existing
   regression test) that `makeRotatingFetch` rejects `[]`, HTML, truncated JSON, and
   missing `result/error` rather than handing them to web3.js. Add cover for any new
   provider added to the chain.
4. **Idempotent on-chain ops.** Verify every settle/mint/trade path is keyed by an
   idempotency token (intent_id / payment id / tx_hash) backed by the unique
   constraint + `idempotency-cache`. The same id + same payload must replay the
   cached result with NO second on-chain action; same id + different payload → 409.
5. **Revert-safe confirmations.** Confirm money paths use `confirmOrThrow()` so a tx
   whose revert lands in `result.value.err` is treated as a failure (refund/retry),
   never charged-and-forgotten. Add cover for any path confirming manually.
6. **Graceful degradation.** When all RPC endpoints are exhausted, reads should
   return cached/`null` and the UI should show "live data unavailable, retrying"
   (designed, not a dead spinner) — never a raw RPC error and never a partial write.
   Verify writes abort cleanly (no half-settled state) when RPC is down mid-op.
7. **Prove parity + liveness.** Run `npm run verify:solana` and `npm run verify:onchain`;
   they must confirm the $THREE mint + program IDs match canonical and degrade to a
   warning (not hard-fail) when RPC is unreachable. Run `npm run smoke:onchain` against
   a safe target.
8. Run `npx vitest run tests/solana-rpc-rotating-fetch.test.js
   tests/api/solana-rpc-endpoints.test.js tests/solana-confirm.test.js`. Add a
   `data/changelog.json` entry only if a user-visible behavior changed (e.g. a new
   degraded-state message); then `npm run build:pages`.

## Must-not

- Never instantiate a raw single-provider `Connection` on a money path — use the failover helper.
- Never let a charge settle without an idempotency key + revert-safe confirmation.
- Never surface a raw RPC/provider error to the user — degrade with designed copy.
- Never hardcode or recommend any non-`$THREE` mint; parity is checked against the $THREE CA.
- Do not pull/fetch/merge from the `threeD` remote (push-only mirror). No mocks/stubs/TODOs.

## Acceptance (all true before claiming done)

- [ ] Every Solana entry point uses the failover connection/`RpcFallback`; no bypassing raw `new Connection`.
- [ ] Expensive/third-party reads are guarded by `withBreaker`; rotating-fetch rejects malformed bodies.
- [ ] Settle/mint/trade are idempotent (id + unique constraint + cache); same id never double-acts.
- [ ] Money paths confirm via `confirmOrThrow`; reverts become failures, never silent charges.
- [ ] RPC-down degrades to cached/null reads with designed UI; writes abort cleanly with no half-state.
- [ ] `verify:solana` + `verify:onchain` pass (warn, not fail, when RPC down); `smoke:onchain` green.
- [ ] RPC/confirm/endpoint tests pass; changelog updated only if user-visible.
