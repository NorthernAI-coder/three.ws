# Build `@three-ws/provenance-mcp` — the agent action-provenance log over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server exposes the **append-only, signed, on-chain-verifiable** agent action log so agents can record what they did and audit each other.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) **and** `packages/avatar-agent-mcp/` (for the authenticated append path + signatures).
4. **The real backend:** `api/agent-actions.js`. Read the handler. Confirm the record shape (signature, actor, action type, outcome), cursor pagination, append semantics, and how appends are authenticated/signed. This is an immutable log — records are never deleted.

## What this server is
The trust layer. Every agent action is recorded in an append-only `agent_actions` table with a signature and outcome, cursor-paginated and on-chain verifiable. This server lets one agent append its own actions and lets any agent read/verify another's provenance — the foundation for agent-to-agent trust.

## Proposed tools (confirm/adjust against the real route)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `list_agent_actions` | read | GET (paginated) | action records + next cursor |
| `query_action` | read | GET one | a single action + signature/outcome |
| `append_agent_action` | write (non-idempotent, non-destructive) | POST | the appended record + id |

## Auth / writes
`append_agent_action` writes to an immutable ledger — `readOnlyHint:false`, `idempotentHint:false`, `destructiveHint:false` (it never overwrites/deletes). It must produce a real signature exactly as the route expects; mirror `packages/avatar-agent-mcp`'s signing. Read tools are public/verification-grade. Add any signer/key as a `server.json` env var, required only for the append tool.

## Package identity
- npm `@three-ws/provenance-mcp` · mcpName `io.github.nirholas/provenance-mcp` · dir `packages/provenance-mcp` · bin `provenance-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify `list`/`query` return real ledger records via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`,`security`), run `npm run build:pages`. **Do not commit or push** unless asked.
