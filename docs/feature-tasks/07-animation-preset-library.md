# Task: Animation preset library (one-click animate a rigged model)

## Goal
Give users a curated library of **ready-to-apply animation presets** (idle, walk, run, jump, wave, dance, etc.) that can be applied to any rigged model with one click and exported as an animated GLB/FBX.

## Why this matters
We auto-rig models but there's no easy path from "rigged" to "moving." A preset library closes that loop and makes rigged output immediately demo-able and useful. The Mixamo-fetch plumbing already exists — this turns it into a real, curated, wired feature.

## Where it lives
- Existing Mixamo plumbing: `fetch-mixamo-catalog` (locate under [workers/](../../workers/) or [scripts/](../../scripts/))
- Rigging pipeline / skeleton format: [workers/avatar-pipeline-controller/main.py](../../workers/avatar-pipeline-controller/main.py)
- Pose studio (keyframe/timeline already present): the `/pose` page
- Viewer with `AnimationClip` support (Three.js)

## Requirements
1. **Curated preset set:** assemble a real, license-clear set of animation clips covering common actions. Store them as retargetable clips keyed to our standard skeleton. Document the source and license of each.
2. **Retargeting:** apply a preset to an arbitrary rigged model whose skeleton matches (or can be mapped to) our standard rig. Handle bone-name mapping; report clearly if a model can't be retargeted.
3. **UI:** an animation gallery (thumbnails/looping previews) on the model/pose page. Click to preview on the loaded model, then apply. Designed hover/active/focus, empty, and error states.
4. **Export:** export the animated result as GLB (and FBX once [02-fbx-export.md](02-fbx-export.md) lands) with the animation baked in.
5. Optionally expose `apply_animation` via MCP (x402-priced).

## Done when
- A user loads a rigged model, picks a preset, previews it animating, and exports an animated GLB.
- Retargeting works across at least a few differently-proportioned rigged models.
- Real clips with documented licensing (no placeholder/empty animations); CLAUDE.md followed.
