# USE-37: Purchase-With-Crypto Shopper

## Goal
Agent that fills a shopping cart from a list of items, checks out via Coinbase Commerce or Crossmint, pays in crypto. Optional per-lookup scraping fee for hard-to-find items.

## Why (from PROJECT-IDEAS.md)
> Agent fills a cart and checks out via Coinbase Commerce or Crossmint. Payment moment: Single checkout; optional per-lookup scraping fee.

## Reference
- PROJECT-IDEAS.md
- Coinbase Commerce API: https://docs.cdp.coinbase.com/commerce-onchain/welcome
- Crossmint API: https://docs.crossmint.com/

## Dependencies
- USE-00..09
- USE-22, USE-24, USE-15

## Files to create
- `agents/shopper/`
- `agents/shopper/src/cart.js` — cart state
- `agents/shopper/src/lookup.js` — find items via paid scrape (Firecrawl) or merchant APIs (Coinbase Commerce, Crossmint catalogs)
- `agents/shopper/src/checkout.js` — finalize purchase
- `api/agents/shopper.js` — paid endpoint accepting a shopping list

## Files to modify
- Root `package.json` — add workspace
- `.env.example` — `COINBASE_COMMERCE_API_KEY`, `CROSSMINT_API_KEY`, `FIRECRAWL_API_KEY`, `SHOPPER_DEFAULT_CHECKOUT_PROVIDER`

## Implementation

### Endpoint contract
```
POST /api/agents/shopper
Body: {
  items: [{ description, maxPriceUsd, sku? }, ...],
  shippingAddress: { ... },
  checkoutProvider: "coinbase_commerce" | "crossmint" | "auto"
}
402 → upto (variable cost based on items)
200 → {
  cart: [...],
  totalCharged: "...",
  checkoutUrl?: "...",
  orderId: "...",
  trackingInfo?: { ... }
}
```

### Lookup
- For each cart item: hit merchant API first (cheap, free for some)
- Fall back to paid scrape via Firecrawl if no match
- Each scrape = a paid call, logged

### Checkout
- Coinbase Commerce: create charge, return hosted URL OR fully on-chain pay
- Crossmint: similar; supports NFT and physical goods

### Cost accounting
- Sum: scrape costs + item totals + provider fees
- Surface in response. `upto` lets us settle the exact amount.

### Limits
- Per-item max price enforced
- Cart total max enforced
- Never auto-pay for items not explicitly listed

## Wiring checklist
- [ ] Coinbase Commerce API integrated
- [ ] Crossmint API integrated
- [ ] Firecrawl integration for fallback lookup
- [ ] Max-price checks at item and cart level
- [ ] Shipping address validation

## Acceptance
- [ ] Submit a 3-item list, each with maxPriceUsd → cart populated, checkout charge created
- [ ] Items not found within max price are clearly returned as "not found" — no checkout if any fail (configurable)
- [ ] Scrape fallback works when merchant API returns no match
- [ ] Real on-chain settlement; tracking info returned if available
