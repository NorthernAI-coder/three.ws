# Pay-per-call APIs, inside your editor

> HTTP 402 sat unused for 25 years. We wired it into VS Code — inspect, pay, and ship paid APIs in USDC without leaving the editor.

For twenty-five years, one HTTP status code has been a placeholder. `402 Payment Required` shipped in the earliest HTTP specs, got marked "reserved for future use," and then… nothing. Every other code found a job. 402 waited.

The future finally showed up — as a protocol called **x402** — and we brought the whole thing into the one place developers actually wire up and call paid endpoints: **VS Code**.

## What x402 actually is

x402 is a payment protocol for developers and agents. The loop is simple:

1. You request a resource.
2. The server answers `402 Payment Required` with a machine-readable challenge — which networks it accepts, which asset, the price, and where to pay.
3. Your client signs a USDC authorization and retries the same request with proof of payment.
4. The server does the work and returns the result plus an on-chain settlement receipt.

No accounts. No API keys. No subscriptions. Just per-call settlement, on-chain. It's the missing payment layer for an internet of APIs and agents that need to pay each other in real time.

## What the extension does

**x402 — Pay-per-call APIs** brings that entire loop inside the editor. Four moves, all without leaving VS Code:

**Inspect any endpoint.** Paste a URL and decode its 402 challenge — every accepted network, asset, payment scheme, price (converted to USD), and payTo address, with the one requirement *your* wallet can satisfy flagged. Read-only. No wallet, no signing, no configuration.

**Pay & call.** Make a real paid request from a panel. The exact USD amount is shown and confirmed before any key touches the request, and a per-call spending cap blocks anything above your limit. The response body and the on-chain receipt — status, amount paid, paying address, transaction hash — render inline.

**Browse a bazaar.** Point it at a discovery host and the sidebar lists paid HTTP APIs and MCP tools. Filter by type, price, and tag; full-text search; click any service to open its panel and pay.

**Scaffold your own.** One command generates a self-contained, framework-agnostic Node handler that answers an unpaid request with a 402 challenge and runs your logic only after payment verifies. You're a paid-API publisher in about a minute.

## Under the hood

The payment client is **vendored and zero-dependency** — the extension pulls in no payment SDK at runtime. It sends your request unpaid (free endpoints just work), parses the 402, selects the requirement matching your preferred network and a USDC asset your key can sign, signs a USDC-on-Base `transferWithAuthorization` (EIP-3009 / EIP-712), and retries with the `X-PAYMENT` header. The merchant settles on-chain and returns the work plus a receipt decoded from the `x-payment-response` header.

The whole secp256k1 / keccak256 / EIP-712 stack is pure JavaScript on top of Web Crypto — nothing exotic, present in Node ≥ 18 and modern browsers.

## Security you can reason about

Your EVM private key lives only in VS Code **SecretStorage** — the OS keychain (Keychain on macOS, Credential Manager on Windows, libsecret on Linux). Never in `settings.json`, never logged, never on disk in plaintext. A spending cap (default $0.10) is checked before signing, and per-payment confirmation shows the exact amount and paying address before any signature. The guidance is blunt: use a dedicated, low-balance wallet. Treat it like petty cash, not a vault.

## No lock-in

It has no dependency on any specific provider. Point it at any compliant x402 endpoint, or any bazaar that serves the discovery API. Discovery is optional — inspecting and paying a single URL needs zero configuration.

## Get it

Open the Extensions view, search **x402**, and install `threews.vscode-x402` — or run `ext install nirholas.vscode-x402`. Requires VS Code 1.85+; a funded USDC-on-Base wallet only if you want to *pay* (inspecting and browsing are free).

It's **free**, on the VS Code Marketplace now → https://marketplace.visualstudio.com/items?itemName=threews.vscode-x402

Twenty-five years is long enough. Let's use the code.

---

## Launch kit

**Cover image:** `x402-hero.png` (3200×1800)
**Autoplay video:** `x402-loop.mp4` · **GIF fallback:** `x402-loop.gif` · **Static money shot:** `x402-pay-and-call.png`

### Main post (highest repost potential)

> HTTP 402 "Payment Required" has sat unused in the spec for 25 years.
>
> We wired it into VS Code. Paste any endpoint, pay per call in USDC, get the on-chain receipt inline — no accounts, no API keys, no subscriptions.
>
> Free → marketplace.visualstudio.com/items?itemName=threews.vscode-x402

### First reply (extends the thread)

> Three ways to use it:
>
> ◆ Inspect any endpoint free — decode its 402, no wallet
> ◆ Pay & call — USDC on Base, per-call spending cap, key in your OS keychain
> ◆ Scaffold your own paid endpoint in one command
>
> No provider lock-in. Open x402 protocol, zero payment SDK at runtime.

### Alt text

**Hero:** Dark promo graphic. Headline: "HTTP 402 sat unused for 25 years." Subtext: paste any endpoint, pay per call in USDC, get the on-chain receipt inline — no accounts, no API keys, no subscriptions. A floating VS Code panel shows a settlement receipt: $0.01 USDC paid on Base with a transaction hash. Free on the VS Code Marketplace.

**Loop / money shot:** A VS Code panel titled "Pay & call endpoint." It decodes a 402 Payment Required challenge — Base network, USDC, $0.01, pay-to address — flagged "payable by this wallet." After a confirm dialog, a 200 OK JSON response and a green settlement receipt appear inline, showing $0.01 USDC paid from 0x4E9a…1F08 with transaction hash 0x9c2d…4a7f.
