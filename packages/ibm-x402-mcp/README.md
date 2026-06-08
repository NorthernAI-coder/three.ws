# @three-ws/ibm-x402-mcp

**The world's first x402-enabled MCP server on IBM Cloud.**

An [MCP](https://modelcontextprotocol.io) server that exposes IBM Granite foundation models as pay-per-use tools via the [x402](https://x402.org) payment protocol. End users pay **USDC on Solana** per call — no IBM Cloud account required.

> Built by [three.ws](https://three.ws). Listed on IBM Cloud Partner Center.
> Full developer guide: **[docs/ibm-x402-mcp.md](https://github.com/nirholas/three.ws/blob/main/docs/ibm-x402-mcp.md)**.

---

## How it works

1. An MCP client (Claude Desktop, Claude Code, Cursor, etc.) connects to this server.
2. The client calls a tool — e.g. `ibm_granite_chat`.
3. The server responds with an x402 `PaymentRequired` envelope quoting the USDC price.
4. The client pays (signs a Solana USDC transaction via its x402-capable wallet).
5. The server verifies + settles the payment, calls IBM watsonx.ai, and returns the result.

The server operator supplies IBM credentials (`WATSONX_*`) and a receiving Solana wallet (`MCP_SVM_PAYMENT_ADDRESS`). End users supply only USDC.

---

## Tools

| Tool | What it does | Price |
|---|---|---|
| `ibm_granite_chat` | Conversational AI via IBM Granite 3 8B Instruct | $0.02 USDC |
| `ibm_granite_code` | Code generation, review, refactoring, testing, and documentation | $0.025 USDC |
| `ibm_granite_embed` | Batch text embeddings for RAG, semantic search, and clustering (up to 64 texts) | $0.005 USDC |
| `ibm_granite_analyze` | Structured document analysis: entities, sentiment, risk flags, summary, next steps | $0.04 USDC |
| `ibm_granite_forecast` | Zero-shot time-series forecasting via IBM Granite TTM | $0.05 USDC |

---

## Quickstart (server operator)

```bash
MCP_SVM_PAYMENT_ADDRESS=<your-solana-wallet> \
WATSONX_API_KEY=<ibm-api-key> \
WATSONX_PROJECT_ID=<watsonx-project-id> \
npx @three-ws/ibm-x402-mcp
```

---

## Configuration

### Required

| Env var | Description |
|---|---|
| `MCP_SVM_PAYMENT_ADDRESS` | Solana wallet that receives USDC payments from callers |
| `WATSONX_API_KEY` | IBM Cloud API key — [create one](https://cloud.ibm.com/iam/apikeys) |
| `WATSONX_PROJECT_ID` | watsonx.ai project id (Project → Manage → General → Project ID) |

### Optional

| Env var | Default | Description |
|---|---|---|
| `WATSONX_SPACE_ID` | — | Deployment space id (alternative to `WATSONX_PROJECT_ID`) |
| `WATSONX_URL` | `https://us-south.ml.cloud.ibm.com` | Regional inference host |
| `WATSONX_MODEL_ID` | `ibm/granite-3-8b-instruct` | Default chat/generation model |
| `WATSONX_EMBED_MODEL_ID` | `ibm/granite-embedding-278m-multilingual` | Default embedding model |
| `X402_FEE_PAYER_SOLANA` | three.ws fee payer | Solana account sponsoring tx fees |
| `X402_FACILITATOR_URL` | `https://facilitator.payai.network` | x402 payment facilitator |
| `X402_FACILITATOR_TOKEN` | — | Bearer token for the facilitator |
| `X402_ASSET_MINT_SOLANA` | USDC mainnet mint | USDC mint override |

Regional hosts: `us-south`, `eu-de`, `eu-gb`, `jp-tok`, `au-syd`, `ca-tor`
→ e.g. `https://eu-de.ml.cloud.ibm.com`

---

## Wire into Claude Desktop / Claude Code / Cursor

```json
{
  "mcpServers": {
    "ibm-x402": {
      "command": "npx",
      "args": ["-y", "@three-ws/ibm-x402-mcp"],
      "env": {
        "MCP_SVM_PAYMENT_ADDRESS": "your-solana-wallet-address",
        "WATSONX_API_KEY": "your-ibm-cloud-api-key",
        "WATSONX_PROJECT_ID": "your-watsonx-project-id"
      }
    }
  }
}
```

---

## Tool examples

### `ibm_granite_chat`
```jsonc
{
  "messages": [
    { "role": "system", "content": "You are an expert data engineer." },
    { "role": "user", "content": "Design a lakehouse schema for IoT sensor telemetry." }
  ],
  "max_new_tokens": 1024,
  "temperature": 0.7
}
```

### `ibm_granite_code`
```jsonc
{
  "task": "review",
  "prompt": "def calculate_roi(revenue, cost): return revenue / cost",
  "language": "Python"
}
```

### `ibm_granite_embed`
```jsonc
{
  "inputs": [
    "enterprise data governance",
    "cloud-native AI pipeline",
    "real-time analytics"
  ]
}
```

### `ibm_granite_analyze`
```jsonc
{
  "document": "This Software License Agreement is entered into between...",
  "analysis_type": "contract"
}
```

### `ibm_granite_forecast`
```jsonc
{
  "timestamps": ["2025-01-01T00:00:00Z", "2025-01-02T00:00:00Z"],
  "values": [12500, 13200],
  "freq": "1D",
  "prediction_length": 14,
  "label": "daily_revenue_usd"
}
```

---

## Payment flow

This server uses the [x402 protocol](https://x402.org) for micropayments:

1. Client calls a tool without payment → receives `402 PaymentRequired` with USDC amount + Solana address.
2. Client builds a signed Solana USDC transfer transaction.
3. Client retries with the signed tx in `_meta["x402/payment"]`.
4. Server verifies via the [PayAI facilitator](https://facilitator.payai.network).
5. Server calls IBM watsonx.ai and settles the payment.
6. Response includes `_meta["x402/payment-response"]` with the settlement receipt.

x402-capable MCP clients handle this flow automatically.

---

## Architecture

```
MCP Client (Claude Desktop / Cursor / agent)
       │  tools/call (with x402 payment in _meta)
       ▼
ibm-x402-mcp (stdio MCP server)
       │  verify + settle USDC on Solana
       ├──► PayAI Facilitator (https://facilitator.payai.network)
       │
       │  inference call with Bearer token
       └──► IBM watsonx.ai (us-south.ml.cloud.ibm.com)
                 └── IBM Granite 3 8B Instruct / Embedding / TTM
```

---

## License

Apache-2.0 · Built by [three.ws](https://three.ws)
