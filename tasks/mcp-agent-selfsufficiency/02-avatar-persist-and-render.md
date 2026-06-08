# Task 02 — Persist & render an avatar (`save_avatar` / `render_avatar_image`)

**Pillar:** Body. **Server:** 3D Studio `/api/mcp-3d` (+ reuse on main `/api/mcp`).
**Read first:** [`README.md`](README.md) and `/CLAUDE.md`.

## Goal

The 3D Studio MCP can already _generate_ a GLB (`text_to_3d` → `generation_status`
→ glb_url), but an agent cannot **persist** that GLB as a durable, named avatar,
nor get a **rendered image** of it — both require the web app today. This task
makes the body pipeline end-to-end over MCP: generate → **save** → **render**.
Saving is the connective tissue that later unlocks embedding (Task 04), on-chain
identity (Task 03), and OG/social images.

## What already exists (wire to this — do not rebuild)

- **Avatar storage / CRUD:** `api/avatars.js` and `api/agents.js`. Read them for
  the create/persist path — avatars live in the DB with a `model_url` (GLB in R2)
  and metadata (name, slug, visibility, owner `user_id`). Find the function that
  creates an avatar record + the R2 upload helper (search `putObject`,
  `model_url`, `INSERT INTO ... avatars`/`agent_identities`). Reuse it.
- **MCP read tools already exist** on `/api/mcp`: `list_my_avatars`, `get_avatar`,
  `delete_avatar` (`api/_mcp/tools/avatars.js`) — match their scope/ownership
  style (`avatars:read`, `avatars:delete`).
- **Render-to-image endpoint:** `api/avatar/render.js` —
  `GET /api/avatar/render?avatar=<uuid>&scene=&pose=&expression=&size=&bg=&format=`.
  Renders a stored avatar to PNG/JPEG/WebP via headless chromium + three.js and
  caches in R2. Scenes: `full-body | upper-body | portrait | headshot`. Pose ids
  come from `src/pose-presets.js`. **Note:** it currently requires a stored
  `avatar` UUID (it reads `avatar.model_url`).

Read `api/avatars.js`, `api/agents.js` (the create path), and `api/avatar/render.js`
fully before writing.

## Build

### A) `save_avatar` — add to `api/_mcp3d/tools/studio.js` (scope: `avatars:write`)

Persist a public GLB URL (e.g. one returned by `generation_status`) as a durable
avatar owned by the caller.

- Inputs: `glb_url` (required, public https), `name` (required, 1–80 chars),
  `visibility` (enum `public|unlisted|private`, default `unlisted`),
  `source_prompt` (optional), `tags` (string[] optional).
- Behavior:
    1. SSRF-guard the `glb_url` (reuse `isPublicHttpsUrl` already in studio.js).
    2. Require `auth.userId` (return a designed "sign in to save" error if null).
    3. Copy the GLB into durable storage (reuse the existing R2 upload / the forge
       `materializeCreation` pattern — search `materializeCreation` in
       `api/_lib/forge-store.js`) so the avatar survives provider URL expiry.
    4. Create the avatar record (reuse the avatars create function) with
       `model_url` = durable URL, owner = `auth.userId`.
    5. Return `{ avatar_id, slug, model_url, view_url }` where `view_url` is the
       public avatar page.
- This bridges Studio → the avatar system: after `save_avatar`, the existing
  `get_avatar` / `render_avatar` / Task 04 embed all work on the result.

### B) `render_avatar_image` — add to `api/_mcp/tools/avatars.js` (scope: `avatars:read`)

Render a stored avatar to an image and return its URL.

- Inputs: `avatar_id` (required, uuid), `scene` (enum full-body|upper-body|
  portrait|headshot, default upper-body), `pose` (optional preset id),
  `expression` (optional ARKit-52 morph object), `size` (int 64–2048, default
  512), `bg` (string, default transparent), `format` (enum png|jpeg|webp,
  default png).
- Behavior: verify the avatar is the caller's or public (reuse the
  ownership/visibility check `get_avatar` uses), then produce the render URL via
  the **same code path** as `api/avatar/render.js`. Prefer calling the render
  endpoint's own logic over duplicating the chromium pipeline — if the render
  logic isn't importable, extract the param-building + cache-key + invocation
  into a small shared helper used by both the endpoint and this tool (no
  duplicated chromium code). Return `{ image_url, scene, cached }`.

## Requirements & edge cases

- **No duplicated render pipeline.** If you must share logic, extract a helper
  (`api/_lib/avatar-render.js` or similar) imported by both — delete-aggressively,
  per CLAUDE.md.
- Ownership/visibility: `render_avatar_image` may render public avatars owned by
  others (matches `get_avatar`), but `save_avatar` always writes to `auth.userId`.
- Validate `pose` against `src/pose-presets.js` ids and `expression` as a plain
  object (reuse the validation in `api/avatar/render.js`).
- Designed states: missing avatar → clear not-found; chromium/render failure →
  actionable error, never a fabricated image URL.
- Register `avatars:write` scope if it doesn't already exist.

## Definition of Done

All items in [`README.md`](README.md) → "Definition of Done", plus:

- [ ] `/api/mcp-3d` catalog lists `save_avatar`; `/api/mcp` catalog lists
      `render_avatar_image` (assembly check for both).
- [ ] `tests/api/mcp-avatar-persist.test.js`: save happy-path (mock R2 + DB),
      `auth.userId:null` rejection, SSRF rejection of a non-public glb_url, and a
      render happy-path (mock the render layer) + bad-pose rejection. Green.
- [ ] `server-3d.json` and `server.json` descriptions updated.
- [ ] Manually verified end-to-end via inspector: `text_to_3d` →
      `generation_status` → `save_avatar` → `render_avatar_image` returns an image
      URL.

## Out of scope

- New non-GLB export formats (FBX/USDZ already partly handled by `remesh_model`).
- Avatar editing UI. Adding `render_avatar_image` to the 3D Studio server (keep
  it on `/api/mcp` next to the other avatar tools).
