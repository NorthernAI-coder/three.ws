# Task: Sell 3D generation to other agents over x402, metered and provenance-logged

You are a senior platform engineer on three.ws. Follow `CLAUDE.md` (auto-loaded).
Non-negotiables: $THREE is the only coin; no mocks/placeholders; real x402 payments
and real generation; every state designed; add tests; changelog for user-visible
changes; don't break the architecture.

## Why this matters

We have a 3D generation pipeline AND an x402 payment surface AND an MCP ecosystem.
Wiring them together lets *other* agents pay (in USDC / $THREE) to generate 3D assets
through us, programmatically — turning the forge into an agent-to-agent service and a
real revenue line, while showcasing the platform's 3D+crypto+AI thesis end to end.

## What exists today — read these first

- x402 generation endpoint: [api/x402/forge.js](../../api/x402/forge.js) (quotes price
  from tier config in [api/_lib/forge-tiers.js](../../api/_lib/forge-tiers.js)).
- MCP forge tools already exist (`mesh_forge`, `forge_avatar`, `rig_mesh`,
  `text_to_avatar`, free `forge_free`) in [mcp-server/](../../mcp-server) and the
  3d-agent MCP server; pricing lives in `api/_mcp3d/pricing.js`.
- Merchant SDK advertises USDC **and** $THREE in one 402 challenge (see STRUCTURE.md).
- Provenance + metering primitives: `packages/provenance-mcp/`, `packages/billing-mcp/`,
  and the audit log (`api/audit-log.js`).

## Goal

A clean, documented, paid 3D-generation service other agents can discover and call:
pay via x402 (USDC or $THREE), generation runs on our free-first lanes, the result
GLB is returned, and the action is metered + provenance-logged. Confirm the full
loop works against the real x402 flow.

## Scope

1. **Service surface.** Ensure `api/x402/forge.js` (and the corresponding MCP tools)
   expose a coherent paid generation offering: tiers, price (from config, both assets
   in the 402 challenge), inputs (text/image/multi-view), and the returned GLB +
   viewer link. No price duplicated outside the tier/pricing config.
2. **Pay → generate → deliver.** Verify the real x402 challenge → payment → generation
   → GLB delivery loop. Payment settles before generation; a failed payment never
   triggers a generation, and a failed generation never silently keeps the payment
   (refund/no-charge path must be real and tested).
3. **Metering + provenance.** Record each paid generation (who paid, tier, asset,
   amount) via the existing billing/provenance/audit primitives — reuse, don't rebuild.
4. **Discoverability.** Make the service findable in the x402 bazaar / MCP registry
   surface the platform already uses, with accurate metadata.
5. **Docs.** A short `docs/` page: how an agent discovers, pays for, and calls the
   forge service, with a real example.

## Guardrails

- Both x402 assets are USDC and $THREE only — never advertise another token.
- Generation runs free-first (self-host/free lanes) so margin is real.
- Prices come from `forge-tiers.js` / `api/_mcp3d/pricing.js` — single source of truth.
- No-charge-on-failure must be genuine; test the unhappy path.
- Reuse billing/provenance/audit; do not stand up a parallel ledger.

## Definition of done

- [ ] Paid forge offering exposed via x402 + MCP, priced from config, both assets quoted.
- [ ] Real pay→generate→deliver loop verified; failure paths don't mischarge.
- [ ] Each paid generation metered + provenance-logged via existing primitives.
- [ ] Service discoverable with accurate metadata; `docs/` usage page added.
- [ ] `npm test` green (incl. `verify:x402` / mcp suites where relevant); new tests
      cover the pay→generate→deliver + no-charge-on-failure paths.
- [ ] Changelog entry; `npm run build:pages` passes.
