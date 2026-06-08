# @3d-agent/mcp-server

Four paid MCP tools from [three.ws](https://three.ws) — pose generation, pump.fun token snapshots, ERC-8004 agent reputation, and Solana vanity address mining. Each call is settled in USDC via the [x402](https://x402.org) payment protocol. No subscription, no API key — pay per call.

---

## Quickstart (30 seconds)

Paste this into your **Claude Desktop** config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "3d-agent": {
      "command": "npx",
      "args": ["-y", "@3d-agent/mcp-server"],
      "env": {
        "MCP_EVM_PAYMENT_ADDRESS": "0xYourBaseWallet",
        "MCP_SVM_PAYMENT_ADDRESS": "YourSolanaWallet"
      }
    }
  }
}
```

Restart Claude Desktop. The four tools appear immediately — no install step required.

**Using Claude Code?** Run `/setup-mcp` in any project that includes this repo and Claude will detect your OS, collect your wallet addresses, and write the config for you.

---

## Tools

| Tool | Price | What it returns |
|------|-------|-----------------|
| `mesh_forge` | $0.25 | Textured 3D GLB from a **text prompt or a reference image**. Text mode runs a chain of specialist models — an IBM Granite "prompt director" rewrites the prompt into an optimized single-subject 3D spec, FLUX renders a reference image, and Microsoft TRELLIS / Tencent Hunyuan3D reconstruct the mesh. Image mode (`image_url`) reconstructs directly. Returns the durable `glbUrl`, a three.ws viewer `preview`, the `directedPrompt`, and timing. |
| `rig_mesh` | $0.20 | Auto-rig a static GLB into an animation-ready model — humanoid skeleton + per-vertex skin weights via VAST-AI UniRig. Takes a `glb_url` (e.g. `mesh_forge`'s output), returns the `riggedGlbUrl` and a three.ws pose-studio link. |
| `text_to_avatar` | $0.15 | Textured 3D GLB avatar from a text prompt or reference image URLs, driving Replicate (Hunyuan-3D 3.1 by default). Returns the GLB URL, model version, prediction id, and timing. |
| `get_pose_seed` | $0.001 | Deterministic seed + full Euler-rotation pose map (radians) for the three.ws pose-studio mannequin, matched from the in-repo preset library. Includes a `previewUrl` at `https://three.ws/pose?seed=…&preset=…`. |
| `pump_snapshot` | $0.005 | Live token snapshot — USD price (Jupiter), 24h volume + pair (Dexscreener), mint metadata + image (pump.fun frontend-api-v3), and on-chain top-holder distribution (Solana RPC). Adds Helius DAS data when `HELIUS_API_KEY` is set. |
| `agent_reputation` | $0.01 | ERC-8004 reputation: `getReputation`, `getTotalStake`, and the latest `ReputationSubmitted` / `ReputationStaked` events from the canonical ReputationRegistry on the requested chain (default Base). Resolves `agentId` from a wallet address automatically. |
| `vanity_grinder` | $0.05 | Solana keypair whose base58 address starts with `prefix` (and optionally ends with `suffix`). Returns the full base58 secret key — treat as a secret. Flat `exact` price (override with `MCP_VANITY_PRICE_USD`); a difficulty guard rejects prefixes too long to mine within the iteration cap. |

---

## Installation

The server runs locally on your machine and speaks stdio JSON-RPC — your MCP client spawns it automatically via the `npx` command above. You do not need to `npm install` globally.

If you prefer a global install:

```bash
npm install -g @3d-agent/mcp-server
```

Then replace `"command": "npx", "args": ["-y", "@3d-agent/mcp-server"]` with `"command": "3d-agent-mcp"` in your config.

---

## Environment variables

### Required (at least one)

| Var | Description |
|-----|-------------|
| `MCP_EVM_PAYMENT_ADDRESS` | Base USDC payout address (`0x...`) |
| `MCP_SVM_PAYMENT_ADDRESS` | Solana USDC payout address (base58) |

### Optional

