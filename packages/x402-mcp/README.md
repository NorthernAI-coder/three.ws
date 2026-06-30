<h1 align="center">x402-mcp</h1>

<p align="center"><strong>Give any AI agent a self-custodial x402 wallet — inspect, discover, and pay any paid endpoint in USDC from your own Solana key.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@three-ws/x402-mcp"><img alt="npm" src="https://img.shields.io/npm/v/@three-ws/x402-mcp?logo=npm&color=cb3837"></a>
  <img alt="license" src="https://img.shields.io/npm/l/@three-ws/x402-mcp?color=3b82f6">
  <img alt="node" src="https://img.shields.io/node/v/@three-ws/x402-mcp?color=339933&logo=node.js">
</p>

---

> A [Model Context Protocol](https://modelcontextprotocol.io) server that turns any AI assistant into an autonomous economic agent on the [x402](https://x402.org) network. Read an endpoint's price **before** committing money, then `pay_and_call` any x402 endpoint in USDC — settled on Solana with **your own key**, never a custodial wallet.

The core flow needs nothing but a Solana RPC and a key. The payment dance and Solana `exact`-scheme signing are handled by the real `@x402/*` libraries — nothing is mocked.

## Install

```bash
npm install @three-ws/x402-mcp
```

Or run with `npx`:

```bash
SOLANA_SECRET_KEY=<base58> npx @three-ws/x402-mcp
```

## Quick start

**Claude Code**, one line:

```bash
claude mcp add x402 --env SOLANA_SECRET_KEY=<base58> -- npx -y @three-ws/x402-mcp
```

**Claude Desktop / Cursor** (`claude_desktop_config.json` or `mcp.json`):

```json
{
	"mcpServers": {
		"x402": {
			"command": "npx",
			"args": ["-y", "@three-ws/x402-mcp"],
			"env": {
				"SOLANA_SECRET_KEY": "<base58 secret of the wallet that holds USDC>",
				"SOLANA_RPC_URL": "https://your-rpc-provider",
				"MAX_PAY_USD": "1"
			}
		}
	}
}
```

`SOLANA_SECRET_KEY` is only needed to **spend** (`pay_and_call`, and `x402_wallet` defaulting to your wallet). `inspect_endpoint` works with no key. `find_services` additionally needs `X402_API_BASE` (a discovery endpoint).

## Tools

| Tool               | Type          | What it does                                                                                              |
| ------------------ | ------------- | -------------------------------------------------------------------------------------------------------- |
| `x402_wallet`      | read-only     | A wallet's address + live SOL/USDC balance. Defaults to your signer wallet — confirm funds before paying. |
| `inspect_endpoint` | read-only     | Read any endpoint's 402 payment requirements (scheme, network, asset, price, pay-to) **without paying**.  |
| `find_services`    | read-only     | Search an x402 bazaar / discovery API for paid HTTP/MCP services with prices. Requires `X402_API_BASE`.   |
| `pay_and_call`     | **execution** | Pay an x402 endpoint in USDC from your Solana key and return its result. Bounded by `MAX_PAY_USD`.        |

### Safety

`pay_and_call` carries `destructiveHint: true`, so annotation-aware clients (Claude Code, Claude Desktop, Cursor) prompt before running it. Beyond the client hint, every payment is bounded server-side: it **probes the 402 first** and refuses if the price exceeds `max_usd` or `MAX_PAY_USD` (default $1) **before any money moves**, and with `REQUIRE_CONFIRM` on (default) the call refuses until re-issued with `confirm: true`. Only the Solana (`solana:*`) `exact`-scheme requirement is settled — with the key you control.

### Input parameters

**`x402_wallet`** — `address` (optional base58; defaults to the signer wallet).

**`inspect_endpoint`** — `url` (required), `method` (`GET` | `POST`), `body` (object).

**`find_services`** — `query` (required), `type` (`http` | `mcp`, default `http`), `network` (CAIP-2 filter), `max_price_usdc`, `limit` (1–100).

**`pay_and_call`** — `url` (required), `method` (`GET` | `POST`), `body` (object), `token` (`usdc` default, or `three` when the endpoint advertises it), `max_usd` (lowers the cap for this call), `secret` (per-call signer override), `confirm` (must be `true` when `REQUIRE_CONFIRM` is on), `session_token` (optional; routes through a hosted wallet service set via `X402_API_BASE`).

## Example

Self-custodial USDC against any x402 endpoint — no account, no discovery service, just a Solana key:

```jsonc
// inspect_endpoint — what does it cost? (no payment, no key)
> { "url": "https://api.example.com/x402/quote" }
{
  "ok": true, "paid": true,
  "accepts": [
    { "scheme": "exact", "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "asset": "EPjFW…", "price": 50000 }
  ],
  "payable_with_this_wallet": true
}

// pay_and_call — settle in USDC; confirm:true required by default
> { "url": "https://api.example.com/x402/quote", "confirm": true }
{ "ok": true, "paid": true, "payer": "Gx5E…", "token": "usdc", "price_usd": 0.05, "settlement": { … }, "result": { … } }
```

### Optional: discovery and alternate tokens

`find_services` searches an x402 bazaar / discovery API. Point `X402_API_BASE` at any compatible endpoint — for example [three.ws](https://three.ws), which merges the public PayAI and Coinbase CDP facilitator feeds:

```bash
X402_API_BASE=https://three.ws SOLANA_SECRET_KEY=<base58> npx @three-ws/x402-mcp
```

When an endpoint advertises a non-USDC token (e.g. `$THREE`, Solana mint `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`), pay in it with `token: "three"`. USDC remains the default and works everywhere.

## Requirements

- **Node.js >= 20.**
- A Solana mainnet RPC endpoint (`https`; only `http://localhost` is allowed for dev). Public cluster works for reads; bring your own for payment traffic.
- To pay: a Solana wallet holding USDC, as a base58 `SOLANA_SECRET_KEY` (or per-call `secret`).
- For `find_services` / `session_token`: `X402_API_BASE` pointing at an x402 bazaar / discovery API.

### Environment variables

| Variable              | Required        | Default                               |
| --------------------- | --------------- | ------------------------------------- |
| `SOLANA_SECRET_KEY`   | to pay only     | —                                     |
| `SOLANA_RPC_URL`      | no              | `https://api.mainnet-beta.solana.com` |
| `MAX_PAY_USD`         | no              | `1`                                   |
| `REQUIRE_CONFIRM`     | no              | `true`                                |
| `X402_HTTP_TIMEOUT_MS`| no              | `60000`                               |
| `X402_API_BASE`       | for discovery   | — (e.g. `https://three.ws`)           |

> Legacy names `THREE_WS_BASE` and `THREE_WS_TIMEOUT_MS` are still honoured as fallbacks for `X402_API_BASE` and `X402_HTTP_TIMEOUT_MS`.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
