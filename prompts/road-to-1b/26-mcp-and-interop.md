# 26 — MCP servers & agent interoperability

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 5 — Developer platform
**Owns:** `mcp-server/`, `mcp-bridge/`, `packages/*-mcp`, `api/_mcp3d/` (`/api/mcp-3d`), `api/_mcp/`.
**Depends on:** the tools each server exposes.  ·  **Parallel-safe with:** 25, 27, 28.

## Why this matters for $1B
MCP is how other agents (and Claude) drive three.ws programmatically — the 3D pipeline,
pump.fun launches, $THREE tools, payments. Reliable MCP surfaces make three.ws part of
every agent's toolbelt, a powerful distribution and moat.

## Mission
Make every MCP server correct, discoverable, authenticated, and verified end to end.

## Map
- Servers: `mcp-server/`, `packages/pumpfun-mcp`, `packages/three-token-mcp`,
  `packages/threews-avatar-mcp`, `packages/avatar-agent-mcp`, `packages/ibm-watsonx-mcp`,
  `packages/ibm-x402-mcp`; the 3D pipeline over MCP at `api/_mcp3d/` (`/api/mcp-3d`).
- Tooling: `npm run audit:mcp`, `smoke:mcp`, `test:mcp`, `publish:mcp` (+ `:dry`).

## Do this
1. Run `audit:mcp`, `smoke:mcp`, `test:mcp`; fix every failure and manifest mismatch.
2. For each server: validate the tool manifest (names, schemas, descriptions), real
   handlers (no stubs), and auth where the tool moves money or mutates state.
3. Verify the 3D MCP pipeline (`/api/mcp-3d`) exposes the same generation capability as
   Forge, with rate limits (prompt 08) and the configured-engine checks.
4. Ensure remotes are reachable and documented; `publish:mcp:dry` clean for publishable
   servers.
5. Add/confirm a smoke test that calls each server's primary tool against a real backend.
6. Document connection instructions per server (for Claude Code / other MCP clients).

## Must-not
- No unauthenticated money/state-mutating MCP tools; no stub tool handlers.
- Do not expose a tool whose manifest schema doesn't match its handler.

## Acceptance
- [ ] `audit:mcp` + `smoke:mcp` + `test:mcp` green; manifests valid.
- [ ] Each server's primary tool verified against a real backend; remotes documented.
- [ ] `publish:mcp:dry` clean; `npm test` green; changelog `sdk`/`infra` entry.
