# 23 — MCP servers, production-ready

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 2 — Product surface completeness
**Owns:** `mcp-server/`, `mcp-bridge/`, `packages/*-mcp/` (avatar-agent, pumpfun, ibm-watsonx, ibm-x402, three-token, threews-avatar), the 3d-agent MCP tool surface.
**Depends on:** `06`, `07`, `08`, `18`. Pairs with `24`.

## Why this matters for $1B
MCP is how every AI agent in the world plugs into three.ws. A clean, paid, discoverable
MCP surface makes the platform infrastructure other products build on — the highest-
multiple position to occupy. The free `forge_free` lane is the wedge.

## Map
- Servers: `mcp-server/` (`@three-ws/mcp-server`), `mcp-bridge/`, and the
  `packages/*-mcp/` set. Tooling: `npm run audit:mcp`, `smoke:mcp`, `test:mcp`,
  `publish:mcp`(`:dry`).
- Tool surface (3d-agent-local): `forge_free` (free), `text_to_avatar`, `mesh_forge`,
  `rig_mesh`, `forge_avatar`, `ens_sns_resolve`, `agent_delegate_action`,
  `sentiment_pulse`, `get_pose_seed`, `pump_snapshot`, `agent_reputation`,
  `vanity_grinder`, `aixbt_intel`, `aixbt_projects`, AgenC reads. Paid tools quote USDC
  and require an x402 payment payload in `_meta` (v2 transport); missing payment →
  `PaymentRequired` structuredContent.

## Do this
1. **Spec conformance:** every server speaks current MCP transport correctly; each
   tool has accurate name, description (incl. USDC price for paid), and a strict input
   schema with validation. Errors return proper MCP error shapes, never crashes.
2. **Free vs paid:** `forge_free` works with no wallet/key and returns a GLB URL +
   viewer link. Paid tools return correct `PaymentRequired` structuredContent without
   payment and fulfill correctly with a valid x402 payload (prompt `18`). Server-side
   price authority (prompt `07`).
3. **Resilience & limits:** every tool wraps its upstreams with timeouts/retries
   (prompt `06`) and is rate-limited/abuse-guarded (prompt `08`). No tool can hang a
   client.
4. **Discoverability:** tools/servers are discoverable (bazaar/x402 indexing, memory
   note `x402-discovery-indexing`); a public catalog page lists them with prices and
   examples.
5. **Docs & examples:** each server has a README with install + config (Claude Desktop/
   Code config snippet), env requirements, and a runnable example per tool. Keep
   `STRUCTURE.md` + `PUBLISHING.md` accurate.
6. **Audit/smoke/tests:** `npm run audit:mcp`, `smoke:mcp`, `test:mcp` all pass and
   run in CI. Add coverage for the payment-required path and schema validation.
7. **Publish-readiness:** `publish:mcp:dry` clean; versions, `files`, and metadata
   correct for every published `@three-ws/*-mcp` (coordinate with prompt `24`).

## Must-not
- Do not let a missing payment return a fake success — return `PaymentRequired`.
- Do not trust client-sent prices; server is the price authority.
- Do not ship a tool whose upstream can hang the client without a timeout.
- Do not reference any coin other than $THREE in tool copy/output (runtime user mints excepted).

## Acceptance
- [ ] Every server spec-conformant; every tool validated input + proper error shapes.
- [ ] forge_free works keyless; paid tools enforce x402 with correct PaymentRequired + fulfillment.
- [ ] All tools have timeouts/retries + rate limiting; none can hang a client.
- [ ] Public MCP catalog page + per-server README/examples; discovery indexing verified.
- [ ] `audit:mcp` + `smoke:mcp` + `test:mcp` green in CI, incl. payment-required coverage.
- [ ] `publish:mcp:dry` clean for all published MCP packages.
