# Pay-per-call APIs, inside your editor

> HTTP 402 sat unused for 25 years. We wired it into VS Code, so you can inspect, pay, and ship paid APIs in $THREE or USDC on Solana (and USDC on Base) without leaving the editor.

For twenty-five years, one HTTP status code has been a placeholder. `402 Payment Required` shipped in the earliest HTTP specs, got marked "reserved for future use," and then nothing. Every other code found a job. 402 waited.

The future finally showed up, as a protocol called **x402**, and we brought the whole thing into the one place developers actually wire up and call paid endpoints: **VS Code**.

## What x402 actually is

x402 is a payment protocol for developers and agents. The loop is simple:

1. You request a resource.
2. The server answers `402 Payment Required` with a machine-readable challenge: which networks it accepts, which asset, the price, and where to pay.
3. Your client signs a payment authorization in the requested token (USDC or $THREE) and retries the same request with proof of payment.
4. The server does the work and returns the result plus an on-chain settlement receipt.

No accounts. No API keys. No subscriptions. Just per-call settlement, on-chain. It's the missing payment layer for an internet of APIs and agents that need to pay each other in real time.

## What the extension does

**x402 Pay-per-call APIs** brings that entire loop inside the editor. Four moves, all without leaving VS Code.

**Inspect any endpoint.** Paste a URL and decode its 402 challenge: every accepted network, asset, payment scheme, price (converted to USD), and payTo address, with the one requirement your wallet can satisfy flagged. Read-only. No wallet, no signing, no configuration.

**Pay & call.** Make a real paid request from a panel. It routes each request to the right rail automatically: **$THREE or USDC on Solana**, or USDC on Base. The exact USD amount, token, and network are shown and confirmed before any key touches the request, and a per-call spending cap blocks anything above your limit. The response body and the on-chain receipt (status, amount paid, paying address, token, network, transaction signature) render inline.

**Browse a bazaar.** Point it at a discovery host and the sidebar lists paid HTTP APIs and MCP tools. Filter by type, price, and tag; full-text search; click any service to open its panel and pay.

**Scaffold your own.** One command generates a self-contained, framework-agnostic Node handler that answers an unpaid request with a 402 challenge and runs your logic only after payment verifies. You're a paid-API publisher in about a minute.

## Under the hood

The extension sends your request unpaid (free endpoints just work), parses the 402, and picks a payable requirement across both rails, honouring your preferred network and token.

