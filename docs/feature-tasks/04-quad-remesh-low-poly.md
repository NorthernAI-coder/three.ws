# Task: Quad remesh + smart low-poly

## Goal
Add **quad-based remeshing** and a **smart low-poly** mode that produces clean, game-ready topology with a user-chosen target resolution — not just triangle-soup decimation.

## Why this matters
Today's remesh does quadric *triangle* decimation. Game and animation pipelines want **quad** topology (clean edge loops, deformation-friendly) and tunwrapped low-poly variants for real-time rendering. Without it, our output needs a manual retopo pass before it's usable in production.

## Where it lives
- Mesh worker: [workers/remesh/main.py](../../workers/remesh/main.py) (currently trimesh + open3d quadric decimation)
- HTTP route: `forge-remesh` in [api/](../../api/)
- MCP `remesh_model` tool under `api/_mcp3d/`

## Requirements
1. **Quad remesh:** integrate a real quad remesher (e.g. Instant Meshes / `quadwild` / Blender `bpy` remesh, or an equivalent library). Output predominantly-quad topology with target face/vertex count. Justify the tool choice and license-check it (must be commercial-OK per CLAUDE.md).
2. **Smart low-poly mode:** a preset that produces a low-poly variant (e.g. target buckets like 1k / 5k / 20k faces) while preserving silhouette, then **re-bakes/transfers UVs + normals** so textures still map. Don't just decimate and drop the textures.
3. Expose `remesh_mode` (`triangle` | `quad` | `lowpoly`) + target count across UI, REST, and MCP.
4. Preserve UVs and re-project the existing texture onto the remeshed result wherever possible.

## Done when
- Quad remesh produces clean quad-dominant topology at the requested resolution (verify in Blender wireframe).
- Low-poly mode produces a usable real-time variant that still renders with its texture.
- All three modes selectable in UI/REST/MCP; real implementation; CLAUDE.md followed.
