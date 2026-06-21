# A07 — x402 pricing: single source of truth + discoverable service catalog

> Phase A · Depends on: none (pairs with A03) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
three.ws sells ~27 paid endpoints to agents over x402, plus paid MCP tools. But prices are
hardcoded per endpoint in two places (web + MCP), and a caller discovering a service via
the Bazaar can't see the price or rate budget until they call it. For agents to *shop* for
services — the network-effect that grows GMV — pricing must be one source of truth and the
catalog must be browsable by price and quota.

## Where this lives (real files)
- `api/x402/*.js` — ~27 paid endpoints using `paidEndpoint()` (prices embedded in code).
- `mcp-server/src/` — MCP tools that embed their own prices.
- `api/_lib/x402/bazaar-client.js` — multi-facilitator discovery (PayAI + CDP), normalizes v1/v2.
- `api/_lib/x402/access-control.js` — subscriber bypass, tier limits, API-key auth.
- `api/_lib/migrations/2026-06-19-x402_merchant.sql` — service registry + pricing metadata.

## Current state & gaps
- Prices duplicated across web endpoints and MCP tools; changing one risks drift.
- No queryable catalog with price + rate-limit metadata; Bazaar gives name+schema only.
- No `x-x402-price` style metadata on schemas for price-range browsing.

## Build this
1. **Single price config:** create one source of truth (e.g. `api/_lib/x402/prices.config.js` or the `marketplace_services` table) holding `{ service, price_usd, asset_mint, rate_per_min, rate_per_month, min_charge_usd }`. Refactor every `api/x402/*` endpoint and every MCP tool to read price from it. Keep a `pricing_version` for backward-compat.
2. **Service catalog endpoint:** `GET /api/x402/service-catalog` returning every paid service with live price, asset, quota, and schema link — queryable by price range and category. Include tier-adjusted price hints (ties into A03).
3. **Schema price metadata:** emit the price in each endpoint's 402 challenge and discovery schema (x402 v2 extension) so a Bazaar consumer sees the price without calling.
4. **MCP/web parity test:** a test that asserts a given service's price is identical across the web endpoint and the MCP tool (no drift).
5. **Catalog UI:** a simple, polished `/bazaar`-adjacent view (or extend the existing bazaar surface) that lists three.ws's own paid services with price + "try it" — designed empty/error/loading states.

## Out of scope
- Per-wallet metering and usage headers (**A08**).
- Facilitator failover (**A09**).

## Definition of done
- [ ] All paid prices come from one config; a test proves web↔MCP parity.
- [ ] `/api/x402/service-catalog` returns real, queryable pricing; 402 challenges carry price metadata.
- [ ] Catalog UI lists services with price + try-it and all states designed.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Change a price in the config → both the web endpoint quote and the MCP tool reflect it.
- `curl …/api/x402/service-catalog` returns priced, link-resolving services.
