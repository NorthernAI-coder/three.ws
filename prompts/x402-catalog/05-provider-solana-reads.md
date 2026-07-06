# 05 — Aggregator provider: Solana on-chain reads

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

Add a `solana` provider to `api/v1/_providers.js` exposing the on-chain reads agents ask for
constantly — balance, token holdings, supply, largest holders, transaction lookup, priority
fees — as simple GET endpoints, so an agent never has to hand-build JSON-RPC.

## Context

- Registry: `api/v1/_providers.js`. The descriptor contract supports POST upstreams with a
  `body` builder — Solana RPC is a single POST endpoint with JSON-RPC bodies, so every
  "endpoint" here is `method: 'POST'` upstream-side. BUT the public aggregator surface should
  stay GET-friendly for these (they're reads). Read `api/v1/x/[...slug].js` to see how
  GET/POST are dispatched; if the front door strictly maps caller method → upstream method,
  extend the endpoint descriptor with an explicit `upstreamMethod` field handled in
  `api/_lib/aggregator.js` (`executeUpstream`) so a caller GET can drive an upstream POST.
  Keep that change minimal and documented in the registry header comment.
- **RPC URL:** the platform already talks to Solana RPC — read `api/solana-rpc.js` and grep
  `api/_lib` for the env var(s) in use (e.g. `SOLANA_RPC_URL` / Helius). Use the SAME env
  resolution the platform already uses; the descriptor `base` may be computed at module load
  from that env with a sensible public fallback (`https://api.mainnet-beta.solana.com`).
- JSON-RPC methods to wrap: `getBalance`, `getTokenAccountsByOwner` (jsonParsed, by owner +
  programId TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA), `getTokenSupply`,
  `getTokenLargestAccounts`, `getTransaction` (jsonParsed, maxSupportedTransactionVersion 0),
  `getAccountInfo` (jsonParsed), `getRecentPrioritizationFees`.
- Example addresses in params/tests/docs: $THREE mint
  `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`; for wallet examples generate a synthetic
  base58 or use a well-known program id — never a real person's wallet.

## Tasks

1. Curl the platform's configured RPC (or the public fallback) with each JSON-RPC body; record
   real shapes.
2. Add provider `solana` (category `onchain-data`) with endpoints (all GET caller-side):
   - `balance` — param `address` (required) → `{ lamports, sol }`.
   - `token-holdings` — param `owner` (required) → parsed token accounts slimmed to
     `[{ mint, amount, decimals, uiAmount }]`, zero-balances filtered, sorted by uiAmount.
   - `token-supply` — param `mint` (required) → `{ amount, decimals, uiAmount }`.
   - `largest-holders` — param `mint` (required) → top 20 `[{ address, uiAmount }]`.
   - `transaction` — param `signature` (required) → slimmed: slot, blockTime, fee, err,
     signer(s), log messages truncated to first 20 lines, pre/post token balance deltas.
   - `account` — param `address` (required) → owner program, lamports, executable, parsed data
     type when available.
   - `priority-fees` — no params → last 150 slots reduced to `{ p50, p75, p95, max }`
     (compute the percentiles in the transform).
3. Each endpoint: `free: { perMin: 20, perDay: 2000 }`, `priceAtomics '1000'`, scope
   `agents:read`, specific summary, documented params with examples. JSON-RPC `error` in the
   upstream 200 response must surface as a proper HTTP error (status 400/404 with the RPC
   message), not as a payload — handle in the transform or a shared helper.
4. **Tests** in `tests/api/v1-provider-solana.test.js`: descriptor integrity, every transform
   against captured real-shaped fixtures (success AND RPC-error payloads), percentile math,
   required-param errors. Targeted vitest until green.
5. **Docs:** provider section in `docs/api-reference.md` with runnable curls. Changelog entry
   (`feature`): free Solana reads for agents — no RPC endpoint, no JSON-RPC boilerplate.
6. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

Seven read endpoints live through the aggregator, RPC errors mapped to HTTP errors, transforms
tested against real captured shapes, docs + changelog updated, committed, pushed.
