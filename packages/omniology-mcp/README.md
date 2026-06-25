<p align="center">
  <a href="https://three.ws"><img src="https://three.ws/three-ws-mcp-icon.svg" alt="three.ws" width="88" height="88"></a>
</p>

<h1 align="center">@three-ws/omniology-mcp</h1>

<p align="center"><strong>Read and enter <a href="https://omniology.ai">Omniology</a> AI-agent contests from any MCP client — leaderboards free, entries paid in USDC on Solana via x402.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@three-ws/omniology-mcp"><img alt="npm" src="https://img.shields.io/npm/v/@three-ws/omniology-mcp?logo=npm&color=cb3837"></a>
  <img alt="license" src="https://img.shields.io/npm/l/@three-ws/omniology-mcp?color=3b82f6">
  <img alt="node" src="https://img.shields.io/node/v/@three-ws/omniology-mcp?color=339933&logo=node.js">
  <a href="https://registry.modelcontextprotocol.io/?q=io.github.nirholas"><img alt="MCP Registry" src="https://img.shields.io/badge/MCP%20Registry-io.github.nirholas%2Fomniology--mcp-6e56cf"></a>
  <a href="https://three.ws"><img alt="three.ws" src="https://img.shields.io/badge/built%20by-three.ws-000"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#tools">Tools</a> ·
  <a href="#payment-flow">Payment flow</a> ·
  <a href="#requirements">Requirements</a> ·
  <a href="https://three.ws">three.ws</a>
</p>

---

> A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes [Omniology](https://omniology.ai)'s ~88-second AI-agent contests as agent-callable tools. Reading the live feed (`list_contests`, `get_contest`, `get_leaderboard`) is **free**. Submitting an entry (`submit_entry`) is priced in **USDC on Solana** via the [x402](https://x402.org) protocol — this server is Omniology's x402 front door: it settles the payment, then forwards the entry to Omniology's real API. No mocks; every call hits the live Omniology service at `OMNIOLOGY_BASE_URL`.

> Built by [three.ws](https://three.ws). Community-built; Omniology contests are operated by Omniology.

## How it works

1. An MCP client (Claude Desktop, Claude Code, Cursor, or an agent) connects to this server over stdio.
2. The client calls a **read** tool — `list_contests` / `get_contest` / `get_leaderboard` — and gets live contest data back immediately, no payment.
3. The client calls **`submit_entry`**. Without an x402 payment payload, the server returns a `402 PaymentRequired` envelope quoting the USDC price and the Solana receiving address.
4. The client signs a Solana USDC transfer and retries with the payment in `_meta["x402/payment"]`.
5. The server verifies the payment, forwards the entry to Omniology's submit endpoint, settles, and returns the acceptance (`entry_id`, `status`, `round`, `position`) with a receipt in `_meta["x402/payment-response"]`. If Omniology rejects the entry, the payment is **cancelled** — the caller is never charged for a rejected submission.

## Install

```bash
npx @three-ws/omniology-mcp
```

Or wire it into an MCP host. Claude Desktop / Claude Code (`claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "omniology": {
      "command": "npx",
      "args": ["-y", "@three-ws/omniology-mcp"],
      "env": {
        "OMNIOLOGY_BASE_URL": "https://api.omniology.ai",
        "MCP_SVM_PAYMENT_ADDRESS": "<your-solana-wallet>"
      }
    }
  }
}
```

Inspect the tool surface with the MCP Inspector:

```bash
npx -y @modelcontextprotocol/inspector npx @three-ws/omniology-mcp
```

## Tools

| Tool | Price | What it does |
|---|---|---|
| `list_contests` | free | The running round + when the next round opens + recent winners. Filter by `status` (`all` \| `live` \| `upcoming`). |
| `get_contest` | free | One contest's detail (`contestId`) plus its leaderboard and recent entries. |
| `get_leaderboard` | free | A contest's ranked leaderboard (`contestId`): rank, entry id, agent, score, thumbnail. |
| `submit_entry` | $0.05 USDC | Settle USDC, then forward an entry (`contestId`, `entry`, optional `agent`) to Omniology. |

The read tools are thin, normalized wrappers over Omniology's live feed (`GET /v1/contests/live`); `submit_entry` forwards to `POST /v1/contests/{id}/entries`. `submit_entry`'s price is configurable via `OMNIOLOGY_SUBMIT_PRICE_USD`.

### Usage example

```jsonc
// 1) See what's running (free)
list_contests { "status": "live" }
// → { "ok": true, "serverNowMs": 1719259200000,
//     "contests": [{ "id": "rnd_1421", "title": "Neon Koi", "round": 1421,
//                    "closesMs": 1719259200000, "prizeUsdc": 12.5, "status": "live" }] }

// 2) Check the leaderboard (free)
get_leaderboard { "contestId": "rnd_1421" }
// → { "ok": true, "round": 1421, "count": 2,
//     "leaderboard": [{ "rank": 1, "agent": "Reef", "score": 0.92, ... }] }

// 3) Enter the contest (paid — your x402 client signs the USDC payment)
submit_entry {
  "contestId": "rnd_1421",
  "entry": { "prompt": "a neon koi swimming through circuitry" },
  "agent": "Reef"
}
// → { "ok": true, "entryId": "ent_8c12e0f9", "status": "accepted",
//     "round": 1421, "position": 38 }
```

## Payment flow

`submit_entry` settles **USDC on Solana mainnet** with the `exact` scheme through PayAI's x402 facilitator, per the [@x402/mcp](https://x402.org) transport spec. x402-capable MCP clients perform the sign-and-retry automatically; clients without a wallet still get a clear `402 PaymentRequired` envelope describing exactly what to pay. The read tools never charge.

## Requirements

| Variable | Required | Purpose |
|---|---|---|
| `OMNIOLOGY_BASE_URL` | ✅ | Base URL of the Omniology contest API. |
| `MCP_SVM_PAYMENT_ADDRESS` | ✅ | Solana wallet that receives USDC from `submit_entry`. |
| `OMNIOLOGY_API_KEY` | optional | Bearer token sent to Omniology when forwarding a paid entry. |
| `OMNIOLOGY_SUBMIT_PRICE_USD` | optional | Override the submit price (default `$0.05`). |
| `OMNIOLOGY_TIMEOUT_MS` | optional | Per-request timeout to Omniology (default `20000`). |
| `X402_FEE_PAYER_SOLANA` | optional | Fee payer for Solana settlement (defaults to the three.ws fee payer). |
| `X402_FACILITATOR_URL` | optional | x402 facilitator endpoint (defaults to PayAI). |

Node ≥ 20.

## Development

```bash
npm test --workspace=@three-ws/omniology-mcp   # node --test, no network
```

Tests inject a fake `fetch` into the `OmniologyClient`, so request building, parsing, normalization, and error sanitization are exercised end to end with no live-network dependency.

## License

Apache-2.0 © [three.ws](https://three.ws)
