# SIWX prompt 03 — wire SIWX into the `paidEndpoint()` helper

## Context

three.ws workspace at `/workspaces/three.ws`. Architecture in
[prompts/siwx/PLAN.md](PLAN.md). Prompts 01 + 02 created
`siwx_payments` / `siwx_nonces` and a Postgres adapter at
[api/_lib/siwx-storage.js](../../api/_lib/siwx-storage.js).

This prompt is **step 3 of 7** — the core integration. Every x402 paid
endpoint in `api/x402/*.js` is built on top of
[api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js)'s
`paidEndpoint(spec)` factory. We extend that one helper so any endpoint can
opt into SIWX by adding a single `siwx:` block to its spec — and existing
endpoints that don't opt in are unchanged.

Read [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js)
in full before you start. The 7-step dance (CORS → method-check → 402 →
verify → handler → settle → response) is the spine you're extending.

## Rails (CLAUDE.md, non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs.
- No commented-out code in the diff.
- Real Postgres writes via `siwxStorage`. Real signature verification via
  `@x402/extensions/sign-in-with-x` — not your own crypto.
- Errors at boundaries only.
- `npm test` green.
- Existing endpoints that don't pass a `siwx:` block must continue to
  behave **bit-identically** to today (same 402 body, same headers, same
  response shape). Snapshot-style test in prompt 07 will catch regressions.

## Files to edit / create

### File 1 — `api/_lib/siwx-server.js` (new)

Thin wrapper around the upstream SIWX primitives so `paidEndpoint()` stays
readable. Match the file-header style of
[api/_lib/x402-spec.js](../../api/_lib/x402-spec.js).

Exports:

```js
// api/_lib/siwx-server.js
//
// Server-side glue between @x402/extensions/sign-in-with-x and our paidEndpoint()
// wrapper. Keeps the verification path, extension declaration, and EVM smart-
// wallet verifier in one place so each new endpoint doesn't have to repeat them.

import {
  declareSIWxExtension,
  parseSIWxHeader,
  validateSIWxMessage,
  verifySIWxSignature,
  SIGN_IN_WITH_X,
} from '@x402/extensions/sign-in-with-x';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

import { env } from './env.js';
import { siwxStorage, normalizeAddress } from './siwx-storage.js';

export { SIGN_IN_WITH_X };

// Lazily build a viem PublicClient so verifySIWxSignature can verify
// smart-contract wallets (EIP-1271) and counterfactual wallets (EIP-6492).
// Uses our private RPC (env.BASE_RPC_URL) to avoid leaking buyer addresses
// to a public node. Returns undefined when BASE_RPC_URL isn't configured —
// the upstream verifier then falls back to EOA-only verification.
let _baseClient;
function getEvmVerifier() {
  if (!env.BASE_RPC_URL) return undefined;
  if (!_baseClient) {
    _baseClient = createPublicClient({
      chain: base,
      transport: http(env.BASE_RPC_URL),
    });
  }
  return _baseClient.verifyMessage;
}

// Build the extensions block that goes into the 402 body when SIWX is
// enabled for an endpoint. The upstream helper auto-derives `domain`,
// `resourceUri`, and refreshes `nonce`/`issuedAt` — we just pass network +
// the human-readable statement.
//
// `networks` is the same CAIP-2 array the rest of paidEndpoint() uses
// (e.g. ['eip155:8453', 'solana:5eykt...']). Multi-chain support is the
// whole reason CAIP-122 exists — emit all of them, the client picks one.
export function declareSiwxExtensionFor({ networks, statement, expirationSeconds = 300 }) {
  return declareSIWxExtension({
    network: networks.length === 1 ? networks[0] : networks,
    statement,
    expirationSeconds,
  });
}

// Given an incoming Vercel request, attempt to authenticate via SIGN-IN-WITH-X.
// Returns { ok: true, address, network } when the signature is valid AND the
// (resource, address) pair is on record. Returns { ok: false, status, error }
// on validation/verification failure (caller emits 401/402 accordingly).
// Returns null when the header is absent — caller continues with the normal
// X-PAYMENT flow.
export async function authenticateSiwx({ req, resourceUrl }) {
  const header =
    req.headers['sign-in-with-x'] ||
    req.headers['SIGN-IN-WITH-X'] ||
    req.headers['Sign-In-With-X'];
  if (!header) return null;

  let payload;
  try {
    payload = parseSIWxHeader(String(header));
  } catch (err) {
    return { ok: false, status: 400, code: 'siwx_parse_failed', error: err.message };
  }

  const validation = await validateSIWxMessage(payload, resourceUrl, {
    // Tighten the default 5-min window slightly so we don't accept stale
    // signatures across deploys / cold starts.
    maxAge: 5 * 60 * 1000,
    checkNonce: async (n) => !(await siwxStorage.hasUsedNonce(n)),
  });
  if (!validation.valid) {
    return { ok: false, status: 401, code: 'siwx_message_invalid', error: validation.error };
  }

  const verification = await verifySIWxSignature(payload, { evmVerifier: getEvmVerifier() });
  if (!verification.valid || !verification.address) {
    return { ok: false, status: 401, code: 'siwx_signature_invalid', error: verification.error };
  }

  const normalizedAddress = normalizeAddress(payload.chainId, verification.address);
  if (!(await siwxStorage.hasPaid(resourceUrl, normalizedAddress))) {
    return { ok: false, status: 402, code: 'siwx_not_paid', error: 'wallet has not paid for this resource' };
  }

  await siwxStorage.recordNonce(payload.nonce, {
    resource: resourceUrl,
    address: normalizedAddress,
  });

  return { ok: true, address: normalizedAddress, network: payload.chainId };
}

// Record a fresh payment so the wallet can re-enter via SIWX next time.
// Called from paidEndpoint() after a successful facilitator settle.
export async function recordSiwxPayment({ resourceUrl, payer, network, ttlSeconds = null }) {
  if (!payer) return; // direct-scheme settlements without a payer (BSC fallback) skip recording.
  await siwxStorage.recordPayment(resourceUrl, payer, { network, ttlSeconds });
}
```

