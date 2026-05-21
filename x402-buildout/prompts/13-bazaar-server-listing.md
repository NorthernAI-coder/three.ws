# USE-13: Bazaar — Server-side listing

## Goal
Make every paid endpoint in this repo discoverable via the x402 Bazaar. Each route declares `bazaar` extension with input/output schemas + service metadata (`serviceName`, `tags`, `iconUrl`).

## Why
- Buyers and agent ecosystems discover x402 services through facilitator Bazaars.
- Without this, our paid endpoints are unfindable except by direct URL.

## Reference
- Bazaar docs: [/tmp/x402-docs/docs/extensions/bazaar.mdx](/tmp/x402-docs/docs/extensions/bazaar.mdx)
- Spec: [/tmp/x402-docs/specs/extensions/bazaar.md](/tmp/x402-docs/specs/extensions/bazaar.md)

## Dependencies
- USE-00, USE-02, USE-03, USE-04, USE-05, USE-10

## Files to create
- `api/_lib/x402/bazaar-helpers.js` — `declareDiscovery(routeName, { input, inputSchema, output })` returns the extensions block

## Files to modify
- Every paid endpoint created so far: add `extensions.bazaar` to its route config
- Every MCP tool (USE-10): pass `declareDiscoveryExtension(...)` in its payment wrapper config
- `api/_lib/x402/sdk.js` — register `BazaarServerExtension` on the resource server

## Implementation

### Per-route metadata
For each paid endpoint, declare:
```js
extensions: {
  ...declareDiscoveryExtension({
    input: { /* example query/body */ },
    inputSchema: {
      properties: { /* JSON Schema */ },
      required: [/* keys */]
    },
    output: {
      example: { /* sample response */ },
      schema: { /* JSON Schema */ }
    }
  })
}
```

### Service-level metadata on `resource`
Set `serviceName` (≤32 chars printable ASCII), `tags` (max 5, each ≤32 chars), `iconUrl` (https URL). The facilitator uses these for filtering and search.

### MCP tools
For MCP tools, use `declareDiscoveryExtension({ toolName, description, transport: "sse" | "streamable-http", inputSchema, example })` and pass in the payment wrapper config.

### Verification
Hit our facilitator's `/discovery/resources` after the first paid request to confirm our routes appear. Some facilitators index asynchronously; allow a few seconds.

## Wiring checklist
- [ ] Every paid HTTP endpoint declares `bazaar` extension
- [ ] Every paid MCP tool declares the discovery extension in its wrapper config
- [ ] `resource.serviceName`, `resource.tags`, `resource.iconUrl` set on every route
- [ ] BazaarServerExtension registered on the resource server (auto-narrows HTTP method etc.)

## Acceptance
- [ ] `curl https://x402.org/facilitator/discovery/resources?payTo=<our address>` returns our endpoints
- [ ] Each entry has correct `accepts[]`, `extensions.bazaar.info`, and `resource.serviceName`
- [ ] MCP tools appear with `type: "mcp"` and correct `toolName`
- [ ] Bazaar search returns our endpoints for a relevant query
- [ ] Settlement responses include `EXTENSION-RESPONSES` header confirming `bazaar.status: "success"` (or `processing`)
