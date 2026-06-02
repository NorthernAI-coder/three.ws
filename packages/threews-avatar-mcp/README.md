# @three-ws/avatar-mcp

An [MCP](https://modelcontextprotocol.io) server that drops a **live three.ws 3D avatar** into any MCP client — Claude Desktop, Claude Code, Cursor, or any other host. Render a rotatable avatar inline, get a paste-anywhere embed iframe, or fetch avatar metadata.

It's a thin, **zero-config, read-only** bridge to the real three.ws endpoints. Public and unlisted avatars need **no API key**. No mock data — every tool reads live from three.ws.

> Registry name: `io.github.nirholas/threews-avatar`. Built by [three.ws](https://three.ws).

## Tools

| Tool | What it does |
| --- | --- |
| `render_avatar` | Renders an avatar inline. On [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)-capable hosts (Claude, VS Code Copilot, Goose…) it shows a **live, rotatable 3D model right in the chat**; on other clients it falls back to a preview image + embed URL. |
| `avatar_embed_code` | A ready-to-paste `<iframe>` that embeds the live avatar anywhere — as easy as a YouTube embed. |
| `get_avatar` | Avatar metadata: name, GLB model url, owner, visibility. |

### Interactive 3D in the chat (MCP Apps)

`render_avatar` is an [MCP App](https://modelcontextprotocol.io/extensions/apps/overview) (SEP-1865): it declares a `ui://` resource that supporting hosts render in a sandboxed iframe — a real, orbit-and-zoom `<model-viewer>`, not a static image. Hosts without MCP Apps support still get a rendered preview image and a one-tap live embed, so the tool degrades gracefully everywhere.

Identify an avatar three ways: by **`id`** (UUID), by **`@handle`** (username), or by a raw **`model`** GLB url.

## Use with Claude Desktop / Claude Code / Cursor

```json
{
  "mcpServers": {
    "threews-avatar": {
      "command": "npx",
      "args": ["-y", "@three-ws/avatar-mcp"]
    }
  }
}
```

No environment variables required. To point at a different host, set `THREEWS_BASE_URL`.

## Run standalone

```bash
npx @three-ws/avatar-mcp
# inspect the tool surface:
npx -y @modelcontextprotocol/inspector npx @three-ws/avatar-mcp
```

## Example calls

```jsonc
// render_avatar — live, rotatable avatar in chat
{ "handle": "nirholas", "background": "dark", "auto_rotate": true }

// avatar_embed_code — paste into any website
{ "id": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f", "height": 560 }

// get_avatar — metadata
{ "handle": "@nirholas" }
```

`render_avatar` returns three things so it looks great in every client:
1. a **preview image** (renders inline everywhere),
2. an **interactive `text/html` resource** (a `<model-viewer>` you can orbit — for clients that render HTML resources), and
3. the **embed URL + iframe** so you can drop the live avatar into any page.

## How it works

| Selector | Endpoint |
| --- | --- |
| `id` | `GET https://three.ws/api/avatars/:id` |
| `handle` | `GET https://three.ws/api/users/:handle/avatar` |
| preview image | `GET https://three.ws/api/avatar/render?avatar=:id` |
| live embed | `https://three.ws/avatar-embed.html?...` |
| viewer | `https://three.ws/viewer?src=:glb` |

## License

Apache-2.0
