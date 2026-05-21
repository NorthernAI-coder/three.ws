# USE-11: MCP Client — Auto-pay tool bridge

## Goal
Build an MCP client that any consumer agent in this repo can use to call paid MCP tools — automatically handling payment. Also expose this as a Claude Desktop MCP server itself so a user's Claude can call OUR x402 endpoints via a payment-bridge.

## Why
- Our agents need to consume paid tools (e.g., the prediction oracle calls a paid search API).
- Users with Claude Desktop want a single MCP bridge that turns "any x402 endpoint" into a paid Claude-callable tool — without manually building each bridge.

## Reference
- MCP guide: [/tmp/x402-docs/docs/guides/mcp-server-with-x402.md](/tmp/x402-docs/docs/guides/mcp-server-with-x402.md)
- Client example: [examples/typescript/clients/mcp](https://github.com/x402-foundation/x402/tree/main/examples/typescript/clients/mcp)
- Chatbot example: [examples/typescript/clients/mcp-chatbot](https://github.com/x402-foundation/x402/tree/main/examples/typescript/clients/mcp-chatbot)

## Dependencies
- USE-00, USE-06, USE-07, USE-09
- USE-10 (something paid to call)

## Files to create
- `mcp-bridge/` — new workspace
- `mcp-bridge/package.json`
- `mcp-bridge/src/index.js` — MCP server that exposes a single tool `call_paid_endpoint(url, args)` which transparently pays via x402
- `mcp-bridge/src/x402-axios-client.js` — wraps axios with EVM + SVM + batch schemes
- `mcp-bridge/src/bazaar-discover.js` — when started, queries Bazaar and registers each discovered service as its own MCP tool
- `mcp-bridge/README.md` — Claude Desktop config

## Files to modify
- Root `package.json` — add workspace
- `.env.example` — `MCP_BRIDGE_DISCOVER_LIMIT` (default 20), `MCP_BRIDGE_MAX_PRICE_PER_CALL_ATOMIC` (safety cap)

## Implementation

### Single fallback tool
For arbitrary URLs the user wants to hit:
```js
server.tool(
  "call_paid_endpoint",
  "Call any x402 endpoint with auto-payment",
  { url: z.string(), method: z.string().optional(), body: z.any().optional(), params: z.record(z.any()).optional() },
  async ({ url, method = "GET", body, params }) => {
    const res = await api.request({ url, method, data: body, params });
    return { content: [{ type: "text", text: JSON.stringify(res.data) }] };
  }
);
```

### Bazaar-driven dynamic tools
On startup:
1. Query the Bazaar `/discovery/resources` for HTTP and MCP types.
2. Register up to `MCP_BRIDGE_DISCOVER_LIMIT` tools with sane names derived from the resource description.
3. Each tool's input schema comes from `extensions.bazaar.info.input.queryParams` or `inputSchema`.

This means a user running this MCP bridge can ask Claude "find me a weather API and call it" — Claude discovers the bazaar-registered tool and uses it directly.

### Spending caps
Hook `onBeforePaymentCreation` to enforce `MCP_BRIDGE_MAX_PRICE_PER_CALL_ATOMIC` — abort with a clear reason if exceeded. This is the consumer-side equivalent of USE-22.

### Storage for batch-settlement
Persist channel state in `~/.x402-mcp-bridge/channels.json` so the bridge survives Claude Desktop restarts.

## Wiring checklist
- [ ] Bridge starts cleanly via `node mcp-bridge/src/index.js`
- [ ] `call_paid_endpoint` tool works end-to-end against `api/x402/exact-evm-demo`
- [ ] Bazaar discovery populates dynamic tools at startup
- [ ] Spending cap rejects calls over the configured max
- [ ] Channel state persists across restarts
- [ ] README has Claude Desktop config snippet

## Acceptance
- [ ] Claude Desktop user asks "pay $0.01 on Base for a weather report"; the bridge picks the right tool from Bazaar, pays, returns weather
- [ ] Calling `call_paid_endpoint` with a URL exceeding the spending cap returns a clear error in the tool result
- [ ] Killing and restarting Claude Desktop preserves batch-settlement channels (no redeposit on first call)
