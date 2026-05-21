# @3d-agent/mcp-server

A local MCP server that exposes the three.ws stack as **paid MCP tools** for
Claude Desktop, Cursor, and any MCP-compatible client. Each tool quotes a
USDC price; calls without payment return an `x402` `PaymentRequired`
envelope (v2 MCP transport spec — `isError: true` + `structuredContent` +
`content[0].text`). Successful settlements are returned in
`_meta["x402/payment-response"]` per the spec.

## Tools

| Tool | Scheme | Price | What it returns |
|------|--------|-------|-----------------|
| `get_pose_seed` | `exact` | $0.001 | Deterministic seed + full Euler-rotation pose map (radians) for the three.ws pose-studio mannequin, picked from the in-repo preset library by matching prompt tokens against preset IDs/labels/groups. Includes a previewUrl pointing at `https://three.ws/pose?seed=…&preset=…`. |
| `pump_snapshot` | `exact` | $0.005 | Live token snapshot — USD price (Jupiter), 24h volume + pair (Dexscreener), mint metadata + image (pump.fun frontend-api-v3), and on-chain top-holder distribution (Solana RPC `getTokenLargestAccounts`). Adds Helius DAS data when `HELIUS_API_KEY` is set. |
| `agent_reputation` | `exact` | $0.01 | ERC-8004 reputation: aggregate `getReputation`, `getTotalStake`, and the latest `ReputationSubmitted` / `ReputationStaked` events from the canonical ReputationRegistry on the requested chain (default Base). Resolves agentId from a wallet when the input is an EVM address. |
| `vanity_grinder` | `upto` | up to $0.50 | Solana keypair whose base58 address starts with the chosen `prefix` (and optionally ends with `suffix`). Returns the full base58 secret key — handle as a secret. Actual settled USDC scales with iterations: `$0.01 base + $0.0000001 per attempt`, capped at $0.50. |

All four tools are advertised to the x402 Bazaar via the per-tool
`declareDiscoveryExtension({ toolName, transport: 'stdio', inputSchema, … })`
extension that ships in the payment-required envelope. Bazaar-enabled
facilitators index these tools under `type: "mcp"` once a buyer pays for them.

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│ Claude Desktop  │────▶│  @3d-agent/mcp      │────▶│ x402 facilitator     │
│  / Cursor       │     │   (stdio transport) │     │ (CDP for Base,       │
│                 │     │                     │     │  PayAI for Solana)   │
└─────────────────┘     └─────────────────────┘     └──────────────────────┘
        │                       │
        │ tools/call (no _meta) │   1. extract _meta["x402/payment"]
        │──────────────────────▶│   2. resourceServer.verifyPayment
        │                       │   3. run tool handler
        │                       │   4. resourceServer.settlePayment
        │                       │   5. attach _meta["x402/payment-response"]
        │ result + payment-meta │
        │◀──────────────────────│
```

The server itself is the x402 **resource server**. It owns:

- A shared `x402ResourceServer` with `ExactEvmScheme` (eip155:*),
  `UptoEvmScheme` (vanity grinder), and `ExactSvmScheme` (solana:*) registered.
- A CDP `HTTPFacilitatorClient` when `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`
  are set (preferred for Base — required for CDP Bazaar discovery).
- PayAI HTTP facilitators as fallback (Base + Solana).

See [`src/payments.js`](src/payments.js).

## Wallet config

Set at least one of:

- `MCP_EVM_PAYMENT_ADDRESS` (or `X402_PAY_TO_BASE`) — Base USDC payouts.
- `MCP_SVM_PAYMENT_ADDRESS` (or `X402_PAY_TO_SOLANA`) — Solana USDC payouts.

Default USDC assets (overridable):

- Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (`X402_ASSET_ADDRESS_BASE`).
- Solana: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (`X402_ASSET_MINT_SOLANA`).

CDP facilitator (recommended for Base + Bazaar):

```
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
X402_CDP_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402
```

Without CDP credentials the server falls back to the public PayAI facilitator
(`X402_FACILITATOR_URL_BASE`, `X402_FACILITATOR_URL_SOLANA`,
`X402_FACILITATOR_TOKEN_*`).

Tool-specific config:

| Env var | Used by | Default |
|---------|---------|---------|
| `SOLANA_RPC_URL` | `pump_snapshot`, `vanity_grinder` | `https://api.mainnet-beta.solana.com` |
| `HELIUS_API_KEY` | `pump_snapshot` (optional) | unset |
| `MCP_POSE_PREVIEW_BASE` | `get_pose_seed` previewUrl | `https://three.ws/pose` |
| `MCP_AGENT_REP_RPC_<chainId>` | `agent_reputation` per-chain RPC override | public RPC for that chain |
| `MCP_AGENT_REP_LOG_WINDOW` | `agent_reputation` event scan window (blocks) | `200000` |

