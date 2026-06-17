# Hosting the x402 live demo on `live.ibm.com`

`x402-demo.html` is a self-contained page that demonstrates the x402 micropayment
protocol: a visitor pays **$0.001 USDC** from their own wallet to call a real three.ws data
API, settled on-chain on Base or Solana. This guide is everything the IBM web team needs to
host it.

## What it demonstrates (one paragraph)

x402 reactivates the dormant HTTP `402 Payment Required` status as a payment rail. A normal
request to a paid endpoint returns `402` with machine-readable terms (amount, asset, network,
recipient). The visitor's wallet signs a gasless stablecoin authorization, the request is
retried with an `X-PAYMENT` header, and the call settles on-chain in about a second — no API
key, no account, no invoice. The page shows the live `402` challenge, runs a real paid call,
and renders the response plus the on-chain transaction receipt.

## What to upload

Copy these to the same directory on the host (paths are relative, so they must stay together):

```
x402-demo.html
fonts/
  IBMPlexSans-300.woff2
  IBMPlexSans-400.woff2
  IBMPlexSans-500.woff2
  IBMPlexSans-600.woff2
  IBMPlexMono-400.woff2
  IBMPlexMono-500.woff2
```

Everything else (the payment widget, the API, the explorer links) is loaded at runtime from
`https://three.ws` and the public chain explorers. There is **no build step** and **no
backend** to deploy. IBM Plex is self-hosted from `fonts/` so the page needs no third-party
font CDN.

## Content-Security-Policy

The page runs under **the host's CSP**. Pick one tier. (If `live.ibm.com` sends no CSP, the
page works as-is; these are for hardened hosts.)

### Tier 1 — Strict (Base / MetaMask only, recommended default)

The Base payment path signs entirely in-browser; its only network dependencies are the
three.ws widget and the three.ws API. Nothing loads from a third-party CDN.

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self' https://three.ws 'unsafe-inline';
  connect-src https://three.ws;
  style-src 'self' 'unsafe-inline';
  font-src 'self';
  img-src 'self' data:;
  base-uri 'self';
```

Under this policy the Solana button will fail gracefully (its dependencies are blocked) while
the Base button works fully.

> `'unsafe-inline'` covers the page's inline `<style>` and the small inline bootstrap
> `<script>`. If IBM requires nonces, add a per-response nonce to the inline `<style>` and
> `<script>` tags instead of `'unsafe-inline'`.

### Tier 2 — Full (Base + Solana / Phantom)

The Solana path dynamic-imports `@solana/web3.js` from `esm.sh` and calls a three.ws helper.
Add those origins:

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self' https://three.ws https://esm.sh 'unsafe-inline';
  connect-src https://three.ws https://esm.sh;
  style-src 'self' 'unsafe-inline';
  font-src 'self';
  img-src 'self' data:;
  base-uri 'self';
```

## Visitor requirements

- A browser wallet: **MetaMask** (Base) or **Phantom** (Solana).
- At least **$0.001 USDC on mainnet** in that wallet. The payment is a gasless signature; the
  network fee is sponsored by the x402 facilitator, so the visitor only spends the tenth of a
  cent.
- On mobile, wallets inject only inside their own in-app browser — the page tells visitors to
  open it there. Without a wallet, the page still shows the live `402` challenge (read-only).

## Top-level page vs. iframe

Host it as a **top-level page** for best results: browser wallet extensions inject reliably
into top-level documents, and the payment modal has full screen real estate. It can be
embedded in an `<iframe>`, but some browsers restrict wallet-extension injection into
cross-origin iframes — if you must iframe it, test the wallet flow in your target browsers
first, or link out to the standalone page.

## Cross-origin (already handled)

three.ws serves the API and widget with `Access-Control-Allow-Origin: *` and exposes the x402
payment headers, so calls from `live.ibm.com` work cross-origin with no extra configuration on
either side.

## Note on branding

The page uses a neutral "IBM · Business Partner" wordmark lockup. Confirm the exact mark and
partnership wording against IBM brand guidelines before public launch.
