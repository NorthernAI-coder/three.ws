# For 25 years, HTTP 402 did nothing. three.ws just switched it on inside VS Code.

> The web's forgotten payment code is finally live, right where developers work. With the three.ws x402 extension you can discover, inspect, pay, and *publish* paid APIs by the call, in $THREE or USDC on Solana (and USDC on Base), without ever leaving the editor. This is the long version: the history, the protocol, the cryptography, the security model, and the ambitious platform it all grew out of.

---

## A status code that waited 25 years

Open the HTTP specification and walk the 4xx range. `400 Bad Request`, used constantly. `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `429 Too Many Requests`: every one of them has a job, a library, a middleware, a muscle-memory reflex in every developer alive.

Then there's `402 Payment Required`. It shipped in the earliest HTTP drafts and was immediately marked *"reserved for future use."* And there it sat. For twenty-five years the web had a status code that said, in plain language, *"you have to pay for this,"* and no standard way to actually do it.

It's not that nobody tried. The web has attempted micropayments roughly once a decade since the 1990s: W3C working groups, browser wallets, tipping widgets, metered paywalls. They all broke on the same rock: the web had no native money. Every attempt bolted payments on from the outside, which meant an account, a credit-card form, a merchant relationship, a $0.30-plus card minimum that made a one-cent API call absurd, and a login wall between you and the thing you wanted. You can't build per-call settlement on rails whose smallest viable unit is thirty cents and whose "hello" is a signup form.

Three things changed at once. Stablecoins gave the internet a unit of account that clears in seconds for fractions of a cent. On-chain settlement gave it finality without a merchant account. And AI agents (programs that call APIs on your behalf, thousands of times, with no human at the keyboard to type a card number) gave it a *reason*. An agent can't sign up for your SaaS tier. It can't remember your API key. But it can hold a wallet and pay for exactly what it uses, the instant it uses it.

That's the opening `402` was reserved for. The protocol that finally fills it is called **x402**, and three.ws brought the whole thing into the one place developers actually wire up, test, and ship paid endpoints: **VS Code.** This is the kind of thing three.ws does: take a piece of the agent economy that was theoretical and ship it as a tool you can install today.

---

## What x402 actually is

x402 is a payment protocol for developers and agents. Strip away the branding and it is four moves:

1. **You request a resource.** A plain HTTP request, `GET` or `POST`, to an endpoint that happens to cost money.
2. **The server answers `402 Payment Required`** with a machine-readable challenge. Not a paywall page for a human to squint at, but a structured envelope your code can parse: which networks it accepts, which asset, the exact price in atomic units, the payment scheme, and the address to pay.
3. **Your client signs a payment authorization** in the requested token (USDC or $THREE) and retries the *same request* with the proof attached in an `X-PAYMENT` header.
4. **The server verifies, does the work, and returns the result** plus an on-chain settlement receipt in an `x-payment-response` header.

No accounts. No API keys. No subscriptions. No "contact sales." Just per-call settlement, on-chain, in the time it takes to retry a request.

The challenge itself is a small JSON envelope (x402 version 2). Its heart is an `accepts[]` array: one entry per way you're allowed to pay. Each entry names a network in CAIP-2 form (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` for Solana mainnet, `eip155:8453` for Base), an asset, an amount in atomic units, a scheme (`exact`, pay exactly this), and a `payTo` recipient. A single endpoint can advertise several at once: pay in USDC on Solana, *or* $THREE on Solana, *or* USDC on Base. Your client picks the rail it can satisfy and signs for that one.

This is the part that matters and the part that's easy to miss: **the price and the payment instructions are data, not a webpage.** That's what makes 402 finally usable. A human never has to read it. A `fetch` wrapper reads it, a wallet signs it, and the call goes through, or an autonomous agent does the same thing at three in the morning with no one watching.

---

## Why the editor is the right place

Here's the workflow the tooling forgot.

You find a paid endpoint. To understand what it costs, you `curl` it and read a raw 402 blob by eye. To pay it, you copy an amount and an address into a separate wallet app, sign, wait, copy the transaction hash back. To confirm it settled, you open a block explorer in a browser tab. To *publish* your own paid endpoint, you clone a starter repo, wire up a facilitator, and hope you got the challenge format right. Four tools, three context switches, and a wallet holding real money one alt-tab away from the code you're writing.

