<p align="center">
  <a href="https://three.ws"><img src="https://three.ws/three-ws-mcp-icon.svg" width="72" height="72" alt="three.ws" /></a>
</p>

<h1 align="center">@three-ws/vanity</h1>

<p align="center"><strong>Mine Solana vanity addresses — custom prefix and/or suffix — fast, WASM-accelerated, in the browser or Node.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@three-ws/vanity"><img alt="npm" src="https://img.shields.io/npm/v/@three-ws/vanity?logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@three-ws/vanity"><img alt="downloads" src="https://img.shields.io/npm/dm/@three-ws/vanity?color=cb3837"></a>
  <img alt="license" src="https://img.shields.io/npm/l/@three-ws/vanity?color=3b82f6">
  <img alt="node" src="https://img.shields.io/node/v/@three-ws/vanity?color=339933&logo=node.js">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#api">API</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#pricing">Pricing</a> ·
  <a href="https://three.ws/vanity">three.ws</a>
</p>

---

> `@three-ws/vanity` grinds Solana addresses whose Base58 form starts with a
> prefix and/or ends with a suffix of your choosing — `THREE…`, `…pump`, your
> ticker, your handle. The hot loop is a real Rust + `ed25519-dalek` + `bs58`
> grinder compiled to WebAssembly (it already ships in the three.ws repo at
> `src/solana/vanity/wasm`, ~25k keypairs/sec single-threaded). In the browser
> it fans that WASM module across every CPU core via a Web Worker pool; in Node
> it runs the same module on the request thread. Keys are generated entirely on
> your machine and **never leave it**. For agents that can't or won't run WASM,
> the same capability is exposed as a paid x402 HTTP endpoint and the
> `vanity_grinder` MCP tool.

## Why

Vanity grinding is embarrassingly parallel keypair generation: make an Ed25519
keypair, Base58-encode the public key, check the prefix/suffix, repeat until a
hit. The naïve version is twenty lines of JavaScript — and unusably slow,
because pure-JS Ed25519 manages a few thousand candidates per second. A 4-char
prefix expects ~11M attempts. You need native-speed crypto, real
parallelism, and an honest difficulty model so you don't kick off a grind that
finishes next century.

`@three-ws/vanity` is that, done once:

- **WASM-fast, not JS-slow.** The Rust grinder runs the keygen → encode → match
  loop in fixed-size batches inside WebAssembly. ~25k/sec per thread.
- **Every core, automatically.** The browser path races one worker per logical
  core (capped, configurable). First match wins; the rest are killed instantly.
- **Difficulty up front.** `expectedAttempts()` and a live ETA tell you whether
  a pattern is seconds or years *before* you commit a fan.
- **Keys stay local.** The grind happens client-side. No address, no secret key,
  no telemetry is sent anywhere. That is the entire security posture (see below).
- **A paid lane when you can't grind.** Short patterns (≤3 chars) are available
  over x402 — pay per call in USDC, get a fresh keypair, no toolchain.

