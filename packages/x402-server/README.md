<h1 align="center">@three-ws/x402-server</h1>

<p align="center"><strong>The merchant side of <a href="https://x402.org">x402</a> — turn any HTTP endpoint into a paid one in a few lines. Issue the 402, price the work, verify and settle the payment, optionally take a fee.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@three-ws/x402-server"><img alt="npm" src="https://img.shields.io/npm/v/@three-ws/x402-server?logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@three-ws/x402-server"><img alt="downloads" src="https://img.shields.io/npm/dm/@three-ws/x402-server?color=cb3837"></a>
  <img alt="license" src="https://img.shields.io/npm/l/@three-ws/x402-server?color=3b82f6">
  <img alt="node" src="https://img.shields.io/node/v/@three-ws/x402-server?color=339933&logo=node.js">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#api">API</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#payment">Payment</a>
</p>

---

> `@three-ws/x402-server` is the **seller** half of x402: the middleware and
> primitives that make an endpoint demand payment. Wrap a route with `paid()`
> and it answers an unpaid request with a `402 Payment Required` challenge —
> listing what it `accepts` (asset · amount · network · pay-to) — then, on the
> retry that carries an `X-PAYMENT` header, it verifies the payment, runs your
> handler, settles on-chain, and returns the result with an `X-PAYMENT-RESPONSE`
> receipt. It speaks two lanes out of the box: **Solana** (facilitator-settled
> SPL `transferChecked`) and **EVM / Base** (gasless
> [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009)
> `transferWithAuthorization`). It is the server twin of any buyer-side x402
> fetch wrapper — they pay; this charges.

## Why

x402 revives HTTP `402 Payment Required` as a real payment rail: a server
answers a request with a `402` whose body lists its `accepts[]`, the client
pays, and re-sends the request with an `X-PAYMENT` header. The buyer side is a
solved problem — drop in a fetch wrapper and it pays. **The seller side is where
everyone reinvents the same machinery:** build the challenge envelope in the
exact v2 shape, advertise the right asset/fee-payer per chain, parse the
`X-PAYMENT` header, call a facilitator's `/verify`, run the work *only after*
verification, settle *only after* the work succeeds, emit the receipt, and
(optionally) skim a fee out of the price without double-charging the buyer.

This package is that machinery, done once:

- **One wrapper, a paid route.** `paid({ price, payTo })` emits the 402 and
  gates your handler behind a verified payment. USDC is the default asset — no
  extra config.
- **Two lanes, one API.** Solana and Base/EVM accepts come from the same config;
  the challenge advertises both and the buyer picks.
- **Settle after the work, never before.** Verification gates the handler;
  settlement runs after it returns `200`. A failed call moves no funds, so a
  retry can't double-charge.
- **Optional fee without surprise-billing.** A fee is split out of the listed
  price — the buyer's total is never marked up, and the fee ships inert (rate
  `0`, no recipient) until you turn it on.
- **Optional second asset.** Settle plain USDC, or advertise an additional
  Solana SPL token alongside it (e.g. `$THREE`) so a wallet can choose.

## Install

```bash
npm install @three-ws/x402-server
```

Node 18+ (uses the global `fetch`). Framework-agnostic: works as Express/Connect
middleware, a Fastify hook, or a bare `(req, res)` handler on Vercel / Node
`http`.

## Quick start

### The one-liner — `paid()`

Wrap a handler. Unpaid requests get a `402`; paid ones run the handler. USDC is
the default settlement asset, so you only need a `price` and a `payTo`:

```js
import { paid } from '@three-ws/x402-server';

export default paid(
  { price: '10000', payTo: { base: '0xYourPayoutAddress' }, network: ['base'] },
  async (req, res) => {
    res.json({ summary: await summarize(req.body.text) });
  },
);
```

