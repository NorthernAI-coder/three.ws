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
        "MCP_SVM_PAYMENT_ADDRESS": "YourSolanaWallet"
      }
    }
  }
}
```

Restart Claude Desktop. All tools appear immediately — no install step required.

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

### Required

| Var | Description |
|-----|-------------|
| `MCP_SVM_PAYMENT_ADDRESS` | Solana USDC payout address (base58) where tools receive payment. Falls back to `X402_PAY_TO_SOLANA` / `X402_PAY_TO`. |

### Optional

| Var | Default | Description |
|-----|---------|-------------|
| `HELIUS_API_KEY` | unset | Adds Helius DAS enrichment to `pump_snapshot` |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Primary Solana RPC for `pump_snapshot` / AgenC reads |
| `SOLANA_RPC_URLS` | built-in public set | **Failover** — comma-separated Solana RPCs tried in order; first healthy one answers |
| `MCP_EVM_RPC_<chainId>` | built-in public set | **Failover** — comma-separated EVM RPCs for that chain (`agent_reputation`, ENS uses chain 1) |
| `X402_FACILITATOR_URL_SOLANA` | `https://facilitator.payai.network` | Primary PayAI Solana facilitator that verifies + settles payments |
| `X402_FACILITATOR_URLS_SOLANA` | unset | **Failover** — comma-separated facilitators; earlier entries take precedence at init, a later one covers an outage |
| `X402_FACILITATOR_TOKEN_SOLANA` | unset | Bearer token for the Solana facilitator, if required |
| `X402_FEE_PAYER_SOLANA` | three.ws default | Fee payer for the settlement transaction |
| `MCP_VANITY_PRICE_USD` | `$0.05` | Flat price for `vanity_grinder` |
| `MCP_POSE_PREVIEW_BASE` | `https://three.ws/pose` | Base URL for `get_pose_seed` preview links |
| `MCP_AGENT_REP_RPC_<chainId>` | public RPC | Per-chain RPC override for `agent_reputation` (tried before the failover set) |
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
import { registerExactSvmScheme } from '@x402/svm/exact/client';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@3d-agent/mcp-server'],
  env: {
    // Where the server receives USDC. Your client funds payments from the
    // Solana keypair below.
    MCP_SVM_PAYMENT_ADDRESS: process.env.MCP_SVM_PAYMENT_ADDRESS,
  },
});

const mcp = new Client({ name: 'agent', version: '1.0.0' });
await mcp.connect(transport);

// Solana mainnet, `exact` scheme — the only network/scheme these tools accept.
const payer = Keypair.fromSecretKey(bs58.decode(process.env.AGENT_SOLANA_SECRET_KEY));
const x402 = new x402Client();
registerExactSvmScheme(x402, { signer: payer });
const paid = wrapMCPClientWithPayment(mcp, x402, { autoPayment: true });

const result = await paid.callTool('get_pose_seed', { prompt: 'warrior stance' });
// Prefer MCP structured output; fall back to the text mirror for older servers.
console.log(result.structuredContent ?? JSON.parse(result.content[0].text));
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

## Reliability & failover

Every external dependency has a backup path, so a single provider blip doesn't take a tool down — and no call can hang a paid request indefinitely.

- **Every outbound HTTP call** runs through a shared resilient layer (`src/lib/resilient-fetch.js`): a hard per-attempt timeout plus jittered exponential-backoff retries on transient `429`/`5xx`/network errors, honoring `Retry-After`. Retries are restricted to idempotent reads by default — a non-idempotent action like `agent_delegate_action` gets the timeout but is **never** silently replayed.
- **Solana RPC** (`src/lib/solana-rpc.js`) fails over across an ordered endpoint list (`SOLANA_RPC_URLS`, else the primary, else a built-in public set). A throttling or down endpoint rotates to the back and the next one answers.
- **EVM RPC** (`src/lib/evm-rpc.js`) uses an ethers `FallbackProvider` (quorum 1) over multiple endpoints per chain (`MCP_EVM_RPC_<chainId>` or built-in redundancy), each request timeout-bounded.
- **The x402 facilitator** accepts a comma-separated `X402_FACILITATOR_URLS_SOLANA`: earlier entries take precedence at init, and a later facilitator covers the Solana `exact` kind if the primary's `/supported` is unreachable.
- **Data fallback:** `pump_snapshot` cross-fills its USD price from Dexscreener when Jupiter is unavailable, and each upstream fails soft to a `null`/`{ error }` field rather than failing the whole snapshot.

For maximum redundancy, set dedicated endpoints rather than relying on the public defaults:

```bash
SOLANA_RPC_URLS="https://your-primary-rpc,https://your-secondary-rpc"
MCP_EVM_RPC_8453="https://your-base-rpc,https://base-rpc.publicnode.com"
X402_FACILITATOR_URLS_SOLANA="https://facilitator.payai.network,https://your-backup-facilitator"
```

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
