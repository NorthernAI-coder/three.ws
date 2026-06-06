# Task: Parts segmentation (split 3D model into semantic parts)

## Goal
Automatically split a generated mesh into **meaningful, separable parts** with clean boundaries (e.g. head / torso / arms / legs for a character; wheels / body / windows for a vehicle). Output each part as an addressable sub-mesh that can be hidden, recolored, replaced, or exported individually.

## Why this matters
Segmented models are dramatically more useful for games and animation: swap a weapon, recolor one panel, rig parts independently, or LOD them separately. This is a clear differentiator we currently lack entirely.

## Where it lives
- New worker alongside existing ones: [workers/](../../workers/) (model after [workers/remesh/main.py](../../workers/remesh/main.py) for structure — FastAPI + trimesh)
- New HTTP route in [api/](../../api/) (e.g. `forge-segment`)
- New MCP tool under `api/_mcp3d/tools/` (model after the existing studio tools)
- Viewer integration so segmented parts are visible/selectable

## Requirements
1. **Segmentation engine:** implement real part segmentation. Evaluate options (a learned 3D part-segmentation model via Replicate/GPU worker, or a geometry-based approach — connected components + region growing on curvature/UV islands). Pick one that produces semantically clean parts, not arbitrary chunks. Justify the choice.
2. **Output:** return a GLB whose parts are separate named meshes/nodes, plus a parts manifest (id, name, bbox, face count). Optionally allow exporting a single part.
3. **Viewer:** in the model viewer (model-viewer / Three.js), let users click a part to isolate/highlight it, toggle visibility, and download an individual part. Every state designed.
4. **MCP + API:** expose `segment_model` as an x402-priced tool consistent with the others, and a REST endpoint.

## Done when
- Feeding a real generated GLB returns cleanly separated, named parts rendered and selectable in the viewer.
- Per-part isolation, visibility toggle, and per-part export all work.
- Real implementation, no placeholder splits; follow CLAUDE.md throughout.
