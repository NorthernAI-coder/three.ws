# Build `@three-ws/vision-mcp` — image understanding over MCP

You are building a new MCP server for **three.ws** (read `CLAUDE.md` — its rules override defaults). This server gives an AI agent image-understanding: analyze/describe an image via the platform's vision pipeline (free NVIDIA NIM VLM with a paid fallback).

## Read first (in order)
1. `CLAUDE.md`
2. `mcp-prompts/_SHARED-CONVENTIONS.md` — follow the package pattern precisely (copy `packages/intel-mcp`).
3. `packages/intel-mcp/` (read-only template) and `packages/ibm-x402-mcp/` (reference for an AI-capability server with a free tier + paid fallback).
4. **The real backend:** `api/vision.js`. Read the handler. Confirm the request shape (image URL vs base64), which model serves free vs paid, response shape, and any size/format limits. Build against reality.

## What this server is
The "let an agent see" surface. `api/vision.js` runs a VLM (free NIM, paid fallback). This server exposes it so any MCP client can pass an image and get a structured description/analysis.

## Proposed tools (confirm/adjust against the real route)
| Tool | R/W | Wraps | Returns |
|------|-----|-------|---------|
| `analyze_image` | read | POST `api/vision` | structured analysis for a prompt+image |
| `describe_image` | read | POST `api/vision` | natural-language description |
| `get_vision_status` | read | GET status | which backend/model is live, free-vs-paid |

## Inputs / auth
Tools take an image as **runtime input** (URL or base64) plus an optional instruction prompt. Validate input at the boundary (size/format/scheme). If the paid fallback requires payment/credentials, surface that in the description and wire it for real (mirror `ibm-x402-mcp`); the free path needs no key. Annotate as `readOnlyHint:true` (analysis doesn't mutate state), `openWorldHint:true`, `idempotentHint:false`.

## Package identity
- npm `@three-ws/vision-mcp` · mcpName `io.github.nirholas/vision-mcp` · dir `packages/vision-mcp` · bin `vision-mcp`

## Done means
`_SHARED-CONVENTIONS.md` → Definition of done. Verify `analyze_image` returns a real VLM result for a test image via `npm run inspect`. Add a `data/changelog.json` entry (tags `sdk`,`feature`), run `npm run build:pages`. **Do not commit or push** unless asked.
