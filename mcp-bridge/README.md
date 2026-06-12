# @3d-agent/mcp-bridge

MCP stdio bridge that turns **any x402-paid HTTP endpoint** into a Claude-callable tool.
The bridge handles 402 → sign → retry transparently using the [@x402](https://github.com/x402-foundation/x402) SDK.

## What it exposes

On startup the bridge registers:

| Tool                 | What it does                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `call_paid_endpoint` | Fallback: hit any URL, auto-pay if it returns 402. Returns the resource response + parsed settlement.     |
| `list_bazaar_tools`  | Returns the cached list of Bazaar-discovered tools (name, resource, accepted payment terms).              |
| `refresh_bazaar`     | Re-queries the x402 Bazaar and re-registers dynamic tools without restarting.                             |
| `paid_<derived>` …   | One tool per discovered Bazaar resource (up to `MCP_BRIDGE_DISCOVER_LIMIT`), with that endpoint's schema. |

### Tool annotations

Every tool carries MCP `ToolAnnotations` so hosts can apply the right confirmation policy:

- `call_paid_endpoint` and every dynamic `paid_*` tool: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: true`. **These spend real USDC** — each call settles a payment (capped by `MCP_BRIDGE_MAX_PRICE_PER_CALL_ATOMIC`), and retrying is a new charge. They never delete or overwrite caller state, hence not destructive.
- `list_bazaar_tools`: `readOnlyHint: true`, `idempotentHint: true`, `openWorldHint: false`. Pure in-process cache read; free, no network.
- `refresh_bazaar`: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: true`. Free (no payment), but it mutates the registered tool set from the live Bazaar feed, so repeat calls can differ.

Tool results that are plain objects are returned as both a JSON `text` block (backward compatible) and `structuredContent` for typed clients.

Payment paths registered on the buyer client:

- `eip155:*` → `BatchSettlementEvmScheme` (preferred when the server advertises it; voucher-based, no per-call gas)
- `eip155:*` → `ExactEvmScheme` (used when the server advertises `scheme: "exact"`)
- `solana:*` → `ExactSvmScheme` (USDC SPL transfer co-signed by the advertised fee payer)

Batch-settlement channel state is persisted to `~/.x402-mcp-bridge/channels/client/` so
Claude Desktop restarts do not re-deposit on the next call.

## Environment

| Variable                               | Required                | Default                                                             | Notes                                                                              |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `MCP_BRIDGE_EVM_PRIVATE_KEY`           | one of EVM/SVM required | —                                                                   | 0x-prefixed 32-byte hex. Funds USDC payments on Base, Arbitrum, etc.               |
| `MCP_BRIDGE_SVM_PRIVATE_KEY`           | one of EVM/SVM required | —                                                                   | base58 64-byte secret key (Phantom/solana-keygen format) **or** 64-int JSON array. |
| `MCP_BRIDGE_MAX_PRICE_PER_CALL_ATOMIC` | no                      | `100000` (= $0.10 USDC at 6 decimals)                               | Per-call spending cap. Payment aborts above this with a clear reason.              |
| `MCP_BRIDGE_DISCOVER_LIMIT`            | no                      | `20`                                                                | Max number of Bazaar tools to register dynamically. Set `0` to disable discovery.  |
| `MCP_BRIDGE_BAZAAR_URL`                | no                      | `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` | Override to point at a self-hosted or alternative bazaar.                          |
| `MCP_BRIDGE_BATCH_DEPOSIT_MULTIPLIER`  | no                      | `5`                                                                 | How many request-amounts to deposit at once when opening a batch channel.          |
| `MCP_BRIDGE_MAX_DEPOSIT_ATOMIC`        | no                      | `5000000` (= $5.00 USDC)                                            | Hard cap on the deposit amount per channel open / top-up.                          |
| `X402_MCP_BRIDGE_CHANNELS_DIR`         | no                      | `~/.x402-mcp-bridge/channels`                                       | Override the directory used by `FileClientChannelStorage`.                         |
| `RPC_URL_<chainId>`                    | no                      | viem default public RPC                                             | Per-chain RPC override. Example: `RPC_URL_8453=https://mainnet.base.org`.          |

`MCP_BRIDGE_*` env vars also fall back to `EVM_PRIVATE_KEY` / `SVM_PRIVATE_KEY` if you
already have those set for the rest of this repo.

## Smoke test (without Claude Desktop)

```bash
# Once env is set, list the registered tools via the MCP inspector
npx @modelcontextprotocol/inspector node mcp-bridge/src/index.js
```

The inspector connects over stdio, lists the static tools (`call_paid_endpoint`,
`list_bazaar_tools`, `refresh_bazaar`), and one dynamic tool per discovered Bazaar entry.

## Claude Desktop config

Paste this into `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS
(or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
	"mcpServers": {
		"x402-bridge": {
			"command": "node",
			"args": ["/absolute/path/to/three.ws/mcp-bridge/src/index.js"],
			"env": {
				"MCP_BRIDGE_EVM_PRIVATE_KEY": "0x…your buyer key…",
				"MCP_BRIDGE_SVM_PRIVATE_KEY": "…base58 64-byte secret key…",
				"MCP_BRIDGE_MAX_PRICE_PER_CALL_ATOMIC": "100000",
				"MCP_BRIDGE_DISCOVER_LIMIT": "20"
			}
		}
	}
}
```

Restart Claude Desktop. The bridge appears under **Settings → Developer → MCP servers**;
expand it to confirm the tool list. Asking Claude something like
"pay $0.01 on Base for a weather report" causes it to pick a matching Bazaar tool, call
the bridge, and the bridge auto-pays via x402.

## Cursor config

`~/.cursor/mcp.json`:

```json
{
	"mcpServers": {
		"x402-bridge": {
			"command": "node",
			"args": ["/absolute/path/to/three.ws/mcp-bridge/src/index.js"],
			"env": {
				"MCP_BRIDGE_EVM_PRIVATE_KEY": "0x…",
				"MCP_BRIDGE_SVM_PRIVATE_KEY": "…"
			}
		}
	}
}
```

## Server-to-server use

Inside this repo, any module that wants to consume an x402 endpoint can import
the buyer factory directly:

```js
import { buildBuyerAxios } from '../mcp-bridge/src/x402-axios-client.js';

const { api } = await buildBuyerAxios();
const res = await api.get('https://api.example.com/some-paid-resource');
```

The same spending cap and channel-storage rules apply.

## Spending cap behavior

`onBeforePaymentCreation` inspects the selected `accepts` entry and aborts payload
creation if `amount` (atomic units) exceeds `MCP_BRIDGE_MAX_PRICE_PER_CALL_ATOMIC`.
The tool result then carries a clear error message naming the network, asset, and
the cap that was exceeded — useful for the LLM to decide whether to ask the user
to raise the limit.

## Cooperative refunds

Idle batch channels can be refunded out-of-band with the SDK:

```js
import { buildBuyerAxios } from './mcp-bridge/src/x402-axios-client.js';
// then call client.refund(resourceUrl, { amount }) once USE-09's
// scripts/x402-batch-refund.mjs lands; until then refunds run via the SDK directly.
```
