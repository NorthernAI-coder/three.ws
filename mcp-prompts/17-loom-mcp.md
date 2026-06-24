# Build `@three-ws/loom-mcp` — the 3D creation gallery over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server exposes Loom, the community 3D-creation gallery, so an agent can browse the feed, fetch a creation, and submit its own.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) **and** `packages/scene-mcp/` + `packages/threews-avatar-mcp/` (references for 3D-content servers and viewer/embed shapes — reuse, don't contradict).
4. **The real backend:** `api/loom.js`. Read the handler. Confirm the gallery feed shape, a single creation's shape (GLB/scene reference, metadata), and how submission authenticates. Build against reality.

## What this server is
The community 3D-gallery surface. `api/loom.js` backs the forge creation gallery. This server lets agents discover what others have built and contribute — closing the loop with `scene-mcp` (compose) and `avatar-agent` (generate).

## Proposed tools (confirm/adjust against the real route)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `get_loom_feed` | read | GET feed | paginated gallery creations |
| `get_creation` | read | GET one | a creation's metadata + GLB/scene + viewer URL |
| `submit_creation` | write | POST | submission result |

## Auth / writes
Feed/fetch are public/read-only. `submit_creation` is account-scoped — read how `api/loom` authenticates and mirror `packages/avatar-agent-mcp`. Validate submission input at the boundary (asset reference, metadata). Add credentials as `server.json` env vars, required only for submit. Where it helps, return a `viewer_url` like `threews-avatar-mcp` does so clients can preview inline.

## Package identity
- npm `@three-ws/loom-mcp` · mcpName `io.github.nirholas/loom-mcp` · dir `packages/loom-mcp` · bin `loom-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify `get_loom_feed` returns real gallery data via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
