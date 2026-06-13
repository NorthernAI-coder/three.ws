# three.ws 3D Studio — MCP server

Turn text or an image into an interactive, **animation-ready** 3D model — and rig,
animate, pose, edit, retexture, and analyze it — directly from Claude, Cursor,
watsonx Orchestrate, or any MCP client. A focused companion to the main three.ws
MCP server, registered separately as **`io.github.nirholas/threews-3d-studio`**.

- **Endpoint:** `https://three.ws/api/mcp-3d`
- **Transport:** Streamable HTTP (MCP `2025-06-18`, JSON-RPC 2.0)
- **Auth:** OAuth 2.1 (same three.ws authorization server as `/api/mcp`) or x402
- **Backends:** Microsoft TRELLIS image→3D + FLUX text→image (Replicate, platform-keyed); Meshy / Tripo native geometry (BYOK); VAST-AI UniRig auto-rig; IBM Granite (watsonx.ai) for prompt direction + material generation

## The pipeline

The tools compose into one flow — each step's output feeds the next:

```
direct_prompt ─▶ text_to_3d ─┐
                image_to_3d ─┴▶ generation_status ─▶ auto_rig_model ─▶ apply_animation
                                                                   └─▶ pose_model
mesh ops: remesh_model · stylize_model · segment_model · retexture_model · retexture_region · generate_material
analyze:  inspect_model · optimize_model        preview:  preview_3d
```

> "Optimize this idea, generate it, rig it, and make it wave." → `direct_prompt`
> → `text_to_3d` → poll `generation_status` → `auto_rig_model` → poll →
> `apply_animation(animation: "wave")`.

## Tools

### Generate

| Tool                                                                      | What it does                                                                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text_to_3d(prompt, aspect_ratio?, tier?, path?, backend?)`               | Text → reference image → reconstructed GLB. Returns a `job_id` + the intermediate preview image.                                                                |
| `image_to_3d(image_url \| image_urls[], prompt?, tier?, path?, backend?)` | Reconstruct a GLB from 1–4 reference views (multi-view removes back-of-object hallucination). Returns a `job_id`.                                               |
| `generation_status(job_id)`                                               | Poll any job. When done, returns the GLB URL **and** an inline `<model-viewer>` artifact. Provider-aware: routes geometry/self-host jobs to the right upstream. |

### Rig, animate & pose

| Tool                                                     | What it does                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `auto_rig_model(glb_url)`                                | Add a humanoid skeleton + per-vertex skin weights to a static GLB (VAST-AI UniRig). Returns a `job_id`; poll for the rigged GLB.     |
| `list_animations(category?)`                             | The curated, retargetable animation-clip catalogue (names, categories, loop flags).                                                  |
| `apply_animation(model_url, animation, format?, speed?)` | Retarget a preset clip onto a rigged GLB — returns the retargeted `AnimationClip` JSON (or a baked animated GLB).                    |
| `pose_model(prompt)`                                     | Map a pose description to a deterministic seed + full Euler joint-rotation map from the in-repo preset library. Free, deterministic. |

### Edit & process the mesh

| Tool                                                                | What it does                                                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `remesh_model(mesh_url, operation?, target_faces?, output_format?)` | Repair, simplify (quadric decimation), or convert format (incl. FBX with skeleton for Unity/Unreal). |
| `stylize_model(mesh_url, style?, resolution?, output_format?)`      | One-pass geometric restyle: `voxel`, `brick` (LEGO-like), `voronoi` lattice, `lowpoly`.              |
| `segment_model(mesh_url, method?, max_parts?, …)`                   | Split into named, separable parts (each a node) + a parts manifest.                                  |
| `retexture_model(mesh_url, prompt, num_views?, texture_size?)`      | Paint a fresh texture from a prompt (SDXL + ControlNet depth, multi-view back-projection).           |
| `retexture_region(mesh_url, mask_url, prompt?, color?, …)`          | Magic-brush: repaint only a masked UV region, feathering the seam.                                   |
| `generate_material(description, name?)`                             | IBM Granite → a glTF 2.0 PBR material (base color, metallic, roughness, emissive).                   |

### Assist, analyze & preview

| Tool                          | What it does                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `direct_prompt(idea, style?)` | IBM Granite rewrites a vague/multi-subject idea into one optimized single-subject `text_to_3d` prompt + structured directives. |
| `inspect_model(url)`          | Structural stats: meshes, triangles, materials, textures, animations, extensions.                                              |
| `optimize_model(url)`         | Actionable size/perf suggestions: Draco/Meshopt, KTX2, triangle budget.                                                        |
| `preview_3d(glb_url, …)`      | Render any public GLB as an interactive `<model-viewer>` artifact (orbit, AR, auto-rotate).                                    |

Generation, rigging, and most mesh ops are **asynchronous**: the tool returns a
`job_id` immediately, then you poll `generation_status` (reconstruction is
typically 30–90s; rigging 30–90s; texture jobs 2–5 min). When a job finishes,
`generation_status` returns a `text/html` resource — display it as an inline 3D
artifact.

## Quality tiers & generation paths

`text_to_3d` / `image_to_3d` take three optional axes (see
[`api/_lib/forge-tiers.js`](../api/_lib/forge-tiers.js)):

- **`tier`** — `draft` (~12k poly, fast), `standard` (~30k, default), `high`
  (~200k + PBR, slower). Honoured by poly-aware backends; on the TRELLIS default
  it's recorded as provenance.
- **`path`** — `image` (FLUX→TRELLIS reference-image reconstruction, the
  platform-keyed default) or `geometry` (native text/image→mesh, cleaner
  topology).
- **`backend`** — force a specific engine; defaults to the best for the path.

| Backend     | Path(s)         | Key       | Notes                                |
| ----------- | --------------- | --------- | ------------------------------------ |
| `trellis`   | image           | platform  | Fast default. No poly target.        |
| `meshy`     | geometry, image | **BYOK**  | Native text→geometry, quad topology. |
| `tripo`     | geometry, image | **BYOK**  | Cleanest quad topology.              |
| `hunyuan3d` | image           | self-host | High-poly, image-conditioned (GCP).  |

**BYOK note:** the geometry backends (Meshy/Tripo) have no platform key. Supply
your own via the `x-forge-provider-key` request header (or a key stored on your
three.ws account). Without one, the geometry path returns a designed `needs_key`
result and the **image path still works keyless**. The job handle for a geometry
job is an opaque forge token; `generation_status` decodes it and re-resolves the
key per poll.

## Access & pricing

Discovery is free for everyone: `initialize`, `tools/list`, `ping`, and the
`getting_started` tool answer with no credentials, so any agent or crawler can
read the catalog before deciding to pay.

For tool calls there are two lanes:

- **OAuth (three.ws account)** — operator-funded. Sign in once and every studio
  tool runs at no per-call charge, bounded by rate limits.
- **x402 (pay per call, no account)** — send a USDC payment (Base or Solana
  mainnet) with the request. The 402 challenge quotes the exact price of the
  tools you're calling; batches are priced as the sum of their calls. Same
  numbers as `POST /api/x402/forge`, single source: `api/_mcp3d/pricing.js`.

| Tool                                       | Price (USDC)                              |
| ------------------------------------------ | ----------------------------------------- |
| `text_to_3d` / `image_to_3d`               | by tier — $0.05 draft / $0.15 standard / $0.50 high |
| `auto_rig_model`, `retexture_model`, `retexture_region` | $0.05                       |
| `stylize_model`, `remesh_model`, `segment_model`         | $0.02                       |
| `remove_background`, `pose_model`, `apply_animation`, `direct_prompt`, `generate_material` | $0.01 |
| `generation_status`, `preview_3d`, `list_animations`, `inspect_model`, `optimize_model`, `getting_started` | free |

Payment settles only after the work succeeds — a wholesale failure costs
nothing, and the same signed payment cannot be replayed.

## IBM Granite tools

`direct_prompt` and `generate_material` call IBM Granite foundation models via
watsonx.ai. They're **operator-funded**: set `WATSONX_API_KEY` and
`WATSONX_PROJECT_ID` on the server and end users pay nothing extra for them — no
IBM Cloud account required on the caller side. If watsonx isn't configured, both
return a clear "not configured" error rather than failing mid-call.

## Use on claude.ai / watsonx Orchestrate

Add the connector with URL `https://three.ws/api/mcp-3d` and complete the OAuth
flow (or connect it from the watsonx Orchestrate MCP catalog). Then:

> "Make a 3D model of a low-poly red fox sitting upright, rig it, and make it idle."

The assistant calls `text_to_3d`, polls `generation_status`, renders the result
as a live orbitable artifact, then `auto_rig_model` → `apply_animation(animation:
"idle")` for a moving character.

## Configuration

| Env                                                 | Purpose                                                                               | Default                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| `REPLICATE_API_TOKEN`                               | Required. Powers reconstruction, rigging, remesh, retexture.                          | —                                |
| `REPLICATE_RECONSTRUCT_MODEL`                       | image→3D model.                                                                       | `firtoz/trellis`                 |
| `REPLICATE_TXT2IMG_MODEL`                           | text→image model for `text_to_3d`.                                                    | `black-forest-labs/flux-schnell` |
| `REPLICATE_RERIG_MODEL`                             | Auto-rig model. Without it, `auto_rig_model` reports "not configured".                | —                                |
| `GCP_RECONSTRUCTION_URL` / `GCP_RECONSTRUCTION_KEY` | Optional self-host backend (Hunyuan3D, masked region retexture).                      | —                                |
| `WATSONX_API_KEY` / `WATSONX_PROJECT_ID`            | Enable `direct_prompt` + `generate_material`.                                         | —                                |
| `APP_ORIGIN`                                        | Origin used to load the animation manifest for `list_animations` / `apply_animation`. | request host                     |
| `MCP_POSE_PREVIEW_BASE`                             | Base URL for `pose_model` preview links.                                              | `https://three.ws/pose`          |

Geometry backends (Meshy/Tripo) take a **per-request** key via the
`x-forge-provider-key` header — never an env var.

Rate limits: generation/rig/mesh jobs are capped per principal (real GPU spend);
status polling is capped per minute. `pose_model`, `list_animations`,
`inspect_model`, and `optimize_model` are lightweight.

## Publishing to the MCP Registry

The manifest is [`server-3d.json`](../server-3d.json). Publish with the
`mcp-publisher` CLI (the GitHub-namespace ownership flow proves control of the
`io.github.nirholas/*` namespace):

```bash
mcp-publisher login github
mcp-publisher publish --file server-3d.json
```

## Local development

```bash
npm run dev
npx @modelcontextprotocol/inspector http://localhost:3000/api/mcp-3d
```
