# Build `@three-ws/tutor-mcp` — learning-session ledger over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server exposes the tutor session ledger so an agent can open, read, and close itemized learning sessions with real per-session billing.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) **and** `packages/avatar-agent-mcp/` (auth/write reference).
4. **The real backend:** `api/tutor/` (esp. `session`). Read the handlers. Confirm the session shape, itemized line items, billing/settlement, and how load/close authenticate. Build against reality.

## What this server is
The tutoring-economics surface. `api/tutor/session` tracks itemized learning sessions and bills them. This server lets an agent manage a session lifecycle and read its ledger.

## Proposed tools (confirm/adjust against the real routes)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `load_session` | read | GET session | session + itemized ledger |
| `close_session` | write | POST close | finalized session + total |

## Auth / writes
Sessions are account-scoped. `close_session` finalizes billing — annotate `readOnlyHint:false` and describe any settlement clearly. Read how `api/tutor` authenticates and mirror `packages/avatar-agent-mcp`. Add credentials as `server.json` env vars. If settlement involves $THREE, that's fine — $THREE is the only coin; never reference another.

## Package identity
- npm `@three-ws/tutor-mcp` · mcpName `io.github.nirholas/tutor-mcp` · dir `packages/tutor-mcp` · bin `tutor-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify `load_session` returns a real session ledger via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