## Run standalone

From the monorepo root:

```bash
npm install
node mcp-server/src/index.js
```

The server speaks stdio JSON-RPC and prints `[mcp-server] ready — 4 paid
tools registered over stdio` to stderr once initialization finishes.

### MCP inspector

```bash
npx -y @modelcontextprotocol/inspector node mcp-server/src/index.js
```

Then in the inspector UI, list tools and try calling `get_pose_seed` with
`{ "prompt": "wave hello" }`. The first call returns the
`PaymentRequired` envelope; the inspector lets you craft an `_meta`
payload to retry with a real x402 payment.

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "3d-agent": {
      "command": "node",
      "args": ["/absolute/path/to/three.ws/mcp-server/src/index.js"],
      "env": {
        "MCP_EVM_PAYMENT_ADDRESS": "0xYourBaseWallet",
        "MCP_SVM_PAYMENT_ADDRESS": "YourSolanaWallet",
        "CDP_API_KEY_ID": "...",
        "CDP_API_KEY_SECRET": "...",
        "SOLANA_RPC_URL": "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY",
        "HELIUS_API_KEY": "YOUR_HELIUS_KEY"
      }
    }
  }
}
```

Restart Claude Desktop. The four tools appear under "3d-agent" in the
tool picker. Ask Claude: *"Use get_pose_seed to give me a warrior pose."*

## Cursor

In Cursor's settings (`Cursor > Settings > Features > MCP`):

```json
{
  "mcpServers": {
    "3d-agent": {
      "command": "node",
      "args": ["/absolute/path/to/three.ws/mcp-server/src/index.js"],
      "env": {
        "MCP_EVM_PAYMENT_ADDRESS": "0xYourBaseWallet",
        "MCP_SVM_PAYMENT_ADDRESS": "YourSolanaWallet"
      }
    }
  }
}
```

Cursor's MCP integration handles the x402 payment loop automatically when
its companion x402 client is configured. Otherwise the agent will see the
`PaymentRequired` envelope and can negotiate payment programmatically.

## Programmatic client

Use `@x402/mcp`'s `x402MCPClient` (or `createx402MCPClient` factory) to call
these tools from another Node service. The client auto-handles 402 retries:

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { wrapMCPClientWithPayment } from '@x402/mcp';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/abs/path/three.ws/mcp-server/src/index.js'],
});
const mcp = new Client({ name: 'agent', version: '1.0.0' });
await mcp.connect(transport);

const account = privateKeyToAccount(process.env.AGENT_EVM_PRIVATE_KEY);
const x402 = new x402Client().register('eip155:8453', new ExactEvmScheme(account));
const paid = wrapMCPClientWithPayment(mcp, x402, { autoPayment: true });

const result = await paid.callTool('get_pose_seed', { prompt: 'warrior stance' });
console.log(JSON.parse(result.content[0].text));
```

## Notes on the `upto` flow

`vanity_grinder` uses the x402 `upto` scheme: the client signs an
authorization for a maximum of $0.50 USDC, and the server-side
`paidUpto()` wrapper calls `resourceServer.settlePayment(...,
settlementOverrides: { amount: <actual> })` so the facilitator settles the
real metered amount. The Permit2 nonce makes each authorization
single-use; partial settlement is enforced by the facilitator contract.

## Pricing source-of-truth

Per-tool prices are declared in each tool file's `priceUsd` argument to
`paid()` / `paidUpto()`. Changing them is a one-line edit per tool.