`price` is in **atomic units** of the asset — `'10000'` is `$0.01` of 6-decimal
USDC. The first unpaid `GET`/`POST` returns the challenge; the buyer pays and
re-sends with `X-PAYMENT`; your handler runs once, settlement lands, and the
response carries the on-chain receipt.

> **Solana note.** A Solana accept also needs a `feePayer` — the facilitator's
> sponsor account that co-signs the SPL transfer so the buyer pays no SOL gas.
> Pass it as `feePayer: '<sponsor account>'`. Base/EVM accepts don't need one.

### A fuller route — both lanes, a fee, a receipt

```js
import { paid } from '@three-ws/x402-server';

export default paid(
  {
    price: '50000',                 // $0.05 USDC (6-decimal atomics)
    asset: 'usdc',                  // default — shown here for clarity
    payTo: {
      solana: 'YourSolanaPayoutAddress',   // SPL pay-to
      base:   '0xYourPayoutAddress',        // EVM pay-to
    },
    network: ['solana', 'base'],    // advertise both accepts; buyer chooses
    feePayer: 'FacilitatorSponsorAccount', // required for the Solana accept
    feeBps: 250,                    // optional 2.5% fee, split out of the price
    feeTo:  'YourFeeRecipient',
    description: 'Document summarization',
    serviceName: 'Acme Summarize',
  },
  async (req, res, payment) => {
    // `payment` is the verified payer + accept — present only on a paid call.
    const out = await summarize(req.body.text);
    res.json({ summary: out, billedTo: payment.payer });
  },
);
```

### Optionally advertise a second SPL token ($THREE)

Settlement is USDC by default. If you also want to accept an SPL token on
Solana, set `acceptThree: true` to add a second Solana accept after the USDC one
— wallets surface both and the buyer chooses, while a first-accept client still
settles USDC:

```js
import { paid } from '@three-ws/x402-server';

export default paid(
  {
    price: '50000',                       // USDC atomic amount
    payTo: { solana: 'YourSolanaPayoutAddress' },
    feePayer: 'FacilitatorSponsorAccount',
    acceptThree: true,                    // add a $THREE Solana accept alongside USDC
    threeAmount: '50000000',              // optional: distinct $THREE atomic amount (else reuses `price`)
  },
  async (req, res, payment) => res.json({ ok: true, billedTo: payment.payer }),
);
```

`$THREE` is an SPL mint, so it's Solana-only — `asset: 'three'` or
`acceptThree: true` on an EVM-only route throws. To settle *only* $THREE on
Solana, pass `asset: 'three'` instead of `acceptThree`.

### Under the hood — the raw 402 → sign → settle flow

`paid()` wraps four primitives you can drive directly when you don't want the
middleware:

```js
import {
  buildChallenge,   // → the 402 envelope (x402Version, resource, accepts[], extensions)
  verifyPayment,    // X-PAYMENT header → { ok, payer, accept } (calls the facilitator /verify)
  settlePayment,    // verified payment → on-chain settlement + receipt
  feeSplit,         // (price, bps) → { net, fee, recipient }
} from '@three-ws/x402-server';

export default async function handler(req, res) {
  const accepts = [
    { scheme: 'exact', network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC
      payTo: '0xYourPayoutAddress', amount: '50000',
      maxTimeoutSeconds: 60, extra: { name: 'USD Coin', version: '2', decimals: 6 } },
  ];

  const header = req.headers['x-payment'];
  if (!header) {
    // 1 — challenge. Body + base64 PAYMENT-REQUIRED header.
    const body = buildChallenge({ resourceUrl: req.url, accepts });
    res.statusCode = 402;
    res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(body)).toString('base64'));
    return res.end(JSON.stringify(body));
  }

  // 2 — verify the X-PAYMENT against the same accepts. No work runs if this fails.
  const v = await verifyPayment({ paymentHeader: header, requirements: accepts });
  if (!v.ok) { res.statusCode = 402; return res.end(JSON.stringify(v.body)); }

  // 3 — run the work, THEN settle (never before — a failed call moves no funds).
  const result = await summarize(req.body.text);
  const settled = await settlePayment({ verified: v });

  res.setHeader('X-PAYMENT-RESPONSE',
    Buffer.from(JSON.stringify(settled)).toString('base64'));
  res.json({ result, payer: v.payer, tx: settled.transaction });
}
```

