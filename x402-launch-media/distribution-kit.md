# x402 for VS Code — distribution kit

Everything ready to paste for spreading the extension and three.ws. Featuring
**$THREE or USDC on Solana** (and USDC on Base). Reuse the media in this folder:
`x402-hero.png` (cover), `x402-loop.mp4` / `.gif` (demo), `x402-pay-and-call.png`.

**Live listings**
- VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=threews.vscode-x402
- Open VSX (Cursor / Windsurf / VSCodium / Gitpod / Theia): https://open-vsx.org/extension/threews/vscode-x402

---

## Product Hunt

**Name:** x402 for VS Code

**Tagline (≤60):** Pay-per-call APIs in VS Code, in USDC or $THREE on Solana

**Topics:** Developer Tools · Artificial Intelligence · Crypto · Payments · Visual Studio Code

**Description (≤260):**
> HTTP 402 "Payment Required" sat unused for 25 years. This VS Code extension wires it in: paste any endpoint, decode its 402 challenge, and pay per call in $THREE or USDC on Solana (or USDC on Base). Response and on-chain receipt render inline. No accounts, no API keys.

**Gallery:** `x402-hero.png` first, then the `x402-loop.mp4` demo, then `x402-pay-and-call.png`.

**Maker's first comment:**
> Hey Product Hunt 👋
>
> x402 is the missing payment layer for APIs and agents: a server answers a request with `402 Payment Required` and a machine-readable challenge, the caller signs a stablecoin authorization and retries, the server does the work and returns an on-chain receipt. No accounts, no keys, no subscriptions, just per-call settlement.
>
> We brought the whole loop into the editor where people actually wire up paid endpoints:
> • Inspect any endpoint free (decode its 402, no wallet)
> • Pay & call in $THREE or USDC on Solana, or USDC on Base, with a per-call spending cap
> • Browse a bazaar of paid APIs + MCP tools in the sidebar
> • Scaffold your own paid endpoint in one command
>
> It's free and now on both the VS Code Marketplace and Open VSX (so Cursor / Windsurf work too). It's one surface of three.ws, an open-source platform for 3D AI agents that earn, pay, and coordinate, with 38 MCP servers and 20+ npm SDKs. Happy to answer anything about x402, MCP, or the Solana settlement path.

---

## Show HN

**Title (≤80):** Show HN: Pay-per-call APIs in VS Code with x402 (USDC or $THREE on Solana)

**URL:** https://marketplace.visualstudio.com/items?itemName=threews.vscode-x402

**Body:**
> `402 Payment Required` has been reserved-but-unused in HTTP since ~1999. The x402 protocol finally gives it a job: a server replies 402 with a machine-readable challenge (networks, asset, price, payTo), the client signs a stablecoin authorization and retries with an `X-PAYMENT` header, and the server returns the work plus an on-chain settlement receipt. No accounts, no API keys, no subscriptions.
>
> I built a VS Code extension that brings the whole loop into the editor:
> - Inspect any endpoint: decode its 402 read-only, no wallet
> - Pay & call: settle on the right rail automatically. Solana uses the real @x402/svm exact scheme to sign an SPL transfer of USDC or $THREE; Base uses a USDC EIP-3009 transferWithAuthorization. Response body + receipt render inline.
> - A per-call spending cap and modal confirm before anything is signed; keys live only in the OS keychain (VS Code SecretStorage)
> - Scaffold a paid endpoint (framework-agnostic Node handler) in one command
>
> It's free, on the VS Code Marketplace and Open VSX (works in Cursor/Windsurf/VSCodium). It's part of three.ws, an open-source agent platform, and the payment client is also published as @three-ws/x402-fetch (EVM) with @three-ws/x402-mcp for the self-custodial Solana buyer. Happy to go deep on the protocol, the MCP transport, or the signing path.

---

## Dev.to / Hashnode

Paste the full body of `x402-article.md` (everything above the "Launch kit" section). Front-matter:

```yaml
---
title: "Pay-per-call APIs, inside your editor"
published: true
description: "HTTP 402 sat unused for 25 years. We wired it into VS Code: pay any API per call in $THREE or USDC on Solana, without leaving the editor."
tags: webdev, ai, solana, opensource
cover_image: https://three.ws/og/x402-hero.png
canonical_url: https://three.ws/x402
---
```

