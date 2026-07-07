# three.ws 3D Studio — free MCP endpoint

A free, non-crypto MCP server that turns a text prompt or an image into an
interactive, downloadable 3D model (GLB). It exposes **only** 3D-generation
tools — no account, no payment, no API key, no wallet, no token. Built for the
OpenAI ChatGPT App Directory and any MCP client.

> The paid, crypto-enabled studio (per-call USDC via x402) is a separate server
> at `/api/mcp-3d`. This endpoint shares none of that surface.

## Connect

| | |
|---|---|
| **URL** | `https://three.ws/api/mcp-studio` |
| **Transport** | Streamable HTTP (JSON-RPC over `POST`) |
| **Auth** | None — open and free |
| **Protocol** | MCP `2025-06-18` |
| **Manifest** | [`server-studio.json`](../server-studio.json) |

`GET` is intentionally not offered (no server-initiated stream); the server
answers every request synchronously over `POST`. `OPTIONS` is handled for CORS.

### ChatGPT (Apps SDK)

Add the connector with the URL above and **No authentication**. Each generation
tool renders its result inline in an interactive 3D viewer widget
(`ui://widget/three-studio-model.html`).

### Any MCP client

```bash
curl -s https://three.ws/api/mcp-studio \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Tools

All five are free and run operator-funded on the platform's own generation
pipeline. Annotations: `readOnlyHint:false`, `destructiveHint:false`,
`idempotentHint:false`, `openWorldHint:true` (work runs against external model
APIs; nothing is ever modified or deleted).

| Tool | Title | Input | Returns |
|---|---|---|---|
| `forge_free` | Generate a 3D model from text | `prompt`, `tier?` | GLB model |
| `text_to_avatar` | Generate a 3D avatar | `prompt?` / `image_url?` | GLB avatar |
| `mesh_forge` | Generate a 3D mesh (art-directed) | `prompt?` / `image_url?` | GLB mesh |
| `rig_mesh` | Rig a 3D model for animation | `glb_url` | rigged GLB |
| `forge_avatar` | Generate a rigged, animation-ready avatar | `prompt?` / `image_url?`, `allow_non_humanoid?` | rigged GLB avatar |

### Response shape

Each successful call returns `structuredContent` carrying only what a client
needs to display the model — no internal identifiers:

```json
{
  "kind": "model",
  "glbUrl": "https://three.ws/cdn/creations/…/model.glb",
  "viewerUrl": "https://three.ws/viewer?src=…",
  "format": "glb",
  "prompt": "a friendly round robot mascot, glossy white plastic"
}
```

## Funding & limits

Generation is **operator-funded**: the platform's server-side keys cover provider
cost, so the ChatGPT user pays nothing. Every tool routes through a **free lane**
(NVIDIA NIM text→3D, Hugging Face Spaces image→3D) — the studio never selects the
paid Replicate backend — so the platform's marginal cost per generation is zero.
The endpoint still enforces real per-IP abuse protection (`api/_lib/rate-limit.js`):

- **Burst:** 4 generations / minute / IP
- **Hourly:** 30 generations / hour / IP
- **Transport:** 300 requests / minute / IP (discovery, never throttled by the
  generation quota)

Because the lanes are zero-cost, these caps **fail open** if the rate-limiter
backend has an outage — a Redis blip must never dead-end a free feature (the same
posture as the paid server's own free lane). They enforce normally whenever the
backend is healthy, and any accidental paid-lane spend is still fail-closed one
layer down in `/api/forge`.

## Safety

Generation prompts are screened for age-13+ appropriateness before any provider
work (`api/_mcp-studio/safety.js`): sexual/adult, child-sexual, graphically
violent, hateful/extremist, and real-weapon/drug prompts are refused with a
clear message. Stylized fantasy props (a sword, a wand) are allowed.

## Environment

All optional — sensible production defaults:

| Var | Default | Purpose |
|---|---|---|
| `STUDIO_API_BASE` | request origin → `PUBLIC_APP_ORIGIN` → `https://three.ws` | Origin to call `/api/forge` on |
| `STUDIO_FORGE_TIMEOUT_MS` | `180000` | Generation poll budget |
| `STUDIO_RIG_TIMEOUT_MS` | `180000` | Rig poll budget |
| `STUDIO_POLL_MS` | `3000` | Poll interval |
