# Hosting the x402 live demo on `live.ibm.com`

`x402-demo.html` is a self-contained page that demonstrates the x402 micropayment
protocol: a visitor pays **$0.001 USDC** from their own wallet to call a real three.ws data
API, settled on-chain on Base or Solana. This guide is everything the IBM web team needs to
host it.

> **Reference deployment:** a byte-for-byte copy of this exact file runs at
> <https://three.ws/ibm/x402-demo>. Compare your hosted copy against it, or link to it
> directly if you'd rather not self-host.

## What it demonstrates

The page is a **live showcase of the IBM × three.ws partnership** — five real, unmocked demos
presented in sequence, each running against production three.ws systems. The hero frames the
partnership and the lineup; everything below is interactive. The lineup leads with **Forge**
(Demo 01) because it needs no wallet — anyone can try it instantly — then moves to the x402
payment demo (Demo 02), the 3D agent (Demo 03), Play (Demo 04), and IRL (Demo 05).

**Demo 02 · x402 payments.** x402 reactivates the dormant HTTP `402 Payment Required` status as
a payment rail. A normal request to a paid endpoint returns `402` with machine-readable terms
(amount, asset, network, recipient). The visitor's wallet signs a gasless stablecoin
authorization, the request is retried with an `X-PAYMENT` header, and the call settles on-chain
in about a second — no API key, no account, no invoice. The page shows the live `402`
challenge, runs a real paid call, and renders the response plus the on-chain receipt.

## The 3D + agent layer (Demos 01, 03–05)

Beyond the payment demo the page embeds four more live three.ws surfaces, all loaded at runtime
from `https://three.ws` (still no build step, still no backend):

- **Demo 01 · Forge, and Demos 04–05 · Play / IRL** — each is its own full-size section
  (Creation, Worlds, Reality) with an explanation and the real `three.ws/forge`,
  `three.ws/play`, and `three.ws/irl` surface embedded full-width in an `<iframe>`. They
  lazy-load as each section nears the viewport (so the heavy apps never load at once), and each
  has a one-tap **Full screen** button plus a **new-tab** fallback. IRL is AR, so it's best on a
  phone and only prompts for the camera when the visitor chooses to enable it.
- **Demo 03 · A 3D AI agent** — the `<agent-3d>` web component renders a WebGL avatar that runs
  its own brain in the browser and **reacts to the payment**: it celebrates and announces the
  settlement the moment the visitor's `402` call clears. It lazy-boots only when scrolled into
  view, and degrades to a calm skeleton if its script is blocked.

Because these load the agent runtime, an avatar GLB, the agent's model endpoint, and framed
three.ws pages, the **Tier 2** CSP below adds `https://three.ws` to `frame-src`/`img-src` and
`blob:` to `worker-src`. If you only want the x402 payment demo and not the 3D/agent layer,
delete the `#forge`, `#agent`, `#play`, and `#irl` `<section>`s plus the `agent-3d.js`
`<script>` tag, and the
**Tier 1** policy is all you need.

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

> Under Tier 1 the **3D agent layer** (the agent, and the Forge/Play/IRL rooms) is also
> blocked — it needs `frame-src`, `worker-src blob:`, and `https://three.ws` in `img-src`,
> which Tier 1 omits. Use Tier 2 to enable it, or remove those sections (see above) to keep
> Tier 1.

### Tier 2 — Full (Base + Solana, plus the 3D agent layer)

The Solana path dynamic-imports `@solana/web3.js` from `esm.sh`. The agent layer adds the
`<agent-3d>` runtime + avatar GLB + model endpoint (all `https://three.ws`), a WebGL/worker
`blob:` context, and framed three.ws surfaces. One policy covers all of it:

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self' https://three.ws https://esm.sh 'unsafe-inline';
  connect-src https://three.ws https://esm.sh;
  style-src 'self' 'unsafe-inline';
  font-src 'self';
  img-src 'self' data: blob: https://three.ws;
  worker-src 'self' blob:;
  frame-src https://three.ws;
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

## Embed the pay button anywhere else

The whole flow is one drop-in script plus any element carrying a `data-x402-endpoint`. The
same eight lines that power the demo work standalone — drop them into a blog post, a docs
page, or a product page to add a working pay-per-call paywall with no framework, build step,
or SDK:

```html
<script type="module" src="https://three.ws/x402.js"></script>

<button
  data-x402-endpoint="https://three.ws/api/x402/symbol-availability?ticker=GRANITE"
  data-x402-merchant="three.ws"
  data-x402-action="Check symbol">
  Pay $0.001 & run
</button>
```

On click the script reads the endpoint's `402` challenge, opens the visitor's wallet for a
gasless USDC authorization, retries the call, and dispatches `x402:result` / `x402:error`
events with the response and on-chain receipt. Point `data-x402-endpoint` at any three.ws
x402 GET endpoint (browse them in the [Bazaar](https://three.ws/bazaar)) to charge for a
different call. The same Tier 1 / Tier 2 CSP guidance above applies to the host page.

## Note on branding

The page uses a neutral "IBM · Business Partner" wordmark lockup. Confirm the exact mark and
partnership wording against IBM brand guidelines before public launch.
