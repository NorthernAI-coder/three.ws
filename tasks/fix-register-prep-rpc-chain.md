# Task: Register-Prep — Use Full RPC Fallback Chain

## Problem

`api/agents/solana/_handlers.js` → `handleRegisterPrep` (around line 555) resolves the RPC
endpoint like this:

```js
const configuredRpc = network === 'devnet'
  ? (process.env.SOLANA_RPC_URL_DEVNET || PUBLIC_RPC.devnet)
  : (process.env.SOLANA_RPC_URL || PUBLIC_RPC.mainnet);
const publicRpc = PUBLIC_RPC[network] || PUBLIC_RPC.mainnet;
```

Then builds a UMI client from `configuredRpc` with:

```js
const buildTx = async (rpc) => {
  const umi = createUmi(rpc).use(mplCore());
  ...
};

let txBytes;
try {
  txBytes = await buildTx(configuredRpc);
} catch (rpcErr) {
  if (configuredRpc === publicRpc) {
    // already on public, give up
    return error(res, 503, ...);
  }
  // retry on public
  try {
    txBytes = await buildTx(publicRpc);
  } catch (fallbackErr) {
    return error(res, 503, ...);
  }
}
```

### Why this is suboptimal

- `configuredRpc` resolves to `SOLANA_RPC_URL` (typically Helius or Alchemy). When Helius hits
  its quota (6h cooldown in the process-wide `_endpointCooldown` map), `createUmi(configuredRpc)`
  builds a bare `@solana/web3.js Connection` with NO rotating fetch — it sends every request
  directly to Helius and gets 429s until the cooldown expires, causing user-facing 503s.

- The fallback to `publicRpc` (`api.mainnet-beta.solana.com`) goes to the most aggressively
  rate-limited endpoint without trying Alchemy or Ankr first.

- The `catch` path generates two log lines per failure (`configured RPC failed, retrying with
  public RPC` + `public RPC fallback also failed`) even when the issue is a known-cooling provider
  that should have been skipped silently.

### What to use instead

`solanaConnection()` from `api/_lib/solana/connection.js` wraps a `Connection` with
`makeRotatingFetch` — it automatically rotates through the full Helius → Alchemy → Ankr →
public chain and skips cooling providers. UMI accepts any RPC URL string; passing the primary
endpoint and relying on the rotating fetch gives full failover transparently.

## Fix

In `handleRegisterPrep`, replace the manual two-RPC try/catch with a single
`solanaConnection()`-backed UMI call:

```js
import { solanaConnection } from '../../_lib/solana/connection.js';

// Inside handleRegisterPrep, replacing the configuredRpc / publicRpc block:
const rpcUrl = network === 'devnet'
  ? (process.env.SOLANA_RPC_URL_DEVNET || 'https://api.devnet.solana.com')
  : (process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

// solanaConnection wraps the URL with makeRotatingFetch (Helius → Alchemy → Ankr → public)
// and disableRetryOnRateLimit:true — no manual fallback needed.
const conn = solanaConnection({ url: rpcUrl, network, commitment: 'confirmed' });

const buildTx = async () => {
  const umi = createUmi(conn.rpcEndpoint).use(mplCore());
  // ... rest of buildTx unchanged
};

let txBytes;
try {
  txBytes = await buildTx();
} catch (rpcErr) {
  console.error('[solana/register-prep] RPC error after all fallbacks:', rpcErr.message);
  return error(res, 503, 'rpc_unavailable', 'Solana RPC temporarily unavailable — try again in a moment.');
}
```

**Note**: UMI takes an RPC URL string as the first argument to `createUmi()`, not a
`Connection` object. The rotating fetch is attached to the underlying `Connection` but UMI
doesn't see it directly. The correct pattern is to pass the primary URL string to `createUmi`
AND also pass the `Connection` as a custom endpoint if UMI's `@solana/web3.js` adapter accepts
it. Check `createUmi` signature — some versions accept a `Connection`, some accept a URL string.

If UMI doesn't support `Connection` objects, use the two-step approach:
1. Build a `solanaConnection()` and call `.getLatestBlockhash()` as an RPC probe BEFORE calling
   `createUmi()` — this exercises the rotating fetch so a cooling endpoint gets skipped.
2. Read `conn.rpcEndpoint` (which will be the rotating fetch's currently-selected live endpoint)
   and pass THAT URL string to `createUmi()`.

## Relevant files

- `api/agents/solana/_handlers.js` — `handleRegisterPrep` at line ~490; the RPC resolution
  block at line ~555; the `buildTx` try/catch at line ~630
- `api/_lib/solana/connection.js` — `solanaConnection()`, `makeRotatingFetch()`, `solanaRpcEndpoints()`
- `api/_lib/solana/rpc-fallback.js` — `RpcFallback` / `rpcFallbackFromEnv()` (alternative if
  UMI integration is simpler with a raw `Connection`)

## Acceptance criteria

- `handleRegisterPrep` has one RPC error path, not two nested try/catches
- When Helius is in the process-wide `_endpointCooldown` map, register-prep succeeds by
  routing through Alchemy/Ankr without the user seeing a 503
- No `[solana/register-prep] configured RPC failed, retrying with public RPC` log lines
  during Helius outages — failures are absorbed by the rotating fetch silently
- Existing register-prep tests (if any) still pass; manual test: register an agent on devnet
  while `SOLANA_RPC_URL_DEVNET` points to a non-responsive URL