(Upload `x402-hero.png` and point `cover_image` at wherever it's hosted. Set `canonical_url` to the article's home so Dev.to/Hashnode don't outrank you in search.)

---

## Awesome-list PR entries

Add under the most relevant section of each list, then open a PR.

**`punkpeye/awesome-mcp-servers`** (and `wong2/awesome-mcp-servers`) — under Finance / Payments:
```markdown
- [three.ws x402](https://github.com/nirholas/three.ws) — Self-custodial x402 buyer and 38-server MCP suite: find, inspect, and pay any x402 API per call in USDC or $THREE on Solana (and USDC on Base). Real @x402 settlement, no custodial wallet.
```

**`viatsko/awesome-vscode`** — under Integration or Other:
```markdown
- [x402 — Pay-per-call APIs](https://marketplace.visualstudio.com/items?itemName=threews.vscode-x402) — Decode HTTP 402 challenges and pay per call for paid APIs and MCP tools in USDC or $THREE on Solana (or USDC on Base), without leaving the editor. Also on [Open VSX](https://open-vsx.org/extension/threews/vscode-x402).
```

**`avelino/awesome-go`-style x402 list / `coinbase/x402` ecosystem** — if an `awesome-x402` exists, add; otherwise propose the extension + packages to the x402 ecosystem page:
```markdown
- [three.ws](https://three.ws) — x402 for VS Code (buyer + endpoint scaffolder), `@three-ws/x402-fetch` (zero-dep EVM client), `@three-ws/x402-server` (turn any endpoint paid, advertises USDC + $THREE), and `@three-ws/x402-mcp` (self-custodial Solana buyer over MCP).
```

**`avelino`/Solana ecosystem lists (e.g. `Solana ecosystem` directory, Superteam)** — dev tooling:
```markdown
- [three.ws](https://three.ws) — Open-source 3D AI agent platform with native x402 payments; agents pay each other per call in $THREE or USDC. VS Code extension, 38 MCP servers, 20+ npm SDKs.
```

---

## Other channels — confirmed paths + who can do them

**x402 ecosystem** (https://www.x402.org/ecosystem) — submit via a GitHub issue/PR to
[`coinbase/x402`](https://github.com/coinbase/x402) (see prior submissions like issue #1180).
Also add to the curated [`Merit-Systems/awesome-x402`](https://github.com/Merit-Systems/awesome-x402) list.
Proposed entry:
```markdown
- **three.ws** — x402 for VS Code (buyer + endpoint scaffolder, on Marketplace + Open VSX),
  `@three-ws/x402-fetch` (zero-dep EVM client), `@three-ws/x402-server` (turn any endpoint paid,
  advertises USDC + $THREE), `@three-ws/x402-mcp` (self-custodial Solana buyer over MCP).
  Pays in USDC or $THREE on Solana, USDC on Base. https://three.ws
```
→ *I can open both PRs via `gh` on your go-ahead (they post publicly to third-party repos).*

**Smithery** (https://smithery.ai) — needs a `smithery.yaml` in each MCP server repo, then you
connect the repo in Smithery's web app (GitHub OAuth). Template added at
`packages/x402-mcp/smithery.yaml`. → *I can generate `smithery.yaml` for all 32 servers; the
final "connect repo" step is web-OAuth (yours).*

**Glama** (https://glama.ai/mcp) and **PulseMCP** (https://www.pulsemcp.com) — auto-crawl the
official MCP registry, where the 38 servers are already listed, so these largely index
themselves. Claiming/editing a listing is web-OAuth (yours).

**mcp.so / cursor.directory** — community submissions via GitHub PR or web form. → *I can prepare
the PR content; opening it is one command once you confirm.*

**JSR** (https://jsr.io) — publish is browser-OAuth or GitHub-Actions OIDC (no static token like
npm), and the `@three-ws` scope must be created on jsr.io first (web). → *I can make every SDK
JSR-ready (`jsr.json` exports + green `jsr publish --dry-run`); the final publish is yours.*

**Azure Marketplace** — requires a Microsoft Partner Center account with business/tax/banking
verification and a commercial-marketplace offer. → *Business-account process, not automatable.
I can draft the full offer listing (title, plans, categories, description); you submit.*
