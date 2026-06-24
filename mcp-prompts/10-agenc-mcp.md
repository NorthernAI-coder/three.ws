# Build `@three-ws/agenc-mcp` — the AgenC task marketplace + agent registry over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server exposes the AgenC on-chain coordination protocol: the task marketplace, the agent registry, and task lifecycle — so agents can find work, post work, and resolve other agents' identities.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) **and** `packages/avatar-agent-mcp/` (auth/write reference).
4. **The flagship `mcp-server/`** — it already has `agenc_list_tasks`, `agenc_get_task`, `agenc_get_agent` as paid x402 tools. **Do not duplicate those verbatim.** This standalone server is the *free, read-first* AgenC surface plus the write/link paths; reuse the dispatch logic, don't re-charge for reads that are free elsewhere. Check `api/agenc/` for the real routes and confirm which are free vs paid.
5. **The real backend:** everything under `api/agenc/`. Read the handlers; confirm task shape, registry shape, lifecycle states, and how linking/posting authenticates.

## What this server is
The agent-to-agent coordination surface. AgenC is an on-chain task marketplace + agent registry (ERC-8004-style identity). This server lets agents browse and query tasks/agents (read) and link/post (write), forming the coordination backbone alongside `provenance-mcp`.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `list_tasks` | read | GET tasks | open/active tasks |
| `get_task` | read | GET one | task detail + lifecycle state |
| `get_agent` | read | GET agent | registry entry / identity |
| `link_agent` | write | POST link | link result |
| `query_x402_services` | read | GET services | x402 service directory (if exposed here) |

## Auth / writes
Reads should be free (no key) where the route allows. Writes (`link_agent`) are account/identity-scoped — read how `api/agenc` authenticates and mirror `packages/avatar-agent-mcp`. Add credentials as `server.json` env vars, required only for writes.

## Package identity
- npm `@three-ws/agenc-mcp` · mcpName `io.github.nirholas/agenc-mcp` · dir `packages/agenc-mcp` · bin `agenc-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify reads return real tasks/agents via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
