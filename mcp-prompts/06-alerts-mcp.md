# Build `@three-ws/alerts-mcp` — pump.fun alert rules over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server lets an AI agent define and manage its **own** pump.fun monitoring rules with multi-channel delivery (in-app, webhook, Telegram), and read alert history.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) **and** `packages/avatar-agent-mcp/` (auth/write reference).
4. **The real backend:** `api/alerts/` (esp. `rules`). Read the handlers. Confirm the rule shape (event type, thresholds, delivery channel config), how rules are evaluated by the `pumpfun-monitor` cron, and the delivery/history shape. Build against reality.

## What this server is
The market-monitoring control surface. Users define alert rules on pump.fun events; a cron evaluates them and delivers via in-app/webhook/Telegram with delivery tracking. This server makes rule management agent-drivable so an agent can watch the market without UI friction.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `list_alert_rules` | read | GET rules | the agent's rules |
| `create_alert_rule` | write (idempotent) | POST | created rule |
| `update_alert_rule` | write (idempotent) | PATCH | updated rule |
| `delete_alert_rule` | write (destructive) | DELETE | deletion result |
| `get_alert_history` | read | GET history | fired alerts + delivery status |

## Auth / writes
Rules are account-scoped. Read how `api/alerts` authenticates and mirror `packages/avatar-agent-mcp`. `create`/`update`/`delete` are writes (`delete` is destructive). Webhook/Telegram targets are runtime input — validate them at the boundary. Add the credential as a required `server.json` env var. Any coin referenced in a rule is **runtime input**; never hardcode a non-`$THREE` mint.

## Package identity
- npm `@three-ws/alerts-mcp` · mcpName `io.github.nirholas/alerts-mcp` · dir `packages/alerts-mcp` · bin `alerts-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify list/history return real data via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
