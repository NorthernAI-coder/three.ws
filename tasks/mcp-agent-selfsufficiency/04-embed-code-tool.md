# Task 04 — Embed code tool (`get_embed_code`)

**Pillar:** Embed ("as easy as a YouTube video"). **Server:** main `/api/mcp`.
**Read first:** [`README.md`](README.md) and `/CLAUDE.md`.

## Goal

The post's promise is "embed a persistent, on-chain 3D avatar into any platform
as easy as embedding a YouTube video." The embed **infrastructure** is mature
(oEmbed, iframe pages, Open Graph, model-viewer), but there is no MCP tool that
hands an agent a **copy-paste embed snippet / shareable URL**. After this task,
an agent can call one tool and get exactly the HTML to paste into Notion,
Webflow, Framer, a blog, etc.

## What already exists (wire to this — do not rebuild)

- **oEmbed (agents):** `api/agent-oembed.js` —
  `GET /api/oembed?url=<agent-url>` returns oEmbed JSON (`type: rich`) with an
  `html` field containing the `<iframe>` to the embed page, plus width/height.
  Supports JSON + XML, sandbox attributes, camera controls. Handles both
  on-chain agents (`/a/:chainId/:agentId`) and regular agents (`/agent/:id`).
- **oEmbed (forge creations):** `api/play-oembed.js` — same, for Forge 3D
  creations (`/forge?share=:id` / play URLs).
- **Embed pages:** `/agent/:id/embed`, `/a/:chainId/:agentId/embed` (the iframe
  targets), and the Forge share view.
- **Open Graph images:** `api/agent/:id/og`, `api/a-og`, `api/forge-og` (social
  cards) — useful as a `thumbnail_url` in the response.

Read `api/agent-oembed.js` and `api/play-oembed.js` fully; reuse their
URL-resolution + HTML-building logic. The site origin resolution pattern is in
`api/_mcp/tools/animations.js` (`resolveOrigin(req)`) — `req` is available to the
handler.

## Build

### `get_embed_code` (scope: `avatars:read` — read-only)

Return ready-to-paste embed artifacts for an agent or a Forge creation.

- Inputs (one of):
    - `agent_id` (uuid) — embed a regular agent, OR
    - `chain_id` + `onchain_agent_id` — embed an on-chain agent, OR
    - `creation_id` — embed a Forge 3D creation.
    - Plus options: `width` (int, default 480), `height` (int, default 360),
      `autorotate` (bool, default true), `ar` (bool, default true).
- Behavior:
    - Resolve the canonical public URL for the target (reuse the oEmbed resolver).
      If the target requires ownership/visibility (a private avatar), verify the
      caller may share it (reuse `get_avatar`'s visibility check); otherwise return
      a designed "make it public/unlisted first" error.
    - Build the embed `<iframe>` HTML via the **same logic** the oEmbed endpoint
      uses (extract a shared helper if not importable — no duplicated HTML
      string-building).
    - Return:
        ```json
        {
        	"embed_html": "<iframe src=\"https://three.ws/agent/<id>/embed\" ...></iframe>",
        	"share_url": "https://three.ws/agent/<id>",
        	"oembed_url": "https://three.ws/api/oembed?url=...",
        	"thumbnail_url": "https://three.ws/api/agent/<id>/og",
        	"width": 480,
        	"height": 360
        }
        ```
    - Also return a `content` text block with the raw snippet so a chat client
      shows it as copyable text, **and** (optional, nice) a `type: resource`
      `text/html` artifact so MCP clients that render HTML show a live preview
      (mirror how `preview_3d` returns a model-viewer resource).

## Requirements & edge cases

- **No duplicated embed/oEmbed logic.** Extract a shared builder if needed; both
  the existing endpoint and this tool call it.
- Exactly one of `agent_id` / (`chain_id`+`onchain_agent_id`) / `creation_id`
  must be provided — validate and return a clear error otherwise.
- Private/unlisted handling: don't leak a private agent's embed to a
  non-owner. Owner may embed their own private item; others only public/unlisted.
- Width/height bounds sane (e.g. 240–1920 / 180–1080); clamp, don't error.
- Origin must be the real site origin (`resolveOrigin(req)` / `APP_ORIGIN`), never
  hardcoded `localhost`.

## Definition of Done

All items in [`README.md`](README.md) → "Definition of Done", plus:

- [ ] `/api/mcp` catalog lists `get_embed_code` (assembly check).
- [ ] `tests/api/mcp-embed.test.js`: agent embed, on-chain agent embed, forge
      creation embed, the "exactly one target" validation, and a private-not-owner
      rejection. The returned `embed_html` contains the correct `/embed` URL and
      respects width/height. Green.
- [ ] `server.json` description mentions embeddable output.
- [ ] Manually verified: paste the returned `embed_html` into a blank HTML file
      and the avatar renders.

## Out of scope

- Platform-specific shortcodes (WordPress/Discord) — the oEmbed + iframe is the
  universal answer. Building new embed pages (they exist).
