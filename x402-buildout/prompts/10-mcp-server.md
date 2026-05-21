# USE-10: MCP Server — Paid tools for Claude Desktop / Cursor

## Goal
Expose this repo's capabilities (pose generation, vanity grinding, Pump.fun queries, agent reputation lookups) as paid MCP tools. AI agents call tools, the server returns 402 with `PaymentRequired`, agents auto-pay via x402-MCP transport.

## Why
- We have a real catalog of agent-usable tools (USE-29..40 each produce one).
- MCP is the standard way Claude Desktop and Cursor talk to local services. Charging via x402 over MCP is the canonical agent-payments path.

## Reference
- MCP transport spec: [/tmp/x402-docs/specs/transports-v2/mcp.md](/tmp/x402-docs/specs/transports-v2/mcp.md)
- Guide: [/tmp/x402-docs/docs/guides/mcp-server-with-x402.md](/tmp/x402-docs/docs/guides/mcp-server-with-x402.md)
- `@x402/mcp`: [typescript/packages/mcp](https://github.com/x402-foundation/x402/tree/main/typescript/packages/mcp)
- Server example: [examples/typescript/servers/mcp](https://github.com/x402-foundation/x402/tree/main/examples/typescript/servers/mcp)

## Dependencies
- USE-00, USE-01, USE-02 (or USE-03 for SVM tools)

## Files to create
- `mcp-server/` — new workspace (add to root `package.json` `workspaces`)
- `mcp-server/package.json` — `name: "@3d-agent/mcp-server"`
- `mcp-server/src/index.js` — entry point using `@modelcontextprotocol/sdk` + `@x402/mcp`
- `mcp-server/src/tools/pose-seed.js` — paid tool for the pose-studio
- `mcp-server/src/tools/pump-snapshot.js` — paid tool returning Pump.fun snapshot
- `mcp-server/src/tools/agent-reputation.js` — paid tool reading on-chain reputation
- `mcp-server/src/tools/vanity-grinder.js` — paid `upto`-scheme tool for vanity addresses
- `mcp-server/README.md` — Claude Desktop and Cursor config instructions

## Files to modify
- Root `package.json` — add `mcp-server` to workspaces
- `.env.example` — `MCP_EVM_PAYMENT_ADDRESS`, `MCP_SVM_PAYMENT_ADDRESS` (can reuse main env vars)
- `vercel.json` — N/A (MCP server runs locally via stdio transport)

## Implementation

### Server skeleton
```js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPaymentWrapper, x402MCPServer } from "@x402/mcp";
import { getResourceServer } from "../../api/_lib/x402/sdk.js";

const server = new McpServer({ name: "3d-agent-mcp", version: "1.0.0" });
const resourceServer = getResourceServer({ networks: ["evm", "svm"] });

const wrap = (accepts, handler) => createPaymentWrapper(resourceServer, { accepts, ... });

server.tool("get_pose_seed", "...", { prompt: z.string() }, wrap(poseSeedAccepts, async ({ prompt }) => { ... }));

await server.connect(new StdioServerTransport());
```

### Bazaar discovery
Pass `declareDiscoveryExtension(...)` in each tool's payment wrapper config so the facilitator catalogs the tool. See USE-13.

### Tool catalog
- `get_pose_seed(prompt: string)` — `exact` $0.001 — returns `{ seed, parameters, previewUrl }`
- `pump_snapshot(token: string)` — `exact` $0.005 — returns `{ price, volume24h, holders, image }`
- `agent_reputation(address: string)` — `exact` $0.01 — returns reputation score + on-chain attestations
- `vanity_grinder(prefix: string)` — `upto` $0.50 — actual cost scales with attempts; returns address + private key only over secure channel

### Distribution
Provide ready-to-paste Claude Desktop config in the README:
```json
{
  "mcpServers": {
    "3d-agent": {
      "command": "node",
      "args": ["<absolute path>/mcp-server/src/index.js"],
      "env": {
        "EVM_PAYMENT_ADDRESS": "0x...",
        "SVM_PAYMENT_ADDRESS": "..."
      }
    }
  }
}
```

## Wiring checklist
- [ ] MCP server starts standalone via `node mcp-server/src/index.js`
- [ ] Tools advertise `PaymentRequired` correctly on first call (per spec: `isError: true` + `structuredContent` + `content[0].text`)
- [ ] Settlement response carried in `_meta["x402/payment-response"]`
- [ ] Bazaar discovery extension declared per tool
- [ ] README has working Claude Desktop config

## Acceptance
- [ ] Claude Desktop with the server configured can call `get_pose_seed` and receive the data after paying
- [ ] Cursor's MCP integration works against the same server
- [ ] `npx @modelcontextprotocol/inspector` connects to the server and lists tools
- [ ] Tool calling without payment returns the 402 PaymentRequired in `structuredContent`
- [ ] Each tool produces a real, useful result — no demo strings
