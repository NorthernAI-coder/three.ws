# x402 — Bazaar & Pay for VS Code

Browse any [x402](https://x402.org) bazaar, decode `402 Payment Required`
challenges, and pay-per-call paid APIs and MCP tools with USDC — without leaving
your editor.

x402 is a protocol for developers and agents, not end users — so this is
genuinely editor-native: the people wiring up paid endpoints and calling them
live in VS Code.

## What it does without any setup

You do **not** need an account, a bazaar, or any service-specific configuration
to use the core features against an arbitrary endpoint:

- **Inspect an endpoint** — run **x402: Inspect Endpoint** and paste any URL.
  It decodes the 402 challenge: every accepted network, asset, scheme, price (in
  USD), and `payTo`, flagging the one your wallet can actually satisfy.
- **Pay & call** — run **x402: Pay & Call Endpoint** with any URL. The exact USD
  amount is shown and confirmed before signing; a spending cap blocks anything
  above your limit. The response body and on-chain settlement receipt (tx hash)
  are rendered inline.

Both paths work against **any** x402-compatible endpoint. The only requirement
for paying is a funded EVM wallet key (see below).

## Optional: browse a bazaar

To populate the **x402 Bazaar** sidebar, point the extension at a discovery API
by setting **`x402.bazaarUrl`** (run **x402: Set Bazaar Discovery URL**). The
extension calls `<bazaarUrl>/api/bazaar/list` and `<bazaarUrl>/api/bazaar/search`
and renders the merged, normalised results. Filter by type, price, and tag, or
full-text search. Leave the setting empty to disable discovery — inspect/pay
still work.

Any service that exposes that discovery shape works. For example,
`https://three.ws` is a public bazaar you can use as the value.

## Scaffold a paid endpoint

Run **x402: Scaffold a Paid Endpoint** to generate a self-contained Express
server that puts an x402 paywall in front of a route using the standard
[`x402-express`](https://www.npmjs.com/package/x402-express) middleware:

```bash
npm i express x402-express
PAY_TO=0xYourReceivingAddress node summarize.js
```

The handler runs only after the buyer's USDC payment settles, and works with any
x402 client — including this extension's **Pay & call**.

## Setup (for paying)

1. Install the extension and open the **x402 Bazaar** view in the activity bar.
2. Run **x402: Set Wallet Key** and paste a funded Base USDC private key
   (`0x` + 64 hex). It is stored in your OS keychain.
3. Inspect or pay any endpoint, or set `x402.bazaarUrl` and browse a bazaar.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `x402.bazaarUrl` | `""` | Base URL of a bazaar discovery API. Empty disables discovery. |
| `x402.maxPaymentUsd` | `0.10` | Per-request spending cap, in USD. |
| `x402.confirmEachPayment` | `true` | Confirm the exact amount before signing. |
| `x402.network` | `eip155:8453` | Preferred CAIP-2 network (Base mainnet). |
| `x402.filters` | `{ "type": "http" }` | Default bazaar filters. |

## How payment works

The bundled wrapper signs a USDC **EIP-3009** `transferWithAuthorization` and
retries the request with the `X-PAYMENT` proof. The merchant verifies/settles
on-chain and returns the work plus a settlement receipt. Services that only
accept assets this EVM signer can't satisfy (e.g. Solana-only) still appear when
browsing a bazaar, but are flagged as not payable here. USDC on an EVM network
is the default and best-supported asset.

## Security

Your EVM private key lives only in VS Code SecretStorage (the OS keychain) —
never in settings, never on disk in plaintext. The status bar shows the derived
address.

## Development

```bash
npm install
npm run build        # bundle to dist/extension.js
npm run watch        # rebuild on change
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host.

Apache-2.0.