- **Solana:** the real `@x402/svm` `exact` scheme signs an SPL transfer of the selected token (**USDC or $THREE**, mint `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) from your key. This is the same buyer `@three-ws/x402-mcp` uses.
- **Base and other EVM chains:** the vendored `@three-ws/x402-fetch` signs a USDC `transferWithAuthorization` (EIP-3009 / EIP-712).

Either way it retries with the `X-PAYMENT` header, the merchant settles on-chain, and the receipt is decoded from the `x-payment-response` header and rendered inline with the token, network, and transaction signature.

## Security you can reason about

Your Solana and EVM keys live only in VS Code **SecretStorage**, the OS keychain (Keychain on macOS, Credential Manager on Windows, libsecret on Linux). Never in `settings.json`, never logged, never on disk in plaintext. A spending cap (default $0.10) is checked before signing, and per-payment confirmation shows the exact amount and paying address before any signature. The guidance is blunt: use a dedicated, low-balance wallet. Treat it like petty cash, not a vault.

## No lock-in

It has no dependency on any specific provider. Point it at any compliant x402 endpoint, or any bazaar that serves the discovery API. Discovery is optional: inspecting and paying a single URL needs zero configuration.

## Get it

Open the Extensions view, search **x402**, and install `threews.vscode-x402`, or run `ext install nirholas.vscode-x402`. Requires VS Code 1.85+; a funded Solana wallet (holding $THREE or USDC), or a Base USDC wallet, only if you want to *pay* (inspecting and browsing are free).

It's **free**, on the VS Code Marketplace now → https://marketplace.visualstudio.com/items?itemName=threews.vscode-x402

Twenty-five years is long enough. Let's use the code.

---

## Where x402 fits: the three.ws ecosystem

This extension is one surface of **three.ws**, an open-source, browser-native platform for 3D AI agents that can *earn, pay, and coordinate*. The same team that wired 402 into your editor is building the whole loop around it: give an AI a body, a brain, an on-chain identity, and a wallet, then let agents transact with each other in real time. It all ships from a single npm-workspaces monorepo, published under the **`@three-ws`** scope. `$THREE` (Solana: `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the native token.

### What we're building

Type a prompt and **Forge** turns text, an image, or a sketch into a textured, rig-ready 3D model: free draft tier, no account. Rig it, animate it, give it an LLM brain, embed it anywhere with `<agent-3d>`, register it on-chain (ERC-8004), and let it pay for tools and get paid for skills over x402. The extension you just installed is the *payments edge* of that platform, pulled out so any developer can use it standalone.

### The x402 stack

- **`@three-ws/x402-fetch`**: the zero-dependency payment client this extension vendors (send → 402 → sign USDC → retry).
- **`@three-ws/x402-server`**: the merchant side. Turn any endpoint paid; it advertises **both USDC and $THREE** in a single 402 challenge.
- **`@three-ws/x402-mcp`**: a self-custodial x402 buyer as an MCP server. Find, inspect, and pay any service in USDC from any AI client.
- Native x402 endpoints on **Base, BSC, and Solana**, settled through the **Coinbase CDP facilitator** on Base. Pay-by-name resolves `@username`, `*.sol`, or `*.threews.sol` to a recipient before you sign.

### 38 MCP servers

Everything the platform can do is exposed over the Model Context Protocol: **6 hosted remote servers** (Streamable HTTP, nothing to install) and **32 install-and-run servers** on npm, all listed in the [official MCP registry](https://registry.modelcontextprotocol.io/?q=io.github.nirholas). A sampling:

- **3D & avatars:** `scene-mcp` (speak a diorama into being), `avatar-mcp`, `avatar-agent`, `mcp-server` (full 3D + agent toolkit, paid per call).
- **Payments & economy:** `x402-mcp`, `three-token-mcp`, `mcp-bridge`, `autopilot-mcp` (scopes + spend caps + propose/execute/undo), `portfolio-mcp`, `provenance-mcp`.
- **Market intel:** `intel-mcp`, `pumpfun-mcp`, `vanity-mcp`, `marketplace-mcp`, `signals-mcp`, `kol-mcp`.
- **AI providers:** `ibm-watsonx-mcp`, `ibm-x402-mcp`, `alibaba-cloud-mcp` (Qwen / DashScope), `brain-mcp` (multi-provider router), `vision-mcp`, `audio-mcp`.

### 20+ SDKs & packages (all `@three-ws`, all published)

Zero-dependency, pure-ESM, typed, tested (216 green tests across the SDK suite). Each wraps live platform APIs into a single import.

- **Create:** `forge`, `pose`, `mocap`, `voice`, `glb-tools`, `avatar`, `page-agent`, `walk`, `avatar-schema`.
- **Earn / trade:** `x402-server`, `strategies`, `pumpfun-skills`, `agent-guards`, `skill-license`.
- **Coordinate:** `agenc` (task marketplace), `agent-memory`, `reputation` (ERC-8004), `guardian` (content safety), `names`, `intel`, `vanity`, `irl`.
- **Cross-chain:** `@three-ws/sdk`, `@three-ws/solana-agent`, `@three-ws/agent-protocol-sdk`, `@three-ws/agent-payments`.

### In your editor

- **VS Code:** the *x402 Pay-per-call APIs* extension (this one).
- **Claude Code plugin marketplace:** add `three-ws` once and install wallet, payments, pump.fun trading, agent scaffolding, and the 3D Forge as namespaced skills + MCP tools. Works across Claude Code, Claude Desktop, and Cursor over MCP.

### Partners & platforms

We build in the open, and we're precise about what's official.

- **IBM:** three.ws is an IBM Business Partner; the agent runtime runs on **IBM Granite** models via **watsonx.ai**. *(The public `/ibm/*` demos are independent tools we built to explore Granite, not IBM products and not endorsed by IBM; the connectors `@three-ws/ibm-watsonx-mcp` and `@three-ws/ibm-x402-mcp` are community-built, ours and not IBM's.)*
- **AWS:** AWS Partner (APN Software Path); Marketplace SaaS listing in review; production runs on `us-east-1`.
- **Alibaba Cloud:** live product listing on Alibaba Cloud Marketplace.
- **Solana Mobile (Seeker):** MWA wallet wired into the app, plus a dApp Store release pipeline.
- **Built on / integrated with:** Anthropic Claude, Coinbase CDP (x402 facilitator on Base), pump.fun, ENS + SNS, Meshy & Tripo (bring-your-own-key 3D), FLUX → TRELLIS (the free text→3D lane). *(Google Cloud: not yet a partner, open to co-listing. Livepeer: early, experimental.)*

### Under the hood

Stateless Vercel serverless functions, Neon Postgres, Cloudflare R2, Upstash Redis, a full OAuth 2.1 authorization server, and an MCP endpoint. Payments span **15+ EVM chains and Solana** (Metaplex Core).

**Explore it:** [three.ws](https://three.ws) · [MCP registry](https://registry.modelcontextprotocol.io/?q=io.github.nirholas) · [github.com/nirholas/three.ws](https://github.com/nirholas/three.ws) · `$THREE` on Solana `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`

---

## Launch kit

**Cover image:** `x402-hero.png` (3200×1800)
**Autoplay video:** `x402-loop.mp4` · **GIF fallback:** `x402-loop.gif` · **Static money shot:** `x402-pay-and-call.png`

### Main post (highest repost potential)

> HTTP 402 "Payment Required" has sat unused in the spec for 25 years.
>
> We wired it into VS Code. Paste any endpoint, pay per call in $THREE or USDC on Solana, get the on-chain receipt inline. No accounts, no API keys, no subscriptions.
>
> Free → marketplace.visualstudio.com/items?itemName=threews.vscode-x402

### First reply (extends the thread)

> Three ways to use it:
>
> ◆ Inspect any endpoint free: decode its 402, no wallet
> ◆ Pay & call: $THREE or USDC on Solana (USDC on Base too), per-call spending cap, key in your OS keychain
> ◆ Scaffold your own paid endpoint in one command
>
> No provider lock-in. Open x402 protocol, zero payment SDK at runtime.

### Alt text

**Hero:** Dark promo graphic. Headline: "HTTP 402 sat unused for 25 years." Subtext: paste any endpoint, pay per call in $THREE or USDC on Solana, get the on-chain receipt inline. No accounts, no API keys, no subscriptions. A floating VS Code panel shows a settlement receipt: $0.01 in $THREE paid on Solana with a transaction signature. Free on the VS Code Marketplace.

**Loop / money shot:** A VS Code panel titled "Pay & call endpoint." A cursor types an endpoint URL, which decodes into a 402 Payment Required challenge (Solana mainnet, $THREE, $0.01, pay-to address) flagged "payable by this wallet." The cursor clicks "Pay & call," confirms a payment dialog, and a 200 OK JSON response plus a green settlement receipt appear inline, showing $0.01 in $THREE paid from 5Age9r…9Ff8 with Solana signature 4Qs9x2…kPq2.
