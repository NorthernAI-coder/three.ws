# 10 — Expose the crypto API as MCP tools

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

Agents increasingly consume capability through MCP, not raw HTTP. Expose the aggregator
(`/api/v1/x/*`) through the three.ws MCP server as tools — dynamically, from the registry, so
the toolset grows automatically as providers land.

## Context

- MCP server: `api/mcp.js` is the streamable-HTTP entry; the 3D MCP internals live in
  `api/_mcp3d/` (`catalog.js` = tool registry, `dispatch.js` = execution, `discovery.js`).
  Read all three plus 2–3 existing tool implementations under `api/_mcp3d/tools/` to learn the
  exact registration + handler contract (input schema shape, result shape, how paid tools
  declare pricing via `declareMcpDiscovery` from `api/_lib/x402/bazaar-helpers.js`).
- Aggregator: `api/v1/_providers.js` exports `ENDPOINT_INDEX` and `providerCatalog()`;
  `api/_lib/aggregator.js` exports `executeUpstream` and `resolveUpstreamKey`.
- Design decision (made — do not revisit): **one generic tool + a few curated ones**, not one
  tool per endpoint (a 30-tool flood degrades agent tool selection):
  - `crypto_data` — params `{ provider, endpoint, params }`, validated against
    `ENDPOINT_INDEX`; unknown pair → error listing valid pairs. Description enumerates the
    live provider/endpoint ids WITH their one-line summaries (generated from
    `providerCatalog()` at registration time).
  - `token_snapshot` — curated convenience: given a Solana mint (example: the $THREE CA
    `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`), fan out to whichever registered providers
    can describe it (dexscreener token pairs if registered, coingecko token-price, solana
    token-supply…), tolerate absent providers (skip, note in result), merge into one snapshot.
    Must work with ONLY the providers that exist at runtime — check `ENDPOINT_INDEX` per
    sub-call; degrade gracefully. Note: a `pump_snapshot` tool already exists — read it first
    and reuse/extend rather than duplicating scope.
- Free-tier/pricing: tools backed by free-tier endpoints should be callable without payment
  within the same per-IP quotas; above quota they return the standard MCP PaymentRequired
  structuredContent (see how existing paid tools do this).

## Tasks

1. Read the MCP internals listed above; write the registration for `crypto_data` +
   `token_snapshot` following the existing tool pattern exactly.
2. Implement execution through `executeUpstream` (never re-fetch upstreams directly), with the
   free-quota/payment gate mirroring how existing paid tools gate.
3. Ensure MCP discovery lists the new tools with accurate descriptions (run whatever local
   listing path exists — `npm run test:mcp` and the audits `npm run audit:mcp` /
   `npm run audit:mcp-golden` are in package.json; run them and fix failures they surface for
   your tools).
4. **Tests** in `tests/api/mcp-crypto-data.test.js`: tools/list includes both tools with
   schemas; `crypto_data` validates provider/endpoint and errors helpfully on unknowns;
   `token_snapshot` merges partial provider availability without throwing (fixture-backed at
   the executeUpstream boundary). Targeted vitest until green.
5. **Docs:** `docs/mcp.md` — add both tools with example calls. Changelog entry (`feature`).
6. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

Both tools registered and dispatchable, generated from the live registry (no hand-enumerated
endpoint lists in code), MCP audits green, tests green, docs + changelog updated, committed,
pushed.
