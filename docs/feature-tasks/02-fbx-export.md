# Task: FBX export (with skeleton)

## Goal
Add **FBX** as an export format for generated and rigged models, including the skeleton + skin weights for rigged outputs. This is a hard blocker for Unity and Unreal users, who overwhelmingly expect FBX with a bone hierarchy.

## Why this matters
We export GLB / OBJ / STL / PLY / USDZ / 3MF but **not FBX**. Game-engine pipelines treat FBX as the default interchange format, especially for animated/rigged characters. Without it, a whole segment of users can't use our output without a manual Blender round-trip.

## Where it lives
- Mesh conversion worker: [workers/remesh/main.py](../../workers/remesh/main.py) (trimesh + open3d; `convert` operation already exists)
- HTTP route: [api/forge-remesh.js](../../api/) (the `forge-remesh` endpoint)
- Rigging pipeline that produces skeletons: [workers/avatar-pipeline-controller/main.py](../../workers/avatar-pipeline-controller/main.py)
- MCP `remesh_model` tool under `api/_mcp3d/`

## Requirements
1. Add `fbx` to the supported output formats of the convert/remesh path.
2. **Preserve rig data** when converting a rigged GLB → FBX: bone hierarchy, skin weights, and any blendshapes must survive the conversion. A static mesh converts as a plain FBX. trimesh alone does not write FBX with skeletons — evaluate Blender headless (`bpy`) or the FBX SDK / `assimp` and pick the one that round-trips bones correctly. Justify the choice in the PR.
3. Wire `fbx` as a selectable export option everywhere GLB/OBJ/etc are offered (UI export menus, remesh API, MCP tool enum).
4. Validate the output: a rigged FBX should import into Blender/Unity with its skeleton intact. Document the verification.

## Done when
- A rigged GLB converts to an FBX that retains its skeleton + skin weights (verified by re-import).
- A static mesh converts to a valid FBX.
- `fbx` selectable in UI, REST, and MCP; real conversion, no mocks.
- Follow CLAUDE.md: finish completely, no stubs, self-review the diff.