The order is fixed: **verify → dispatch → settle**. Settlement is the last step,
so a handler that throws never charges.

## API

### `paid(options, handler) → (req, res) => void`

Wrap a request handler so it requires payment. Returns a standard `(req, res)`
function — mount it as Express/Connect middleware, a Vercel function, or a Node
`http` handler. Pass `adapter: fetchAdapter` for a fetch-style
`(request) => Response` runtime (Workers, Deno, Bun, Next.js route handlers).

**Options**

| Option | Type | Default | Notes |
|---|---|---|---|
| `price` | `string` | — (**required**) | Amount in **atomic units** of the asset (`'10000'` = `$0.01` of 6-decimal USDC). |
| `asset` | `'usdc' \| 'three' \| { solana?, base? }` | `'usdc'` | Settlement asset. `'usdc'` (default) resolves the canonical USDC mint/contract per chain; `'three'` pins the optional `$THREE` SPL mint (Solana-only); an object pins explicit addresses. |
| `payTo` | `{ solana?, base? }` | — (**required**) | Pay-to address per lane. At least one chain is required. |
| `network` | `('solana' \| 'base' \| 'base-sepolia')[]` | from `payTo` | Which accepts to advertise. Solana leads when both are present. |
| `feePayer` | `string` | — | Facilitator sponsor account that co-signs the Solana transfer. **Required for any Solana accept.** |
| `acceptThree` | `boolean` | `false` | Also advertise `$THREE` on the Solana lane (a second accept after USDC). |
| `threeAmount` | `string` | `price` | Atomic `$THREE` amount for the `acceptThree` entry. Omit to reuse `price`. |
| `feeBps` | `number` | `0` | Optional fee in basis points, **split out of `price`** (≤ `1000` / 10%). `0` = no fee. |
| `feeTo` | `string` | — | Fee recipient. Required when `feeBps > 0` — no recipient, no fee. |
| `facilitator` | `string` | public default | Override the x402 facilitator base URL used for `/verify` + `/settle`. |
| `maxTimeoutSeconds` | `number` | `60` | How long the buyer has to land the signed payment. |
| `description` | `string` | — | Human label for the `resource` in the challenge (shown in wallets). |
| `serviceName` / `tags` / `iconUrl` | `string` / `string[]` / `string` | — | Discovery metadata echoed into the challenge. |
| `onSettled` | `(receipt) => void` | — | Fired after a successful settlement — record the call, fire a webhook. |

**Handler** — `(req, res, payment) => unknown`. `payment` is present only on a
paid call: `{ payer, network, accept, amount }`. Throwing from the handler
returns its error to the buyer and **skips settlement** — no funds move.

### `buildChallenge(options) → Body`

Build the v2 `402` envelope. Returns `{ x402Version, error, resource, accepts,
extensions }`; the same object is what you base64 into the `PAYMENT-REQUIRED`
header. Accepts the ergonomic `{ price, asset, payTo, ... }` shape above, or a
pre-built `accepts[]` in the canonical shape:

```ts
{ scheme: 'exact', network, asset, payTo, amount, maxTimeoutSeconds,
  extra: { name, decimals, feePayer? } }   // feePayer required on Solana
```

### `verifyPayment({ paymentHeader, requirements }) → Promise<Verified>`

Decode the base64 `X-PAYMENT` header and verify it against `requirements` (your
`accepts[]`) via the facilitator's `/verify`. Returns `{ ok, payer, accept }` on
success, or `{ ok: false, body }` (a fresh `402` body) on a rejected/under-paid
payment. **Call your handler only when `ok`.**

