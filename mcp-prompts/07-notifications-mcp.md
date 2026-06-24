# Build `@three-ws/notifications-mcp` — the agent notification inbox + push over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server lets an AI agent read its **own** notification inbox (pump alerts, trades, agent events), manage read state and preferences, and register/unregister web-push devices.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) **and** `packages/avatar-agent-mcp/` (auth/write reference).
4. **The real backend:** `api/notifications/` and `api/push/`. Read the handlers. Confirm the `user_notifications` record shape (type, source, read status), preference shape, and the push device-registration flow. Build against reality.

## What this server is
The inbound-event surface. A persistent inbox aggregates pump alerts, trades, and agent events with read tracking and type filtering; `api/push` registers devices for web push. This server lets an agent query inbound alerts without polling and manage delivery prefs.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `list_notifications` | read | GET inbox | notifications (filter by type/read) |
| `mark_read` | write (idempotent) | POST/PATCH | updated read state |
| `delete_notification` | write (destructive) | DELETE | deletion result |
| `get_preferences` | read | GET prefs | notification preferences |
| `set_preferences` | write (idempotent) | PUT prefs | updated preferences |
| `register_push_device` | write (idempotent) | POST `api/push/subscribe` | registration result |
| `unregister_push_device` | write (destructive) | DELETE | result |

## Auth / writes
Everything is account-scoped. Read how `api/notifications`/`api/push` authenticate and mirror `packages/avatar-agent-mcp`. Annotate writes honestly (`delete`/`unregister` are destructive). Add the credential as a required `server.json` env var.

## Package identity
- npm `@three-ws/notifications-mcp` · mcpName `io.github.nirholas/notifications-mcp` · dir `packages/notifications-mcp` · bin `notifications-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify `list_notifications` returns real inbox data via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
