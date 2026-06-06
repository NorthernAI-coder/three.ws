# Task: One-click stylization filters (LEGO / Voxel / Voronoi / etc.)

## Goal
Add instant **geometric stylization filters** that transform any mesh into a stylized variant — voxelized (blocky), brick/stud (LEGO-like), Voronoi/wireframe shell, low-poly faceted, and similar — with a single click.

## Why this matters
Stylization is high-delight, highly shareable ("screenshot and post" material per CLAUDE.md), and turns one generated asset into many. It's pure geometry processing, so it's fast and cheap — no model inference needed.

## Where it lives
- New stylization step in the mesh worker family: [workers/](../../workers/) (model after [workers/remesh/main.py](../../workers/remesh/main.py))
- REST route in [api/](../../api/)
- MCP tool under `api/_mcp3d/tools/`
- Forge / studio UI: a "Stylize" panel with filter thumbnails

## Requirements
1. Implement real geometry transforms (trimesh / open3d / custom):
   - **Voxel:** voxelize to a grid, rebuild as cubes at chosen resolution.
   - **Brick/stud:** voxel grid + stud caps on top faces.
   - **Voronoi shell:** surface-sample → Voronoi cells → open lattice shell.
   - **Faceted low-poly:** decimate + flat-shade hard normals.
   Make the filter set extensible so more can be added later.
2. Each filter takes a resolution/intensity parameter with sensible defaults and a live-ish preview thumbnail.
3. Preserve a reasonable color/material from the source where the style allows; otherwise apply a tasteful default material.
4. Expose in UI (filter gallery with hover previews), REST, and MCP (x402-priced).

## Done when
- Each filter produces a correct, renderable GLB from a real input mesh.
- UI gallery with hover/active/focus states; empty + error states designed.
- Real geometry processing, no placeholders; CLAUDE.md followed.
