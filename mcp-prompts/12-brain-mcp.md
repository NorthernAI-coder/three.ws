# Build `@three-ws/brain-mcp` — the multi-provider LLM router over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server exposes the platform's multi-provider LLM router so an agent can list available providers/models and run a chat completion through whichever one fits.

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) and `packages/ibm-watsonx-mcp/` + `packages/ibm-x402-mcp/` (references for LLM-bridge servers).
4. **The real backend:** `api/brain/` (esp. `chat`). Read the handler. Confirm the provider list (the router fronts Claude, GPT-4o, Qwen, Nemotron, etc.), the request shape (provider/model, messages), how streaming works, and how it authenticates. Build against reality.

> Per CLAUDE.md's LLM guidance: when describing the Anthropic option, use correct current model IDs (e.g. Opus 4.8 = `claude-opus-4-8`, Sonnet 4.6 = `claude-sonnet-4-6`, Haiku 4.5 = `claude-haiku-4-5-20251001`, Fable 5 = `claude-fable-5`). Don't invent model names — list whatever the route actually supports.

## What this server is
The "any model, one interface" surface. `api/brain/chat` routes to multiple providers. This server lets an MCP client discover providers and run completions without each client wiring every vendor SDK.

## Proposed tools (confirm/adjust against the real route)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `list_providers` | read | GET providers/models | available providers + model IDs |
| `chat` | read | POST `api/brain/chat` | a completion (collapse streaming into a final message for MCP) |

## Inputs / auth
`chat` takes messages + an optional provider/model selector as runtime input. The route is streaming; MCP tool results are a single payload, so accumulate the stream server-side and return the final text (note token usage if the route reports it). Wire real auth/keys exactly as the route expects (env vars in `server.json`). `readOnlyHint:true` (a completion doesn't mutate platform state), `openWorldHint:true`, `idempotentHint:false`.

## Package identity
- npm `@three-ws/brain-mcp` · mcpName `io.github.nirholas/brain-mcp` · dir `packages/brain-mcp` · bin `brain-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify `list_providers` and a real `chat` round-trip via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
