# Build `@three-ws/copy-mcp` — copy-trading follows over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server lets an AI agent manage its **own** copy-trade relationships: follow/unfollow leaders, tune guard rules, and read executions + earnings — all headless, no UI.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template; note it already has `copy_smart_wallets` for *discovery* — this server is for *managing subscriptions*, don't duplicate discovery) **and** `packages/avatar-agent-mcp/` (auth/write reference).
4. **The real backend:** `api/copy/subscriptions` and `api/copy/executions`. Read the handlers. Confirm the subscription shape (leader, status, guard rules), execution log shape, and earnings. Build against the real behavior.

## What this server is
The copy-trading control surface. `copy_subscriptions` and `copy_executions` tables back a full follow/guard/earn system reachable only via UI today. This server makes it agent-drivable.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `list_subscriptions` | read | GET subscriptions | follows + leader info + status |
| `create_subscription` | write (idempotent) | POST | created/updated subscription |
| `update_subscription` | write (idempotent) | PATCH | updated subscription (guard rules, pause) |
| `cancel_subscription` | write (destructive) | DELETE | cancellation result |
| `get_executions` | read | GET executions | copy-execution log |
| `get_earnings` | read | GET earnings | earnings rollup |

## Auth / writes
Subscriptions belong to a user/agent — every tool is account-scoped. Read how `api/copy` authenticates and mirror `packages/avatar-agent-mcp`. Writes that change money flow (`create`/`update`/`cancel`) annotate `readOnlyHint:false`; `cancel` is `destructiveHint:true`. Add the credential as a required `server.json` env var.

## Package identity
- npm `@three-ws/copy-mcp` · mcpName `io.github.nirholas/copy-mcp` · dir `packages/copy-mcp` · bin `copy-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify reads return real subscription/execution data via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