Every one of those steps is something a developer does **in the editor**, or would, if the editor could do it. Discovering an API, reading its contract, calling it with a test body, checking the response, scaffolding a new one: that's the inner loop of building against any API. Payments were the one part exiled to other windows, which is exactly why paid APIs felt heavier than free ones even when the payment itself takes a second.

So we collapsed it. The **x402 Pay-per-call APIs** extension puts the entire loop (discover, inspect, pay, receive, publish) inside VS Code. The wallet lives in your OS keychain, the receipt renders next to the response, and the endpoint you scaffold is a file in your workspace. Nothing leaves the editor. That's not a convenience feature; it's the difference between paid APIs being a first-class thing you build with and a chore you avoid.

---

## What the extension does

The extension ships as `three-ws.vscode-x402` (v0.2.0, Apache-2.0, VS Code 1.85+). Its own description is blunt about the scope:

> *"Browse the x402 bazaar, decode 402 payment challenges, and pay per call for paid APIs and MCP tools in USDC or $THREE on Solana and Base, without leaving VS Code."*

Four moves, all in the editor.

### 1. Inspect any endpoint: free, read-only, no wallet

Run **`x402: Inspect Endpoint (decode 402 challenge)`**, paste a URL, and the extension makes an unpaid request and decodes whatever 402 comes back. It reads the challenge from the `payment-required` / `x-payment-required` header (base64 JSON) or the response body, then lays out every accepted requirement in plain terms: network, asset, payment scheme, price converted to USD, and the `payTo` address. The one requirement *your* wallet can actually satisfy is flagged, and each entry is tagged with its rail: Solana or EVM.

No wallet. No signing. No configuration. Inspecting is a pure read: you can point it at any x402 endpoint on the internet and see exactly what it would cost before you decide to spend a cent. Free endpoints just return their result; there's nothing to decode.

### 2. Pay & call: the real thing, with guardrails

Run **`x402: Pay & Call Endpoint`** (or hit "Pay & call" on a service in the sidebar) and you make a genuine paid request from a panel. You get a method selector and a JSON body field; the panel shows the price, and then three things happen before any key touches the request:

- **The rail is chosen automatically.** The extension inspects the 402 and routes to the right chain based on your preferences: an explicit CAIP-2 `network`, then your `preferToken` choice (`auto`, `usdc`, or `three`), then a sensible auto-order: Solana USDC first, then any Solana asset, then Base USDC, then the first payable requirement. You don't hand-pick a chain; it picks the one you can pay on.
- **The spending cap is enforced.** `threewsX402.maxPaymentUsd` defaults to **$0.10**. Anything above your cap is refused *before signing*, with a "raise cap & pay" escape hatch if you meant it.
- **You confirm the exact spend.** With `confirmEachPayment` on (the default), a dialog shows the precise USD amount, the token, the network, and the paying address. Nothing is signed until you click through it.

Then the response body and the on-chain receipt render inline: status, amount paid, paying address, token, network, and the transaction signature. The whole round trip (challenge, sign, retry, settle, receipt) happens in the panel, and you never leave the file you were in.

### 3. Browse a bazaar: discovery in the sidebar

The **x402 Bazaar** view lives in the activity bar. Point it at a discovery origin (`threewsX402.origin`, default `https://three.ws`) and it lists paid HTTP APIs and MCP tools pulled live from the bazaar's discovery API, which itself merges multiple facilitator feeds (PayAI and Coinbase CDP) into one normalized list. Filter by type (`http` / `mcp`), price, network, and tag; run a full-text search with **`x402: Search Bazaar`**; click any service to open its detail panel and pay it. Discovery and payment are the same surface: find a tool, read its contract, call it, all in the sidebar.

### 4. Scaffold your own: publisher in about a minute

Run **`x402: Scaffold a Paid Endpoint`**, answer three prompts (URL slug, price in USD, description), and the extension generates a self-contained handler at `api/x402/<slug>.js`. It follows the canonical `paidEndpoint()` pattern from the platform's own server library: it advertises a 402 challenge on an unpaid request, and runs your handler **only after payment verifies and settles on-chain.** The generated handler echoes the request as proof the whole thing is wired end to end: you replace that body with your real logic and you're a paid-API publisher. The scaffold prices in USDC on Base out of the box; adding the Solana / $THREE rail is one option flag on the server side (below).