Add `BASE_RPC_URL` to [api/_lib/env.js](../../api/_lib/env.js) if it isn't
already listed (look first — `env.BASE_RPC_URL` may already exist for the
Permit2 / BSC flow). If you add it, keep the existing alphabetical/grouping
convention of that file.

### File 2 — extend `api/_lib/x402-paid-endpoint.js`

Three changes, **and nothing else**:

#### 2a. New optional `siwx` field on the `spec` argument

```js
const {
  route,
  method = 'GET',
  priceAtomics = env.X402_MAX_AMOUNT_REQUIRED,
  networks = ['base', 'solana'],
  description,
  mimeType = 'application/json',
  bazaar,
  handler,
  // NEW: when present, this endpoint advertises and accepts SIWX auth.
  // { statement: string; ttlSeconds?: number | null; expirationSeconds?: number }
  // - statement: human-readable purpose shown to the wallet on signing
  // - ttlSeconds: how long the payment grant lasts (null = permanent)
  // - expirationSeconds: SIWX message validity window (default 300s)
  siwx,
} = spec;
```

#### 2b. Declare the SIWX extension on the 402 challenge

Inside the `paidHandler` async function, after building `requirements` but
before constructing the `challenge` object, build the extensions block when
SIWX is enabled and pass it through `send402` (which already supports an
`extensions` option via `build402Body`):

```js
const siwxExtensions = siwx
  ? declareSiwxExtensionFor({
      networks: requirements.map((r) => r.network),
      statement: siwx.statement,
      expirationSeconds: siwx.expirationSeconds,
    })
  : null;

const challenge = {
  resourceUrl,
  accepts: requirements,
  description,
  mimeType,
  bazaar,
  ...(siwxExtensions ? { extensions: siwxExtensions } : {}),
};
```

`build402Body` in [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js)
already merges arbitrary extensions — confirm by re-reading lines around
`extraExtensions`. No change needed there.

#### 2c. SIWX auth path: before falling through to the 402 flow

Right after `const paymentHeader = req.headers['x-payment'] || req.headers['payment-signature'];`,
add the SIWX short-circuit:

