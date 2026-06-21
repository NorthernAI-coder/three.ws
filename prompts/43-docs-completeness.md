# 43 · Documentation Completeness

## Mission
A developer or user can accomplish anything on three.ws by reading the docs — every API, SDK, MCP
tool, embed, and concept is documented accurately with working examples.

## Context
- Docs surfaces (`/docs`), tutorials (e.g. `/tutorials/*`), API reference, SDK READMEs, MCP docs,
  `specs/`, `STRUCTURE.md`. The MCP HTTP surface is `/api/mcp-3d`.

## Tasks
1. **API reference:** document every public `api/*` endpoint actually meant for external use — method,
   params, auth, x402 pricing, responses, errors, examples. Mark internal-only endpoints as such.
2. **SDK docs:** ensure each published SDK (prompt 32) has install + quickstart + reference, and the
   docs site links them. Embed guide for `<agent-3d>` + `@three-ws/walk` + `@three-ws/page-agent`.
3. **MCP docs:** document every tool (free `forge_free` + paid), pricing, payment flow, and how to
   connect a client; keep in sync with `audit:mcp`.
4. **Tutorials:** end-to-end guides for the core jobs (create an agent, forge a model, embed an agent,
   monetize a skill, launch a coin, use memories). Each verified by following it.
5. **Concepts:** explain $THREE, x402, ERC-8004 identity, skill licenses, avatars/rigs — accurately.
6. **Freshness:** every code sample runs; no stale endpoints/params; a docs lint/check where possible.

## Acceptance
- Every external API/SDK/MCP tool documented with a working, verified example.
- Core tutorials exist + were followed successfully; concepts explained correctly.
- No stale samples; docs link the published packages; changelog (docs) entry for notable additions.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No fake/sample-only docs — every example runs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