This is the SDK twin of the [3D Studio MCP server](https://three.ws/mcp)'s
`vanity_grinder` tool and the [`/vanity`](https://three.ws/vanity) browser
grinder — the same engine, exposed as plain functions.

## Install

```bash
npm install @three-ws/vanity
```

Zero runtime dependencies — the WASM binary is bundled. Works in Node 18+ and
any browser with WebAssembly + Web Workers. To turn the 64-byte secret key into
a usable wallet, add [`@solana/web3.js`](https://www.npmjs.com/package/@solana/web3.js)
(peer, optional): `Keypair.fromSecretKey(result.secretKey)`.

## Quick start

Grind an address that starts with `THREE`, across every core:

```js
import { grind } from '@three-ws/vanity';

const { publicKey, secretKey, attempts, durationMs } = await grind({
  prefix: 'THREE',
});

console.log(publicKey);  // → THREE… (Base58)
console.log(secretKey);  // → Uint8Array(64), Solana's standard keypair layout
```

`secretKey` is the 64-byte Ed25519 layout (`[32-byte seed][32-byte pubkey]`),
ready for `Keypair.fromSecretKey()`:

```js
import { Keypair } from '@solana/web3.js';
const wallet = Keypair.fromSecretKey(secretKey);
```

A fuller run — suffix, case-insensitive, live progress + ETA, cancellable:

```js
import { grind, expectedAttempts } from '@three-ws/vanity';

const controller = new AbortController();
console.log('expected attempts:', expectedAttempts({ prefix: 'ag', suffix: 'nt' }));

const result = await grind({
  prefix: 'ag',
  suffix: 'nt',
  ignoreCase: true,
  maxWorkers: 6,
  signal: controller.signal,
  onProgress: ({ attempts, rate, eta }) => {
    console.log(`${attempts.toLocaleString()} tried · ${Math.round(rate)}/s · ETA ${eta}`);
  },
});
// later, to bail out:  controller.abort();
```

Pick the **suffix** when you can: the leading characters of a Base58-encoded
32-byte key are not uniformly distributed, so a given prefix can be markedly
harder than `58^n` predicts. Suffix characters are uniform.

## API

### `grind(options) → Promise<GrindResult>`

Grind for a vanity address. In the browser it spawns a Web Worker pool driving
the WASM module; in Node it runs the WASM module on the calling thread. Rejects
with `AbortError` if `signal` aborts.

| Option | Type | Default | Notes |
|---|---|---|---|
| `prefix` | `string` | — | Base58 prefix the address must start with. |
| `suffix` | `string` | — | Base58 suffix the address must end with. |
| `ignoreCase` | `boolean` | `false` | Case-insensitive match (folds upper+lower Base58 chars). |
| `maxWorkers` | `number` | `min(cores, 8)` | Browser worker count, clamped to `hardwareConcurrency`. |
| `signal` | `AbortSignal` | — | Cancel the grind. |
| `controller` | `object` | — | Opt-in handle; `grind` attaches `pause()`, `resume()`, `stop()` once the pool is live. |
| `onProgress` | `(p) => void` | — | Called ~every 250ms with `{ attempts, rate, eta, paused? }`. |

At least one of `prefix` / `suffix` is required. Both are validated against the
Base58 alphabet (`0 O I l` excluded) and a 6-char-per-pattern ceiling before any
work starts — an invalid pattern rejects immediately with a specific message.

**Returns** `GrindResult`

| Field | Type | Notes |
|---|---|---|
| `publicKey` | `string` | Base58 address (matches your pattern). |
| `secretKey` | `Uint8Array(64)` | Ed25519 secret key — `Keypair.fromSecretKey()`-compatible. |
| `attempts` | `number` | Total keypairs tried across all workers. |
| `durationMs` | `number` | Wall-clock duration. |
| `workers` | `number` | Workers used (browser; `1` in Node). |

**`onProgress` payload**

| Field | Type | Notes |
|---|---|---|
| `attempts` | `number` | Running total across the pool. |
| `rate` | `number` | Combined keypairs/sec. |
| `eta` | `string` | Human estimate of remaining time — `"~12 seconds"`, `"~3 hours"`, `"paused"`, `"unknown"`. |
| `paused` | `boolean` | Present and `true` while paused. |

### `expectedAttempts({ prefix?, suffix?, ignoreCase? }) → number`

The mean of the geometric distribution — `58^n` adjusted for case-insensitivity
per character. Use it to gate a pattern before grinding (e.g. warn past a
threshold).

### `validatePattern(pattern) → { valid, errors }`

Validate a single prefix or suffix against the Base58 alphabet and length ceiling.
Returns specific, user-facing error strings (e.g. `invalid character 'O'
(uppercase o) — use other uppercase letters`).

### `grindViaApi(options) → Promise<ApiResult>` — the paid lane

For environments without WASM/Workers, grind a short pattern over the hosted
[x402](https://x402.org) endpoint instead of locally. Wraps
`GET /api/x402/vanity`. Combined pattern capped at 3 chars; pass an
x402-capable `fetch` to settle the 402 automatically.

| Option | Type | Notes |
|---|---|---|
| `prefix` / `suffix` | `string` | Combined ≤ 3 chars. |
| `ignoreCase` | `boolean` | Case-insensitive match. |
| `format` | `'keypair' \| 'mnemonic'` | `mnemonic` returns an importable BIP-39 phrase (≤ 2 chars, ~100× slower). |
| `strength` | `128 \| 256` | Mnemonic only: 12 or 24 words. |
| `sealTo` | `string` | Optional X25519 public key — the secret is ECIES-sealed to you and the plaintext is omitted from the response. |
| `fetch` | `typeof fetch` | An x402-wrapped fetch (see [`@three-ws/x402-fetch`](https://www.npmjs.com/package/@three-ws/x402-fetch)). |

Response fields: `address`, `secretKeyBase58`, `secretKey` (64-int array),
`attempts`, `durationMs`, `expectedAttempts`, `network`, `explorerUrl`, and —
for `format=mnemonic` — `mnemonic`, `wordCount`, `derivationPath`.

## How it works

Two backends, one `grind()` surface. Picked by environment.

```
                        grind({ prefix, suffix })
                                  │
              ┌───────── browser ─┴─ Node ──────────┐
              ▼                                      ▼
     Web Worker pool  (1/core, capped)      WASM on the request thread
              │  start/pause/resume/stop             │  batched, time-budgeted
              ▼                                       ▼
    ┌──────────────────────────────────────────────────────────┐
    │  Rust + ed25519-dalek + bs58  →  WebAssembly               │
    │  grind(prefix, suffix, ignoreCase, batchSize, seed)        │
    │  → null  | { publicKey: string, secretKey: Uint8Array(64) }│
    └──────────────────────────────────────────────────────────┘
              │ first match wins → pool terminated
              ▼
        { publicKey, secretKey, attempts, durationMs }
```

- **WASM core** — the hot loop (CSPRNG seed → Ed25519 keygen → Base58 encode →
  prefix/suffix compare) runs entirely inside WebAssembly in fixed-size batches.
  Built from `crates/vanity-grinder` via `npm run build:wasm`; the compiled
  artifact is checked into `src/solana/vanity/wasm/` so there's no Rust
  toolchain at install time.
- **Browser pool** — one worker per logical core (default `min(cores, 8)`).
  Each worker yields to its event loop between batches, so `pause`/`stop`
  messages land within one batch (≤~200ms). Pausing genuinely frees the cores;
  resume continues the attempt count.
- **Node path** — no Worker pool in a serverless function, so the same WASM
  module runs single-threaded under a wall-clock budget. The hosted endpoint
  caps patterns at 3 chars for this reason; anything longer belongs in the
  browser pool.

## Security

This is the part that matters for a secret-key tool.

- **Keys are generated locally and never transmitted.** In both the browser and
  Node SDK paths, the keypair is produced on your machine inside WASM. No
  address, no secret key, no prefix is sent to three.ws or anywhere else. There
  is no network call on the local `grind()` path.
- **The secret exists once, in memory.** `grind()` resolves with the
  `secretKey`; nothing persists it. Capture it (write the wallet, store it
  encrypted) before the value goes out of scope.
- **The paid lane is fresh-per-request and never stored.** The x402 endpoint
  grinds a brand-new keypair per call and returns it once over TLS; it is never
  written to disk and is stripped from the idempotency cache. Because that
  secret transits the network, prefer `sealTo` (ECIES-seal it to your X25519
  key so the plaintext never appears in the response or any proxy log) — or just
  grind locally.
- **MCP responses can be logged.** The `vanity_grinder` MCP tool returns a real,
  spendable secret in plaintext over the MCP channel, which the host (Claude
  Desktop, Cursor, any proxy) may log. Import it immediately and never reuse a
  secret that may have been logged. For the strongest guarantee, grind locally
  with this SDK.

## Pricing

The local `grind()` path is free and unlimited — it's your CPU. Pricing only
applies to the paid `grindViaApi()` HTTP lane, which is difficulty-tiered
(each Base58 character multiplies expected work by ~58):

| Combined chars | `keypair` | `mnemonic` |
|---|---|---|
| 1 | **$0.01** | **$0.05** |
| 2 | **$0.05** | **$0.50** |
| 3 | **$0.25** | — (capped at 2) |

A [provably-fair lane](https://three.ws/vanity/verify) (`GET
/api/x402/vanity-verifiable`, $0.02–$0.40) grinds under a commit–reveal protocol
and returns a signed receipt you can verify entirely client-side. Settlement
runs only **after** a successful grind, so an exhausted budget costs nothing and
can be retried. Pay per call in USDC on Base or Solana mainnet — no API keys, no
accounts. Pair with [`@three-ws/x402-fetch`](https://www.npmjs.com/package/@three-ws/x402-fetch)
to automate the 402.

## Errors & edge cases

The local `grind()` path rejects on:

| Condition | Surfaces as |
|---|---|
| No `prefix` and no `suffix` | `Error: prefix or suffix is required` |
| Non-Base58 char (`0 O I l`, etc.) | `Error: invalid prefix: invalid character 'O' …` |
| Pattern longer than 6 chars | `Error: length 7 exceeds maximum of 6` |
| `signal` aborted | `AbortError` (`DOMException`) |
| Worker crash (browser) | The worker's error, rejecting the promise |

The paid `grindViaApi()` path surfaces the endpoint's HTTP errors:

| `code` | HTTP | Meaning | Recovery |
|---|---|---|---|
| `validation_error` | 400 | Bad pattern, format, or strength. | Fix the input. |
| `pattern_too_long` | 400 | Combined pattern > server cap (3, or 2 for mnemonic). | Grind locally with `grind()`. |
| `grind_exhausted` | 504 | Time budget elapsed without a hit (rare, <1% at 3 chars). | Retry — you weren't charged. |
| `rate_limited` | 429 | Pre-payment probe rate limit. | Honour `retry-after`. |

Long patterns are designed, not crashed: the server tells you to move to the
browser pool, where there's no cap and every core is in play.

## Examples

**Node — grind, then write a Solana CLI keypair file:**

```js
import { grind } from '@three-ws/vanity';
import { writeFileSync } from 'node:fs';

const { publicKey, secretKey } = await grind({ suffix: 'pump' });
writeFileSync(`${publicKey}.json`, JSON.stringify(Array.from(secretKey)));
// → solana config set --keypair ./<address>.json
```

**Browser — pause/resume a long grind with a controller:**

```js
import { grind } from '@three-ws/vanity';

const controller = {};
const job = grind({ prefix: 'THREE', controller, onProgress: render });

document.querySelector('#pause').onclick  = () => controller.pause();
document.querySelector('#resume').onclick = () => controller.resume();
document.querySelector('#stop').onclick   = () => controller.stop();

const { publicKey, secretKey } = await job;
```

**Agent — the free MCP tool, no toolchain:**

```js
// The same capability ships as the `vanity_grinder` MCP tool on the
// three.ws MCP server. Or call the paid HTTP lane directly:
import { grindViaApi } from '@three-ws/vanity';
import { wrapFetchWithPayment } from '@three-ws/x402-fetch';

const { address, secretKeyBase58 } = await grindViaApi({
  prefix: 'ag',
  fetch: wrapFetchWithPayment(fetch, payer),
});
```

## Related

- [`@three-ws/x402-fetch`](https://www.npmjs.com/package/@three-ws/x402-fetch) — auto-pay the 402 on the hosted grinder.
- [`@three-ws/forge`](https://www.npmjs.com/package/@three-ws/forge) — text/image → rig-ready 3D GLB, the same SDK pattern.
- [`@three-ws/pumpfun-mcp`](https://www.npmjs.com/package/@three-ws/pumpfun-mcp) — launch a token to a vanity mint you ground here.

---

<p align="center">Built by <a href="https://three.ws">three.ws</a> · The only coin is <a href="https://three.ws">$THREE</a></p>