### `settlePayment({ verified }) → Promise<Receipt>`

Broadcast/settle the verified payment and return the receipt
`{ network, payer, transaction }`. Run this **after** the work succeeds. The
returned object is what you base64 into the `X-PAYMENT-RESPONSE` header.

### `feeSplit(priceAtomics, bps, recipient) → { net, fee, recipient } | null`

Split an optional fee out of the listed price: `fee = floor(price × bps /
10_000)`, `net = price − fee`. Returns `null` when no fee applies (rate `0`, no
recipient, or a sub-atomic fee) so the buyer is charged the full price and the
creator receives all of it. `bps` is clamped to `[0, 1000]`.

### `createX402Server(options) → client`

Create a client bound to a facilitator URL / fetch / auth headers, exposing the
same `buildChallenge` / `verifyPayment` / `settlePayment` / `paid` methods. Use
it to reuse a facilitator override or a custom `fetch` across many routes:

```js
import { createX402Server } from '@three-ws/x402-server';

const server = createX402Server({ facilitator: 'https://your-facilitator.example' });
export default server.paid({ price: '10000', payTo: { base: '0xPayout' }, network: ['base'] }, handler);
```

## How it works

```
buyer request (no X-PAYMENT)
        │
        ▼
   ┌──────────────┐  402  ┌──────────────────────────────────────────────┐
   │ buildChallenge├──────▶ accepts[]:  Solana (exact, feePayer)          │
   │              │       │             Base/EVM (EIP-3009 transferWith…) │
   └──────────────┘       └──────────────────────────────────────────────┘
        │ buyer signs (wallet) and retries with X-PAYMENT
        ▼
   verifyPayment ──▶ facilitator /verify ──▶ { ok, payer, accept }
        │ ok
        ▼
   your handler runs the work  ◀── settlement has NOT happened yet
        │ returns 200
        ▼
   settlePayment ──▶ on-chain settle ──▶ X-PAYMENT-RESPONSE receipt
```

