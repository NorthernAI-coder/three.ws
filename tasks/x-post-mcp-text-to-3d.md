# Task: Post to X about text-to-3D via MCP

## Context

three.ws has 19 packages on npm under `@three-ws/*`. The most compelling angle for an X post
right now is the `mesh_forge` MCP tool — it lets any Claude/Cursor/MCP-compatible AI agent
generate a real textured 3D GLB from a text prompt for $0.25 USDC, paid automatically via x402.
This is a genuinely novel capability: AI agents that can create 3D assets autonomously, paid by
the agent itself.

The audience is AI developers and MCP tool builders (hot topic right now).

The fix making this actually work was just deployed:
- Standard text prompts now route directly to the free NVIDIA TRELLIS lane (no Replicate needed)
- NVIDIA's async response format is now handled correctly
- The full pipeline: `text prompt → IBM Granite director → NVIDIA TRELLIS → textured GLB → viewer URL`

## The X post to write and publish

Draft a thread (2–3 posts) targeted at AI developers. Tone: professional, literal, no hype.
Anchor every claim to something real.

**Suggested angle:**
```
Post 1 (hook):
You can now give your AI agent the ability to generate 3D models.

One tool call. $0.25 USDC per model. Paid automatically.

npx -y @three-ws/mcp-server

Post 2 (how it works):
mesh_forge — text → textured GLB

A chain of specialist models runs:
→ IBM Granite rewrites your prompt into an optimized 3D spec
→ NVIDIA TRELLIS generates the mesh
→ Returns a GLB URL + live viewer link

Works in Claude Desktop, Cursor, or any MCP client.

Post 3 (the bigger picture):
We have 19 packages on npm under @three-ws:
• 8 MCP servers (3D generation, avatar, pump.fun, IBM watsonx, x402 payments, token data)
• Agent SDKs for Solana, payments, and protocol coordination
• x402-fetch for autonomous agent payments

All under @three-ws on npm. Full list: [link to npmjs.com/org/three-ws or three.ws/docs/mcp]
```

## Steps

1. **Verify the forge pipeline is working** before posting — hit
   `https://three.ws/api/forge` with a text prompt and confirm you get a `glb_url` back.
   If it's still broken, do NOT post until fixed.

2. **Draft the actual copy** — adapt the suggested angle above. Keep each post under 280 chars.
   Do not use emojis unless the user explicitly says to. No sci-fi metaphors.

3. **Check the viewer link** — the `preview` field in the forge response should be a live URL
   like `https://three.ws/viewer?src=...`. Confirm it loads.

4. **Post to X** — use the account the user specifies. If no account is specified, ask before
   posting. This is public-facing content so confirm the copy with the user first.

5. **Update changelog** — after posting, append an entry to `data/changelog.json`:
   ```json
   {
     "date": "2026-06-16",
     "title": "text-to-3D via MCP — generate 3D models from AI agents",
     "summary": "The mesh_forge MCP tool lets any AI agent generate a textured GLB from a text prompt. Uses IBM Granite for prompt direction and NVIDIA TRELLIS for reconstruction. Paid via x402 USDC.",
     "tags": ["feature", "sdk"],
     "link": "/docs/mcp"
   }
   ```
   Then run `npm run build:pages` to regenerate the changelog files.

## Key URLs to include in the post

- npm page: https://www.npmjs.com/package/@three-ws/mcp-server
- Docs: https://three.ws/docs/mcp (or whichever docs page covers the MCP tools)
- Viewer: https://three.ws/forge (the live forge UI)

## Acceptance criteria

- Post is live on X
- Copy is grounded: no unverified claims, no fictional metrics
- The forge pipeline was verified working before posting
- Changelog entry added and `npm run build:pages` run

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/x-post-mcp-text-to-3d.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