---

## Under the hood

The extension sends your request unpaid (free endpoints just work), parses the 402, and picks a payable requirement across both rails, honoring your network and token preferences. Then, depending on the rail, one of two payment paths runs.

### The EVM rail: EIP-3009 on Base

For Base and other EVM chains, the extension uses the vendored **`@three-ws/x402-fetch`** client to sign a USDC `transferWithAuthorization` (**EIP-3009**), structured and signed as **EIP-712** typed data. EIP-3009 is the right primitive here: it lets you authorize a transfer by signature without a separate on-chain `approve`, so a single locally-produced signature *is* the payment. The message carries `from`, `to`, `value`, a `validAfter` / `validBefore` window, and a random `nonce`: signed once, submitted once, never replayable.

What's notable is that `@three-ws/x402-fetch` is **genuinely zero-dependency** (`"dependencies": {}`, verified). The entire cryptographic stack is inlined:

- **secp256k1 ECDSA**: deterministic nonces via RFC-6979 (HMAC-SHA256), low-S normalization to kill signature malleability, recoverable 65-byte signatures. Ethereum addresses are derived the canonical way: public key → keccak256 → last 20 bytes → checksum.
- **keccak256**: a pure-JavaScript Keccak-f[1600] over BigInt lanes, verified against the canonical test vectors.
- **EIP-712**: typed-data hashing that produces the 32-byte digest `eth_signTypedData_v4` would, implementing exactly the value types the payment needs (address, uintN, bytes32, bytes, string) and no more.

The only outside primitives are HMAC-SHA256 and SHA-256, taken from **Web Crypto** (`globalThis.crypto.subtle`), present in Node 18+ and every modern browser. Nothing exotic, nothing to audit but the code in front of you, and no payment SDK pulled at runtime.

### The Solana rail: the real `@x402/svm` exact scheme

For Solana, the extension does **not** use `x402-fetch` (which is EVM-only by design). It uses the real **`@x402/svm`** `ExactSvmScheme`, the same buyer that powers `@three-ws/x402-mcp` in production. It loads your Solana key (base58 or JSON byte array), builds a signer with `@solana/kit`, registers the scheme against `solana:*`, filters the challenge's accepts down to your preferred token, and signs a real SPL transfer of the selected asset:

- **USDC on Solana**, mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **$THREE**, mint `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump` (SPL, 6 decimals, Solana-native, the platform's own token)

No mocking, no stub: the same settlement path a headless agent would use.

### The common tail

Either way, the extension retries the request with an `X-PAYMENT` header carrying the base64-encoded payment payload. The merchant verifies it, does the work, settles on-chain through a facilitator, and returns the result plus a receipt in the `x-payment-response` header. The extension decodes that receipt and renders it inline (token, network, transaction signature) right under the response body.

The default facilitator that actually settles both Solana and Base is **PayAI** (`facilitator.payai.network`); Coinbase CDP shows up as one of the *discovery* feeds the bazaar merges, not as the settler. Any route can override the facilitator, so nothing is bolted to a single provider.

---

## Security you can reason about

The threat model here is simple to state: there's a private key on a developer's machine that can spend real money, and the editor is asking it to sign things. Every design choice follows from taking that seriously.

- **Keys live in the OS keychain, never on disk in plaintext.** Both the EVM key (`threewsX402.walletPrivateKey`) and the Solana key (`threewsX402.solanaSecretKey`) are stored in VS Code **SecretStorage**: Keychain on macOS, Credential Manager on Windows, libsecret on Linux. Never in `settings.json`, never in workspace config, never logged. They're entered through a masked input and only loaded into memory at the moment of payment. The status bar shows the derived addresses (◎ for Solana, ⟠ for EVM); the keys themselves never surface.
- **Two keys, two rails, independent.** The Solana and EVM wallets are separate. You can fund one and leave the other empty, and an endpoint is only payable on the rail where a key exists; if it isn't, the extension offers to set the missing one rather than failing silently.
- **The spending cap is checked before signing, not after.** `maxPaymentUsd` (default $0.10) rejects any payment over your limit *before* the key is touched. A runaway loop or a mispriced endpoint can't drain a wallet a cent at a time.
- **Every payment is confirmed with the real numbers.** With `confirmEachPayment` on, you see the exact USD amount, token, network, and payer before anything is signed. No signature happens without an explicit click.
- **Signatures can't be replayed.** EIP-3009 authorizations carry a random nonce and a validity window; Solana transfers are signed per-call. There's no reusable blanket approval sitting on-chain.

The guidance the extension itself gives is deliberately blunt: **use a dedicated, low-balance wallet.** Treat it like the petty-cash drawer, not the vault. The point of per-call micropayments is that the amounts are tiny, so the wallet backing them should be too.

---

## Two tokens, one challenge

A detail worth pulling out: on the merchant side, **`@three-ws/x402-server`** can advertise **both USDC and $THREE in a single 402 challenge**. Turn on `acceptThree` and a Solana endpoint emits two accepts (USDC first, then $THREE) inside the same envelope. The buyer picks. That's the whole point of the `accepts[]` array being plural: a publisher doesn't have to choose their audience's currency in advance. A USDC-holding agent and a $THREE-holding agent hit the same URL and each pays in what it carries. `$THREE` is the platform's native token and the one it promotes; USDC is the neutral stablecoin rail. The protocol lets both ride in one response, and the extension routes to whichever you told it to prefer.

---

## No lock-in

The extension has no dependency on any specific provider. Point it at *any* compliant x402 endpoint, or *any* bazaar that serves the discovery API. It's the open protocol all the way down. Discovery is optional: inspecting and paying a single URL needs zero configuration, no origin, no account. The vendored client means there's no payment SDK fetched at runtime and no service you're implicitly trusting beyond the merchant you chose to pay. That openness is a point of pride: three.ws built the extension to serve the whole x402 ecosystem, not to fence it in. It works with any compliant endpoint or bazaar, three.ws's own or anyone else's, which is exactly how a tool from one team becomes infrastructure for everyone.

---

## Build a paid API in 60 seconds

The scaffold command is the fast path, but here's the shape of what it produces, because it's the same server library any publisher uses. `@three-ws/x402-server`'s `paid()` wrapper gates a handler behind payment:

```js
import { paid } from '@three-ws/x402-server';

export default paid(
  {
    price: '10000',                         // 0.01 USDC, in atomic units (6 decimals)
    asset: 'usdc',
    acceptThree: true,                      // also advertise $THREE in the same 402
    payTo: { solana: '<your-sol-addr>', base: '0x<your-base-addr>' },
  },
  async (req, res) => {
    // Runs ONLY after payment verifies and settles on-chain.
    const body = await readJson(req);
    return { ok: true, result: doTheWork(body) };
  },
);
```

An unpaid request gets a 402 with your price on both rails. A paid request gets verified against the facilitator, runs your handler, settles, and returns the work with a receipt. The library also gives you `buildChallenge`, `verifyPayment`, `settlePayment`, and a `feeSplit` helper that carves a platform fee out of the price without ever marking it up to the buyer. The whole thing is zero-dependency and ESM, and it defaults to the PayAI facilitator for Solana + Base; override per route if you want your own.

That's the symmetry the extension is built around: **`x402-fetch` / `@x402/svm` on the buyer side, `x402-server` on the seller side, and one editor that speaks both.** You can inspect someone's endpoint and scaffold your own in the same window, minutes apart.

---

## Where x402 fits: the three.ws ecosystem

This extension is one surface of **three.ws**, an open-source, browser-native platform for 3D AI agents that can *earn, pay, and coordinate.* The same team that wired 402 into your editor is building the whole loop around it: give an AI a body, a brain, an on-chain identity, and a wallet, then let agents transact with each other in real time. It ships from a single npm-workspaces monorepo, published under the **`@three-ws`** scope. `$THREE` (Solana: `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the native token.

### What we're building

Type a prompt and **Forge** turns text, an image, or a sketch into a textured, rig-ready 3D model: free draft tier, no account. Rig it, animate it, give it an LLM brain, embed it anywhere with `<agent-3d>`, register it on-chain (ERC-8004), and let it pay for tools and get paid for skills over x402. The extension you just installed is the *payments edge* of that platform, pulled out so any developer can use it standalone. You don't need a single 3D asset to get value from it.

### The x402 stack

- **`@three-ws/x402-fetch`**: the zero-dependency payment client the extension vendors for the EVM rail. `withX402(wallet)` wraps any `fetch` so it transparently pays USDC/EIP-3009 challenges on Base and retries. All crypto inlined, `dependencies: {}`.
- **`@three-ws/x402-server`**: the merchant side. Turn any endpoint paid; advertise USDC *and* $THREE in one challenge; verify and settle on Solana + Base; split a platform fee.
- **`@three-ws/x402-mcp`**: a self-custodial x402 buyer as an MCP server. Four tools (`x402_wallet`, `find_services`, `inspect_endpoint`, `pay_and_call`) that let any AI client search the bazaar, price an endpoint without paying, and pay-and-call any service in USDC or $THREE from its own Solana key, bounded by spend caps, no custodial account.
- **Native x402 endpoints on Solana and Base**, settled through the PayAI facilitator (Coinbase CDP is a bazaar discovery feed). The sibling **`@three-ws/naming-mcp`** resolves `@username`, `*.sol`, and `*.threews.sol` to addresses when you'd rather point at a name than paste a base58 string.

### 40+ MCP servers

Everything the platform can do is exposed over the Model Context Protocol, listed in the [official MCP registry](https://registry.modelcontextprotocol.io/?q=io.github.nirholas): **32 install-and-run servers on npm** (stdio) under `@three-ws`, two more top-level npm servers (`@three-ws/mcp-server`, the full 3D + agent toolkit; `@three-ws/mcp-bridge`, an x402 HTTP→stdio bridge that auto-pays endpoints), and **7 hosted remote endpoints** (Streamable HTTP, nothing to install). A sampling of the fleet:

- **3D & avatars:** `scene-mcp` (speak a diorama into being), `avatar-agent-mcp`, `threews-avatar-mcp`, `loom-mcp` (the creation gallery), plus the hosted `/api/mcp` (35+ avatar/agent tools) and `/api/mcp-3d` (text→3D).
- **Payments & economy:** `x402-mcp`, `three-token-mcp`, `mcp-bridge`, `autopilot-mcp` (scopes + spend caps + propose/execute/undo), `agentcore-payments-mcp`, `billing-mcp`, `portfolio-mcp`, `provenance-mcp`.
- **Market intel:** `intel-mcp`, `pumpfun-mcp`, `signals-mcp`, `kol-mcp`, `vanity-mcp`, `marketplace-mcp`, `activity-mcp`, `alerts-mcp`.
- **Coordination:** `agenc-mcp` (on-chain task marketplace), `agora-mcp`, `naming-mcp`, `notifications-mcp`, `tutor-mcp`, `copy-mcp`, `clash-mcp`.
- **AI providers:** `ibm-watsonx-mcp`, `ibm-x402-mcp`, `alibaba-cloud-mcp` (Qwen / DashScope), `brain-mcp` (multi-provider router), `vision-mcp`, `audio-mcp`.

### 70+ SDKs & packages (all `@three-ws`, all published)

The `@three-ws` scope holds **more than 70 published packages**: zero-dependency, pure-ESM, typed, and tested (**216 green tests** across the SDK suite, per the repo's own `STRUCTURE.md`). Each wraps a live platform capability into a single import:

- **Create:** `forge`, `pose`, `mocap`, `voice`, `glb-tools`, `avatar`, `avatar-cli`, `page-agent`, `walk`, `avatar-schema`, `viewer-presets`.
- **Earn / trade:** `x402-server`, `x402-fetch`, `strategies`, `pumpfun-skills`, `agent-guards`, `skill-license`.
- **Coordinate:** `agenc` (task marketplace), `agent-memory`, `reputation` (ERC-8004), `guardian` (content safety), `names`, `intel`, `vanity`, `irl`.
- **Cross-chain:** `@three-ws/sdk`, `@three-ws/solana-agent`, `@three-ws/agent-protocol-sdk`, `@three-ws/agent-payments`.

### In your editor

- **VS Code:** the *x402 Pay-per-call APIs* extension, this one.
- **Claude Code plugin marketplace:** add `three-ws` once and install wallet, payments, pump.fun trading, agent scaffolding, and the 3D Forge as namespaced skills + MCP tools. Works across Claude Code, Claude Desktop, and Cursor over MCP.

### Partners & platforms

three.ws builds in the open and earns its integrations. The reach is real and growing:

- **IBM:** three.ws is an IBM Business Partner, with the agent runtime running on **IBM Granite** models via **watsonx.ai**. *(Our public `/ibm/*` demos and the `@three-ws/ibm-watsonx-mcp` / `@three-ws/ibm-x402-mcp` connectors are community-built explorations of Granite, made by the three.ws team.)*
- **AWS:** AWS Partner on the APN Software Path, with a Marketplace SaaS listing in review and production running on `us-east-1`.
- **Alibaba Cloud:** a live product listing on Alibaba Cloud Marketplace.
- **Solana Mobile (Seeker):** MWA wallet wired straight into the app, with a dApp Store release pipeline ready to ship.
- **Built on / integrated with:** Anthropic Claude, PayAI (the default x402 facilitator) and Coinbase CDP (a bazaar discovery feed), pump.fun, ENS + SNS, Meshy & Tripo (bring-your-own-key 3D), and FLUX → TRELLIS (the free text→3D lane).

### Under the hood

Stateless Vercel serverless functions, Neon Postgres, Cloudflare R2, Upstash Redis, a full OAuth 2.1 authorization server, and an MCP endpoint. Payments span **15+ EVM chains and Solana** (Metaplex Core).

---

## Get it

Open the Extensions view, search **x402**, and install `threews.vscode-x402`, or run `ext install nirholas.vscode-x402`. Requires VS Code 1.85+. You only need a funded wallet to *pay*: a Solana wallet holding $THREE or USDC, or a Base USDC wallet. Inspecting endpoints and browsing the bazaar are free and need no wallet at all.

It's **free**, on the VS Code Marketplace now → https://marketplace.visualstudio.com/items?itemName=threews.vscode-x402

**Explore it:** [three.ws](https://three.ws) · [MCP registry](https://registry.modelcontextprotocol.io/?q=io.github.nirholas) · [github.com/nirholas/three.ws](https://github.com/nirholas/three.ws) · `$THREE` on Solana `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`

The extension is the easiest door into a much bigger build. three.ws is giving AI agents a body, a brain, an identity, and a wallet, and wiring them into an economy where they can actually pay each other. Payments an agent can make on its own, identity it can carry, skills it can sell: three.ws is turning each of those from a whitepaper idea into something you can install and use today, all in the open, all under `@three-ws`. This is just the first piece you can hold.

Twenty-five years is long enough. Let's use the code.

---

## FAQ

**Do I need crypto to use it?** Not for inspecting or browsing: decoding a 402 challenge and searching the bazaar are pure reads with no wallet. You only need a funded wallet to actually pay a call.

**Which chains and tokens?** USDC or $THREE on Solana (via the real `@x402/svm` exact scheme), and USDC on Base (via `@three-ws/x402-fetch`, EIP-3009). The extension auto-routes to whichever rail your challenge and preferences point at.

**Where does my private key go?** Into your OS keychain via VS Code SecretStorage: never `settings.json`, never disk plaintext, never a log. It's loaded only at the moment of payment.

**What stops an accidental overspend?** A per-call spending cap (default $0.10) checked *before* signing, plus a per-payment confirmation showing the exact amount, token, network, and payer. Use a dedicated low-balance wallet.

**Is there vendor lock-in?** No. It speaks the open x402 protocol to any compliant endpoint and any compliant bazaar. The payment client is vendored and zero-dependency: no SDK fetched at runtime, no service trusted beyond the merchant you chose to pay.

**Can I publish my own paid API?** Yes: one command scaffolds `api/x402/<slug>.js` around `@three-ws/x402-server`'s `paid()` wrapper. Your handler runs only after payment settles on-chain. You're a publisher in about a minute.

**Is this only for the three.ws platform?** No. It's the payments edge of three.ws pulled out to stand alone. You never need a 3D asset, an account, or the rest of the platform to inspect, pay, and publish x402 endpoints from your editor.