The buyer never signs an instruction your server can't verify. On **Solana** the
accept advertises a `feePayer` (the facilitator's sponsor account); the buyer's
wallet signs an SPL `transferChecked` of the named mint to `payTo`, the
facilitator co-signs as fee payer and lands it — the buyer pays no SOL gas. On
**Base/EVM** the buyer signs an EIP-3009 `transferWithAuthorization` typed-data
message locally (no on-chain tx, no gas) and the facilitator submits it;
settlement is verified by scanning the mined tx for a USDC `Transfer` to `payTo`
of at least the expected amount, with a confirmation floor against reorgs.

### Lanes

| Lane | Network id | Scheme | Buyer signs | Gas |
|---|---|---|---|---|
| **Solana** | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `exact` | SPL `transferChecked` (facilitator co-signs) | facilitator pays |
| **Base** | `eip155:8453` | `exact` (EIP-3009) | `transferWithAuthorization` typed data | facilitator pays |
| Base Sepolia | `eip155:84532` | `exact` (EIP-3009) | same | facilitator pays |

Solana leads the `accepts[]` so first-accept clients settle there; advertise
`network: ['base']` (or both) to lead with EVM.

The default facilitator is PayAI's public x402 facilitator. Override it
per-route with the `facilitator` option, or globally via the
`X402_FACILITATOR_URL` environment variable.

## Payment

Prices are quoted and charged in **atomic units** of the settlement asset — USDC
is 6-decimal, so `1_000_000` = `$1.00`. The buyer's total is exactly `price`;
the optional fee is carved *out* of it:

| `feeBps` | On a `$1.00` (`1000000`) call | Creator nets | Fee |
|---|---|---|---|
| `0` (default) | buyer pays `$1.00` | `$1.00` | — |
| `250` (2.5%) | buyer pays `$1.00` | `$0.975` | `$0.025` |
| `1000` (10%, max) | buyer pays `$1.00` | `$0.90` | `$0.10` |

The fee applies **only** when both `feeBps > 0` **and** `feeTo` is set, so an
unconfigured server charges no fee — the fee feature ships inert and never
surprise-bills on deploy. On Solana the fee is an extra `transferChecked` in the
*same* transaction the buyer signs (one signature, no custody, atomic); the
buyer sees and signs it.

### Settlement assets

USDC is the default and needs no extra config. You can additionally advertise an
SPL token on Solana — this package ships `$THREE`
(`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) as a built-in option via
`acceptThree: true` or `asset: 'three'`. Any other mint can be pinned with
`asset: { solana: '<mint>' }`. SPL tokens are Solana-only; advertising one on an
EVM lane throws rather than silently falling back to USDC.

## Errors & edge cases

`verifyPayment` returns a structured result rather than throwing on a bad
payment, and `paid()` maps every state to the right HTTP status:

| Code | HTTP | Meaning | What the buyer sees / does |
|---|---|---|---|
| `payment_required` | 402 | No `X-PAYMENT`, or the header failed `/verify`. | A fresh challenge — pay and retry. |
| `invalid_payment` | 402 | The signed tx doesn't pay the declared amount/asset/recipient. | Re-sign against the advertised accept. |
| `missing_fee_payer` | 422 | A Solana accept omitted `extra.feePayer`. | Server misconfig — set the `feePayer`. |
| `unsupported_network` | 400 | Buyer paid a network the route doesn't advertise. | Pick an advertised accept. |
| `facilitator_unreachable` | 502 | The facilitator `/verify` or `/settle` is down. | **No funds moved** — safe to retry. |
| `settle_uncertain` | 502 | Verified + work ran, but settlement status is unknown. | Check on-chain before retrying to avoid double-pay. |

Two invariants make these safe: verification runs **before** your handler (a bad
payment never triggers the work), and settlement runs **after** it (a failed
handler never charges). A `429` from your upstream can be retried with the
*same* signed payment, because settlement only happens once the work succeeds.

All thrown errors are instances of the exported `X402Error` class, carrying a
stable `.code` and HTTP `.status`.

## Examples

**Express — meter an existing API (USDC on Base)**

```js
import express from 'express';
import { paid } from '@three-ws/x402-server';

const app = express();
app.use(express.json());

app.post('/v1/embed', paid(
  { price: '2000', payTo: { base: '0xYourPayoutAddress' }, network: ['base'] },
  async (req, res) => res.json({ vector: await embed(req.body.text) }),
));

app.listen(3000);
```

**Vercel / Node `http` — a paid serverless function**

```js
import { paid } from '@three-ws/x402-server';

export default paid(
  { price: '100000', payTo: { base: '0xYourPayoutAddress' }, network: ['base'] },
  async (req, res, payment) => {
    res.json({ report: await generate(req.body.topic), billedTo: payment.payer });
  },
);
```

**Fetch-style runtime — Workers / Deno / Next.js route handler**

```js
import { paid, fetchAdapter } from '@three-ws/x402-server';

export const POST = paid(
  { price: '5000', payTo: { base: '0xYourPayoutAddress' }, network: ['base'], adapter: fetchAdapter },
  async (request, payment) => {
    const body = await request.json();
    return Response.json({ result: await run(body), billedTo: payment.payer });
  },
);
```

**Record every paid call**

```js
export default paid(
  {
    price: '5000',
    payTo: { base: '0xYourPayoutAddress' }, network: ['base'],
    serviceName: 'Pose seeds', tags: ['3d', 'animation'],
    onSettled: (receipt) => recordCall(receipt),   // feed your dashboard / webhook
  },
  async (req, res) => res.json({ seed: await poseSeed(req.body.prompt) }),
);
```

A buyer running any x402-aware `fetch` wrapper calls any of these with a plain
`fetch` — the `402` is paid automatically and the result comes back as if the
endpoint were free.

## License

MIT
