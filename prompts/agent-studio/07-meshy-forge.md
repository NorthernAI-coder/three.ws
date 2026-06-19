# P6 — Meshy Forge (generate any avatar, wearable, prop, or scene from words)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/agent-studio/00b-innovation-north-star.md` first. **Prerequisites:**
P0 (`01-foundation.md`) merged; works best alongside P3 (Body) — coordinate via the `studio` contract.

## The invention

Every avatar app ships a fixed catalog of cosmetics. We ship an **infinite, AI-native one**: the user
types "obsidian samurai helmet with neon trim" or drops a photo, and seconds later a real, textured,
rigged 3D asset is generated, attached to their live agent, and ownable. No catalog can compete with a
generator. This makes our agents endlessly personal — and gives us a cosmetics economy where every item
is unique. Combined with the trade engine, rare items become **trophies** earned by performance.

This is gamechanging only if it's truly live and truly owned — generation in-app, attached to the live
avatar instantly, mintable on-chain. Build that.

## The real integration (no mocks — this is the whole point)

Use **Meshy** for generation. At runtime you have two real paths; prefer the MCP, fall back to REST:
- **Meshy MCP server** (the `meshy` server connected to this workspace) — discover its tools via
  ToolSearch (`meshy`, `text to 3d`, `image to 3d`) and call them directly.
- **Meshy REST API** (`https://api.meshy.ai`) with `MESHY_API_KEY` from env/`vercel env`. Real
  capabilities to wire: **Text-to-3D** (preview → refine), **Image-to-3D** (from a user photo/logo),
  **Text-to-Texture** (re-skin an existing GLB), **Auto-rigging/animation**, and **Remesh** (optimize
  poly count for web). All are async: create task → poll status → receive GLB/FBX/USDZ + PBR texture
  URLs. Verify the exact request/response shape against Meshy's live API docs before coding; do not
  assume fields.

Route all generation through a **server-side proxy** in `api/forge/**` (never expose `MESHY_API_KEY`
to the client), with: job creation, status polling/streaming to the client, cost/rate guarding per
user, content-safety filtering on prompts, and persistence of finished assets.

## Your mission

### 1. Forge UI (in Studio + reachable from the Body tab)
- Prompt-to-3D and image-to-3D panels with live progress (real polling, real % — not a fake bar),
  preview turntable, and "attach to avatar" that snaps the result to the right bone via the existing
  `src/agent-accessories.js` / `src/avatar-wardrobe.js` (consume, don't rewrite). The result must
  appear on the **live** studio avatar and the site-wide `<agent-presence>` immediately (`studio.preview`
  then `studio.patch` on save).
- Re-texture flow: take an existing wearable/avatar GLB and re-skin it via Text-to-Texture.
- Auto-optimize generated GLBs for the web (Remesh + the existing `src/avatar-studio-optimize.js`) so
  the persistent presence stays performant. Dispose old GPU resources on swap.

### 2. Generate whole avatars, not just accessories
- A "create my agent's body from a description/photo" flow that produces a rigged avatar compatible with
  the existing `Viewer` + animation slots (`src/runtime/animation-slots.js`). Validate against
  `packages/avatar-schema/` so the result is a first-class avatar, not a one-off.

### 3. Ownership + economy (wire into the platform)
- Persist generated assets to the user's library (real DB, real storage — check how avatars/assets are
  stored today in `api/` + `public/`). Let the user **mint** a generated item on-chain using the
  existing Metaplex/skill-license patterns (`api/_lib/skill-license-onchain.js`, the avatar manifest
  flow) so cosmetics are real, tradeable property. The only coin promoted is `$THREE`; minting uses the
  platform's existing on-chain plumbing, never a non-$THREE token recommendation.
- Expose a **trophy hook**: P4 (trading milestones) and P8 (reputation tiers) can grant a Forge
  generation or unlock a rare item. Define a clean grant API; coordinate via the `studio` contract.

## Definition of done
- Real Meshy generation (MCP or REST) end-to-end: text/image → textured, rigged, web-optimized GLB,
  attached to the live avatar, persisted, optionally minted on-chain. No fake progress, no sample assets.
- `MESHY_API_KEY` never reaches the client; proxy enforces rate/cost/safety limits.
- All states designed: empty (prompt ideas/examples), generating (real progress + cancel), failed
  (actionable retry), library full (manage/delete). Accessibility + reduced-motion respected.
- Performance holds with multiple generated assets equipped (dispose, LOD/remesh, lazy-load).
- No console errors; `npm test` passes; network tab shows real Meshy + storage + chain calls.
  Changelog entry added.

## Operating rules (override defaults)
No mocks/fake progress/sample assets. $THREE only; on-chain mint uses existing platform plumbing.
Design tokens only. Stage explicit paths (never `git add -A`); re-check `git diff --staged` before
commit. Own `src/studio/forge/**`, `api/forge/**`; consume P3's wardrobe/accessory modules; expose the
trophy-grant hook for P4/P8.

## When finished
Self-review (CLAUDE.md's five checks). Then push it — e.g. "remix" (fork + re-prompt someone's public
item), style presets tied to the agent's persona (P1), or a "forge from the coin you just sniped" moment
that turns a trade into a wearable (coordinate with P4/P9). Build it. Then **delete this prompt file**
(`prompts/agent-studio/07-meshy-forge.md`) and report what you shipped + the generated-asset format and
the trophy-grant API for P4/P8.
