# Build `@three-ws/autopilot-mcp` — an agent's own execution control plane over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server lets an AI agent configure and drive its **own** autonomous-execution boundaries: scopes, daily spend limits, auto-execute settings, and the propose → execute → undo loop.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — the exact package pattern. Follow it precisely; copy `packages/intel-mcp` for structure.
3. `packages/intel-mcp/` (read-only template) **and** `packages/avatar-agent-mcp/` (the reference for authenticated/write tools and how this platform authorizes agent actions).
4. **The real backend:** everything under `api/autopilot/`. Read every handler. Confirm the exact request/response shapes, how an agent authenticates, where config lives (`agent_identities.meta.autopilot`), and how the append-only `agent_actions` log records execution. Build tools against what the code actually does.

## What this server is
The keystone of the autonomous-agent story. Today autopilot config and execution are only reachable through the UI/API. This server exposes them so an agent can manage its own guardrails and act within them — without a human in the loop, but bounded by real scopes and spend caps enforced server-side.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `get_autopilot_config` | read | GET autopilot config | scopes, daily spend limit, auto-execute flags |
| `set_autopilot_config` | write (idempotent) | PUT/POST config | updated config |
| `generate_proposals` | write | proposal generation | candidate actions the agent could take |
| `execute_proposal` | write (destructive) | execute | execution result + action-log id |
| `undo_action` | write | undo/revert | revert result |
| `list_autopilot_activity` | read | activity/`agent_actions` | recent autopilot actions + outcomes |
| `compute_trust` | read | trust score | the agent's computed trust/reputation |

## Auth / writes
This is a **write-heavy, funds-touching** server. `execute_proposal` moves real value — annotate `readOnlyHint:false`, `destructiveHint:true`, and say so loudly in the description. Read how `api/autopilot` authenticates the agent (API key / agent token / wallet signature) and mirror `packages/avatar-agent-mcp`'s approach exactly. Add the required credential as an env var in `server.json` (`isRequired` true for write paths). Never bypass server-side scope/spend enforcement.

## Package identity
- npm `@three-ws/autopilot-mcp` · mcpName `io.github.nirholas/autopilot-mcp` · dir `packages/autopilot-mcp` · bin `autopilot-mcp`

## Done means
Everything in `_SHARED-CONVENTIONS.md` → Definition of done. Verify with `npm run inspect` that read tools return real config/activity. Add a `data/changelog.json` entry (tags `sdk`,`feature`) — plain-language, e.g. "AI agents can now set their own autopilot scopes and spend limits over MCP." Run `npm run build:pages`. **Do not commit or push** unless asked.
