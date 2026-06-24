# Build `@three-ws/billing-mcp` — quotas, usage, and invoices over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server lets an AI agent self-query its **own** plan quotas, usage rollups (avatars, agents, MCP calls, LLM calls), and invoices/receipts — without needing the human account owner.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) **and** `packages/avatar-agent-mcp/` (for how account-scoped calls authenticate).
4. **The real backend:** `api/billing/`. Read the handlers. Confirm shapes for plan quotas, usage rollups (`usage_events`), and invoice/receipt generation. Build against reality.

## What this server is
The account-economics surface. `plan_quotas`, `usage_events`, and billing tables back real quota/usage/invoice data. This server lets an agent check how much of its quota it has left and pull billing history programmatically — mostly read-only, with optional export.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `get_billing_summary` | read | GET summary | plan, quotas, current usage |
| `query_usage` | read | GET usage | usage rollups by metric/period |
| `list_invoices` | read | GET invoices | invoice list |
| `get_receipt` | read | GET one | a single receipt |
| `export_billing_history` | read | GET export | exportable history payload |

## Auth / writes
This is essentially **read-only but account-scoped** — it exposes private billing data, so it requires the account credential. Read how `api/billing` authenticates and mirror `packages/avatar-agent-mcp`. All tools `readOnlyHint:true`, `openWorldHint:true`, `idempotentHint:false`. Add the credential as a **required** `server.json` env var (without it the server can't read anything).

## Package identity
- npm `@three-ws/billing-mcp` · mcpName `io.github.nirholas/billing-mcp` · dir `packages/billing-mcp` · bin `billing-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify summary/usage return real data via `npm run inspect` with a real credential. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