```js
if (siwx && !paymentHeader) {
  const auth = await authenticateSiwx({ req, resourceUrl });
  if (auth?.ok) {
    let result;
    try {
      result = await handler({
        req,
        res,
        requirement: null,     // no payment requirement was used
        payer: auth.address,   // recovered SIWX wallet
        siwx: { address: auth.address, network: auth.network },
      });
    } catch (err) {
      if (err instanceof X402Error && err.status === 402) {
        return send402(res, { ...challenge, error: err.message });
      }
      return error(res, err.status || 500, err.code || 'internal_error', err.message);
    }
    if (res.writableEnded) return;
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-type', `${mimeType}; charset=utf-8`);
    res.end(typeof result === 'string' ? result : JSON.stringify(result));
    return;
  }
  if (auth && !auth.ok) {
    // Validation/verification failed — return a 401 so callers don't keep
    // retrying with the same broken signature. They can drop the header and
    // re-attempt the normal pay-with-USDC flow.
    return error(res, auth.status, auth.code, auth.error);
  }
  // auth === null → header absent → fall through to standard 402 dance.
}
```

Import `X402Error` (already imported), `authenticateSiwx`, and
`declareSiwxExtensionFor` from `./siwx-server.js`. The `siwx` extra arg to
`handler` is opt-in — existing handlers ignore it; new handlers can branch on
"served via signature" vs. "served via payment" if they care (most won't).

#### 2d. Record the payment after settlement

In the same handler, after the existing `settlePayment(...)` call succeeds
and before `res.setHeader('x-payment-response', ...)`, record the grant:

```js
if (siwx) {
  await recordSiwxPayment({
    resourceUrl,
    payer: verified.payer,
    network: verified.requirement.network,
    ttlSeconds: siwx.ttlSeconds ?? null,
  });
}
```

Import `recordSiwxPayment` from `./siwx-server.js`. Don't try/catch this:
if Postgres is down, the payment already settled on-chain; logging the
error and surfacing a 500 is fine — we don't want to silently lose a
grant on a Neon hiccup. Let it throw; the outer `error(res, ...)` already
catches handler errors and returns a clean response.

Actually — wait. The settle path doesn't currently wrap further work in a
try/catch (it goes straight to writing headers). Wrap the `recordSiwxPayment`
call in a `try/catch` that returns a `502 siwx_record_failed` so the buyer
sees a clear error instead of a hung connection. They can retry; the upsert
on `siwx_payments` is idempotent and the on-chain transaction is final.

### File 3 — JSDoc + tests

Update the JSDoc / file-top comment of
[api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js) so the
8-step dance is correctly described (was 7). Add one paragraph explaining
the SIWX opt-in.

New test file `api/_lib/x402-paid-endpoint.siwx.test.js` (Vitest) covering:

1. Endpoint without `siwx:` — 402 body has no `extensions['sign-in-with-x']`
   (current behavior preserved).
2. Endpoint with `siwx:` — 402 body has `extensions['sign-in-with-x']` with
   `supportedChains` matching `requirements[].network`.
3. With a real Solana keypair (`@solana/web3.js` is already a dep — see
   `package.json`), generate a SIWX message, sign it, send the encoded
   header → endpoint returns 402 with `siwx_not_paid` because no grant
   exists.
4. After calling `siwxStorage.recordPayment(resourceUrl, address, { network })`
   directly, the same SIWX request now returns 200 with the handler's
   response body.

Use `$DATABASE_URL` like prompt 02's tests; `it.skipIf(!process.env.DATABASE_URL)`.

## Verification you must perform

```bash
# 1. Lint
npx eslint api/_lib/siwx-server.js api/_lib/x402-paid-endpoint.js api/_lib/x402-paid-endpoint.siwx.test.js

# 2. Existing tests still pass
npm test

# 3. New SIWX tests pass against real DB
DATABASE_URL=$DATABASE_URL npx vitest run api/_lib/x402-paid-endpoint.siwx.test.js

# 4. A no-siwx endpoint's 402 is bit-identical (snapshot the body before and
#    after your diff to confirm).
```

## Done means

- `api/_lib/siwx-server.js` exists and is the only place that touches the
  `@x402/extensions/sign-in-with-x` API surface.
- `api/_lib/x402-paid-endpoint.js` accepts an optional `siwx:` spec and
  handles the three new responsibilities (declare, authenticate, record).
- Tests above all green.
- Existing endpoints (skill-marketplace, dance-tip, others in `api/x402/*.js`)
  are **untouched** by this prompt. Wiring them is prompt 04.
- `git diff` reviewed.

Do not commit or push.
