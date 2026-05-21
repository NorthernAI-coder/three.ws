# USE-14: Bazaar — Discovery client

## Goal
Build a buyer-side Bazaar discovery layer: search and filter the facilitator catalog, return ranked results, and feed them into the auto-pay clients (USE-06/07).

## Why
- Agents (USE-29..40) need to dynamically find paid services rather than hardcoding URLs.
- A useful UI surface for our own marketplace listings (data/rss/, public discovery pages).

## Reference
- Bazaar docs (Buyer Quickstart): [/tmp/x402-docs/docs/extensions/bazaar.mdx](/tmp/x402-docs/docs/extensions/bazaar.mdx)
- Spec: [/tmp/x402-docs/specs/extensions/bazaar.md](/tmp/x402-docs/specs/extensions/bazaar.md)

## Dependencies
- USE-00, USE-01

## Files to create
- `api/_lib/x402/bazaar-client.js` — `class Bazaar { list(filters), search(query), get(resourceUrl) }`
- `api/bazaar/list.js` — proxy GET endpoint clients can hit without auth
- `api/bazaar/search.js` — proxy GET endpoint
- `public/bazaar.html` — minimal discovery UI: search, filter, sort by price, pay directly
- `public/bazaar.js` — front-end logic using `x402-buyer.js` (USE-06)

## Files to modify
- `vercel.json` — routes for `/api/bazaar/*` and `/bazaar` (rewrites to `/bazaar.html`)
- `public/x402.js` — add discovery hook

## Implementation

### Client wrapper
```js
import { HTTPFacilitatorClient } from "@x402/core/http";
import { withBazaar } from "@x402/extensions";

export function bazaarClient(facilitatorUrl) {
  return withBazaar(new HTTPFacilitatorClient({ url: facilitatorUrl })).extensions.bazaar;
}

const baz = bazaarClient("https://x402.org/facilitator");
const { items } = await baz.listResources({ type: "http" });
const { resources } = await baz.search({ query: "weather", type: "http" });
```

### Filtering helpers
Expose helpers for common queries:
- `filterByMaxPrice(items, atomicMax, asset)` — under-N USDC items
- `filterByNetwork(items, "eip155:*" | "solana:*")`
- `filterByExtension(items, "sign-in-with-x")`
- `groupBy(items, key)` — group by `serviceName` or `payTo`

### Multi-facilitator
Some facilitators have different catalogs. Accept an array of facilitator URLs and merge results, deduplicating by `(resource, toolName)` for MCP and `resource` for HTTP.

### Public UI
- Search bar
- Filter sidebar: network, max price, has extension X, tag
- Result cards with `iconUrl`, `serviceName`, `description`, price, "Try it" button that calls the endpoint via wrapped fetch
- Show settlement receipt after successful call

## Wiring checklist
- [ ] `/bazaar` page renders results from x402.org facilitator
- [ ] Filters reduce the result set correctly
- [ ] "Try it" button pays via the buyer client and shows the response
- [ ] Multi-facilitator merge dedupes properly
- [ ] No CORS issues (proxy via `/api/bazaar/*` if facilitator CORS is restrictive)

## Acceptance
- [ ] `/api/bazaar/list?type=http` returns valid JSON
- [ ] `/api/bazaar/search?query=weather` returns results
- [ ] `/bazaar` page shows our own paid endpoints (verified via the seller listing in USE-13)
- [ ] Paying through the page produces a real on-chain transaction
- [ ] Network filter works for both EVM and Solana
