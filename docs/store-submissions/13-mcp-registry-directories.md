# Prompt 13 — MCP registries & third-party directories (get listed everywhere)

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Builds on 01 (annotations) and the existing `server*.json` manifests.

## Context
Beyond the first-party Claude/OpenAI stores, MCP discovery happens through registries and aggregators that index `server.json` manifests and READMEs. We already publish **38 servers** (6 hosted remote + 32 npm) to the official MCP registry (`registry.modelcontextprotocol.io/?q=io.github.nirholas`) and have a `public/lobehub/plugin.json`. This chat makes the listings **complete, consistent, and present across every major directory** so any MCP-compatible client can find three.ws by name.

Re-fetch each directory's current submission flow first:
- Official MCP registry: https://registry.modelcontextprotocol.io + the `mcp-publisher` CLI / `server.json` schema
- Smithery: https://smithery.ai (deploy/list)
- Glama: https://glama.ai/mcp/servers
- mcp.so: https://mcp.so
- PulseMCP: https://www.pulsemcp.com
- LobeHub plugins/MCP: https://lobehub.com

## Objective
Every three.ws MCP server is listed, consistent, and verified across the official registry + the major third-party directories, with one canonical metadata source of truth so listings don't drift.

## Tasks
1. **Manifest consistency pass.** Enumerate every `server*.json` (root: `server.json`, `server-3d.json`, `server-agent.json`, `server-bazaar.json`, `server-ibm.json`, `server-pumpfun.json`, and `mcp-server/server.json`) plus each npm package's manifest. Verify for all:
   - Current `$schema` URL, accurate `name` (`io.github.nirholas/...` namespace), `description`, `version`, `repository`, `websiteUrl`.
   - Remote servers list correct `remotes` (transport + URL); npm servers list correct `packages` (registry + identifier + runtime args).
   - Every tool the manifest implies actually exists and lists over the live transport.
   - `$THREE` is the only coin referenced anywhere.
2. **Official registry hygiene.** Confirm all 38 are present and current in the official registry. For any stale/missing one, prepare the `mcp-publisher` republish command (don't publish without the human, but stage the exact commands). Note any that fail validation and fix the manifest.
3. **Third-party directory submissions.** For each of Smithery, Glama, mcp.so, PulseMCP, LobeHub, produce a ready-to-submit listing in `docs/store-submissions/_generated/mcp-directories/<directory>.md`:
   - The server(s) to list (lead with the hosted remote `/api/mcp` and `/api/mcp-3d` + the headline npm servers).
   - Name, one-line tagline, description, category/tags, install/connect snippet (URL for remote, `npx -y @three-ws/...` for stdio), example prompts, and the directory-specific fields each site asks for.
   - For LobeHub, reconcile/refresh the existing `public/lobehub/plugin.json`.
4. **Canonical metadata source.** Create `docs/store-submissions/_generated/mcp-listing-source.json` — one object per server with the shared fields (name, tagline, description, category, tags, connect snippet, example prompts). Every directory listing derives from this so copy never drifts. Note which fields each directory consumes.
5. **README registry section.** Ensure `docs/mcp.md` / `README.md` link to the official registry search and at least the Smithery/Glama listings once live.
6. **Changelog.** Add a `data/changelog.json` entry ("three.ws MCP servers listed across Smithery, Glama, mcp.so, PulseMCP & LobeHub", tag `infra`/`sdk`) and run `npm run build:pages`.

## Verification (must actually run)
- Every `server*.json` validates against the current schema and its declared tools list over the live transport.
- Each hosted remote URL resolves and answers `tools/list`; each npm `npx -y @three-ws/...` server starts and lists tools.
- The compliance grep over manifests + listing copy returns zero non-$THREE coin references.
- `npm run build:pages` passes.

## Definition of done
- All manifests consistent and validated; canonical metadata source written.
- A ready-to-submit listing doc per third-party directory derived from the canonical source.
- Republish commands staged for any stale official-registry entry. Changelog validated.

## Hand-off
Report the manifest-validation results, the canonical source path, the per-directory listing docs, and any `[HUMAN: ...]` account/auth steps each directory needs. Commit/push only if asked; stage touched paths; both remotes.
