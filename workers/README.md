# Workers

Out-of-process compute for three.ws — the heavy and edge work that does not belong in a Vercel function. Two kinds live here:

- **Cloud Run services** — Python FastAPI apps (GPU or CPU) with a `Dockerfile` + `cloudbuild.yaml`, deployed to Google Cloud Run. These run the avatar reconstruction / rigging models and the talking-avatar video model.
- **Cloudflare Worker** — one JavaScript worker (`wrangler.toml`) deployed with `wrangler deploy`: the remote MCP server.

## Avatar pipeline (Cloud Run)

The avatar pipeline turns a photo into a rigged, blendshape-ready 3D GLB by fanning out to single-purpose GPU services, coordinated by a CPU controller. The controller keeps the same HTTP contract as the original reconstruction service so `api/_providers/gcp.js` needs no changes.

### `avatar-pipeline-controller/` (CPU)
The orchestrator (`main.py`). Exposes `POST /reconstruct` (`{ images: [...], body_type? }` -> `202 { job_id, status }`), `GET /jobs/:id` (`{ status, glb_url?, error?, model }`), and `GET /health`. It picks a mesh backend (Hunyuan3D / TRELLIS / TripoSR) via weighted random, runs reconstruction, then auto-rigs the result through UniRig and uploads the final GLB.

### `model-hunyuan3d/` (GPU L4)
Hunyuan3D-2.1: single image -> textured 3D mesh. `POST /infer` -> `202 { task_id }`, `GET /tasks/:id` -> `{ status, result_gcs_url?, error? }`.

### `model-trellis/` (GPU L4)
Microsoft TRELLIS (MIT): single image -> textured 3D mesh via structured latent representations. Same `/infer` + `/tasks/:id` contract.

### `model-triposr/` (GPU L4)
TripoSR (VAST-AI, MIT): fast single-image -> 3D mesh (~5–15 s, baked single texture). Used as a fast-path / fallback. Same `/infer` contract.

### `unirig/` (GPU L4)
UniRig (VAST-AI-Research, MIT): takes a raw generated mesh and adds a humanoid skeleton, per-vertex skinning weights, and ARKit-52 blendshapes — turning a static mesh into a riggable avatar.

### `avatar-reconstruction/` (GPU L4)
Standalone face-to-avatar service running InstantMesh: accepts 1–6 face photos, synthesizes 6 multi-view renders via Zero123++, reconstructs a textured GLB, and stores it in Cloud Storage. Predates the split pipeline above; see `avatar-reconstruction/README.md`.

## Talking-avatar video (Cloud Run)

### `longcat/` (GPU L4)
FastAPI service running LongCat-Video-Avatar-1.5 (MIT). Takes a reference image + audio URL and renders a lip-synced talking-avatar MP4 to Cloud Storage. API: `POST /generate` -> `202 { job_id }`, `GET /jobs/:id`, `GET /health`; bearer-auth on every request. Full deploy + cost guide in `longcat/README.md`.

## Mesh stylization (Cloud Run, CPU)

### `stylize/` (CPU)
One-click geometric stylization filters — turns any mesh into a stylized variant with pure geometry processing (trimesh + numpy + scipy; no GPU, no model inference). Filters: `voxel` (blocky cubes on a grid), `brick` (voxels + studs, LEGO-like), `voronoi` (open strut-and-node lattice shell), `lowpoly` (decimated + hard flat-shaded facets). Source color is preserved per output element where the style allows. API: `POST /process` (`{ mesh, style, resolution?, output_format? }`) -> `202 { task_id }`, `GET /tasks/:id`, `GET /styles` (filter catalog for the UI), `GET /health`; bearer-auth on `/process` + `/tasks`. Routed via `api/_providers/gcp.js` (`stylize` mode, `GCP_STYLIZE_URL`); exposed to the web at `/api/forge-stylize` and to agents over MCP as `stylize_model`.

## Part segmentation (Cloud Run, CPU)

### `segment/` (CPU)
Splits a 3D model into meaningful, separable parts with clean boundaries (head/torso/limbs on a character; body/wheels/glass on a vehicle) using pure geometry — trimesh + numpy + scipy, no GPU, no model inference. The engine combines connected-component splitting (physically disjoint shells become parts immediately) with the **minima rule** — region growing that cuts the face-adjacency graph at concave creases, where human perception sees part seams — then merges shards and caps the part count to a meaningful handful. Each part is named by its spatial region, tinted a distinct colour, and emitted as a separate named node in the output GLB so it can be hidden, recoloured, replaced, or exported individually. `POST /segment` (`{ mesh, method?, max_parts?, min_part_faces?, crease_angle?, only_part? }`) -> `202 { task_id }`, `GET /tasks/:id` -> `{ status, result_url?, manifest_url?, parts?, part_count?, source_faces?, method?, error? }` (the parts manifest carries each part's id, name, region, bbox, centroid, face/vertex counts, and colour), `GET /health`; bearer-auth on `/segment` + `/tasks`. Routed via `api/_providers/gcp.js` (`segment` mode, `GCP_SEGMENT_URL`); exposed to the web at `/api/forge-segment` (and the `/segment` Parts Studio viewer) and to agents over MCP as the x402-priced `segment_model`.

## Cloudflare Worker

### `pump-fun-mcp/`
Remote Model Context Protocol server (a mirror of `/api/pump-fun-mcp`) deployed as a Cloudflare Worker — `worker.js` + `wrangler.toml`, named `pump-fun-mcp`, with `nodejs_compat`. Exposes pump.fun token tools to MCP clients; configurable via `wrangler secret put` (`SOLANA_RPC_URL`, `PUMPFUN_BOT_URL`, `PUMPFUN_BOT_TOKEN`, ...). Deploy with `wrangler deploy`.

## Loose scripts

### `strategy-executor.js`
A Node script that loads stored agent strategies and calls `executeAgentAction` (from `src/agent-actions.js`) for each one whose conditions are met. Imports `api/_lib/db.js` for storage.

## Deploy

- Cloud Run services: `gcloud builds submit --config workers/<name>/cloudbuild.yaml` (see each service's README for substitutions and secrets).
- Cloudflare Worker: `cd workers/pump-fun-mcp && wrangler deploy`.