| Var | Default | Description |
|-----|---------|-------------|
| `HELIUS_API_KEY` | unset | Adds Helius DAS enrichment to `pump_snapshot` |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint for `pump_snapshot` and `vanity_grinder` |
| `CDP_API_KEY_ID` | unset | Coinbase CDP facilitator — recommended for Base + Bazaar discovery |
| `CDP_API_KEY_SECRET` | unset | Coinbase CDP facilitator secret |
| `X402_CDP_FACILITATOR_URL` | CDP default | Override CDP facilitator URL |
| `MCP_POSE_PREVIEW_BASE` | `https://three.ws/pose` | Base URL for `get_pose_seed` preview links |
| `MCP_AGENT_REP_RPC_<chainId>` | public RPC | Per-chain RPC override for `agent_reputation` |
| `MCP_AGENT_REP_LOG_WINDOW` | `200000` | Block window for `agent_reputation` event scan |

---

## Claude Code slash commands

This repo ships three slash commands in `.claude/commands/` that work in any project that references this repo:

| Command | What it does |
|---------|--------------|
| `/setup-mcp` | Detects your OS, collects wallet addresses, and writes the MCP config to the right file |
| `/scaffold-agent` | Scaffolds a new three.ws agent in the current project with MCP client wiring |
| `/use-tools [tool_name]` | Produces a complete, runnable code example for a specific paid tool |

---

## Programmatic client

Use `@x402/mcp`'s `wrapMCPClientWithPayment` to call these tools from another Node service. The wrapper auto-handles 402 retries:

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { wrapMCPClientWithPayment } from '@x402/mcp';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@3d-agent/mcp-server'],
  env: {
    MCP_EVM_PAYMENT_ADDRESS: process.env.MCP_EVM_PAYMENT_ADDRESS,
    MCP_SVM_PAYMENT_ADDRESS: process.env.MCP_SVM_PAYMENT_ADDRESS ?? '',
  },
});

const mcp = new Client({ name: 'agent', version: '1.0.0' });
await mcp.connect(transport);

const account = privateKeyToAccount(process.env.AGENT_EVM_PRIVATE_KEY);
const x402 = new x402Client().register('eip155:8453', new ExactEvmScheme(account));
const paid = wrapMCPClientWithPayment(mcp, x402, { autoPayment: true });

const result = await paid.callTool('get_pose_seed', { prompt: 'warrior stance' });
console.log(JSON.parse(result.content[0].text));
```

---

## Cursor

In Cursor's MCP settings (`Cursor > Settings > Features > MCP`):

```json
{
  "mcpServers": {
    "3d-agent": {
      "command": "npx",
      "args": ["-y", "@3d-agent/mcp-server"],
      "env": {
        "MCP_EVM_PAYMENT_ADDRESS": "0xYourBaseWallet",
        "MCP_SVM_PAYMENT_ADDRESS": "YourSolanaWallet"
      }
    }
  }
}
```

---

## Run from source

From the monorepo root:

```bash
npm install
node mcp-server/src/index.js
```

Inspect tools interactively:

```bash
npm run inspect --prefix mcp-server
```

---

## Payment flow

The server is the x402 **resource server**. On each tool call:

1. Client sends a `tools/call` request (no payment yet).
2. Server returns `PaymentRequired` (v2 MCP transport spec) with the USDC amount and payment address.
3. A payment-aware client (or `wrapMCPClientWithPayment`) signs and submits the on-chain payment.
4. Client retries the `tools/call` with `_meta["x402/payment"]` attached.
5. Server verifies + settles via the configured facilitator, runs the tool, and returns the result with `_meta["x402/payment-response"]`.

Every tool settles in USDC on **Solana mainnet** with the `exact` scheme (`@x402/svm` ships no `upto`/metered scheme). Each tool quotes a fixed price; there is no post-hoc metering.

A successful result carries the tool's JSON in two forms: `content[0].text` (for text-only clients) and `structuredContent` (MCP 2025-06-18 structured output — a ready-to-use object). A tool-level error sets `isError: true`, and the x402 wrapper **cancels rather than settles** the payment, so failed calls do not bill the caller.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│ Claude Desktop  │────▶│  @3d-agent/mcp      │────▶│  x402 facilitator    │
│  / Cursor /     │     │   (stdio transport) │     │  (PayAI — Solana     │
│  your agent     │     │                     │     │   USDC, exact)       │
└─────────────────┘     └─────────────────────┘     └──────────────────────┘
```

Source: [`mcp-server/`](https://github.com/nirholas/three.ws/tree/main/mcp-server)

---

## License

Apache-2.0 — see [LICENSE](LICENSE).
