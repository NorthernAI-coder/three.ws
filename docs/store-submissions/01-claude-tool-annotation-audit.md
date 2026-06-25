# Prompt 01 — Tool annotation & title audit (Claude + OpenAI prerequisite)

> Paste this into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite.

## Context
We are submitting three.ws's MCP servers to the Claude Connectors Directory and (a scoped subset to) the OpenAI ChatGPT App Directory. The **#1 reviewer rejection reason in both stores is missing or incorrect tool annotations.** Both require every tool to carry a human-readable `title` and accurate MCP annotation hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).

Per-tool definitions live in the `tools/*.js` files under each MCP endpoint and in the published stdio server:
- `api/_mcp/tools/*.js` (main), `api/_mcp3d/tools/*.js`, `api/_mcpagent/`, `api/_mcpbazaar/`, `api/_mcpibm/`
- `mcp-server/src/tools/*.js` (the `@three-ws/mcp-server` npm package — 24 tool defs)
- Catalogs that assemble them: `api/_mcp/catalog.js`, `api/_mcp3d/catalog.js`, `api/_mcpagent/catalog.js`, etc.

The existing pattern (see `api/_mcp/tools/avatars.js`) is correct: each tool has `name`, `title`, `description`, `inputSchema`, and an `annotations` object.

## Objective
Produce a **complete, verified inventory** of every tool across every server, and **fix every tool** that is missing a `title` or has wrong/missing annotations — so a reviewer calling every tool sees correct metadata.

## Tasks
1. **Enumerate** every tool exposed by every server. For each, record: server, tool `name`, `title`, one-line description, the four annotation hints, and free-vs-paid (x402 price). Build this as a markdown table written to `docs/store-submissions/_generated/tool-inventory.md`.
2. **Validate each tool's annotations against its actual behavior:**
   - Read-only fetch/list/get/search/resolve → `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint` true if it hits an external network/chain/API.
   - Generation/mint/render/write tools → `readOnlyHint: false`. Set `destructiveHint: true` **only** for irreversible deletes (e.g. `delete_avatar`); generation is non-destructive.
   - Anything touching Solana/Ethereum, pump.fun, external model APIs, or public content → `openWorldHint: true`.
   - `idempotentHint: true` only when repeating the same call has no additional effect.
   - **The MCP spec defaults `destructiveHint` to `true` when omitted** — so every non-destructive tool must set it explicitly to `false`. Flag any tool relying on the default.
3. **Fix** every missing `title` (concise, human-readable, Title Case) and every incorrect/missing annotation, editing the source `tools/*.js` files. Match the existing code style and comment density.
4. **Verify titles are unique and unambiguous** across each server (no two tools sharing a confusing title).
5. **Confirm the catalog assembles correctly** — annotations survive into `tools/list`. Don't let the `scope`/`handler` strip step drop annotations.

## Verification (must actually run)
- `npm test` passes. If a tools-shape or catalog test exists, it stays green; if none asserts "every tool has a title + explicit destructiveHint," **add one**.
- Boot the stdio server and call `tools/list`, confirm every tool returns a `title` and full `annotations`:
  ```
  npx @modelcontextprotocol/inspector node mcp-server/src/index.js
  ```
  (or `node mcp-server/src/index.js` and issue a `tools/list` JSON-RPC call). Capture the output.
- For the remote endpoints, hit `tools/list` against the local dev server (`npm run dev`) for `/api/mcp`, `/api/mcp-3d`, `/api/mcp-agent` and confirm the same. Save evidence to `_generated/`.

## Definition of done
- Every tool on every server has a `title` and an explicit four-field `annotations` object that matches its real behavior.
- `tool-inventory.md` is complete and accurate (free/paid marked).
- Tests assert the invariant. `npm test` green.
- `git diff` reviewed; every changed line justified.

## Hand-off
Report: total tool count per server, the list of tools you changed and why, and the path to `tool-inventory.md`. This inventory feeds prompts 02, 03, and 06. Do **not** commit unless the human asks; if they do, stage only the files you touched and push to both remotes.
