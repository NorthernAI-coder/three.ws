# Task: Higher-resolution geometry + native geometry generation path

## Goal
Raise the geometric ceiling and accuracy of generated meshes by (a) supporting higher polygon targets and (b) adding a **geometry-first generation path** that produces mesh geometry directly rather than always going through an intermediate image.

## Why this matters
Our pipeline is image-intermediate (text → image → mesh), which caps geometric accuracy and detail — the mesh can only be as good as a single synthesized view implies. A native/geometry-first backend plus higher poly ceilings closes the fidelity gap for detailed assets and gives power users a high-detail option.

## Where it lives
- Generation entrypoint: [api/forge.js](../../api/forge.js)
- Providers: [api/_providers/replicate.js](../../api/_providers/replicate.js), [api/_providers/gcp.js](../../api/_providers/gcp.js)
- Rigging/finishing pipeline: [workers/avatar-pipeline-controller/main.py](../../workers/avatar-pipeline-controller/main.py)

## Requirements
1. **Higher poly targets:** expose a quality/resolution tier (e.g. draft / standard / high) that maps to higher output poly budgets where the backend supports it. Make sure downstream remesh/rig/storage handle large meshes without breaking.
2. **Native geometry backend:** evaluate and integrate at least one backend that generates 3D geometry directly (native 3D diffusion / geometry-first model) as an alternative route to the current image-intermediate path. License must be commercial-OK. Justify the choice.
3. **Routing:** let the request select the path (`mode: image | geometry`) with a sensible default; record which path/backend produced each job in the result.
4. **Performance + cost:** surface expected time/cost difference between tiers/paths so the UI can communicate it; keep the existing fast path as default.

## Done when
- A high tier produces visibly higher-detail meshes than the default, end-to-end.
- The geometry-first path produces valid, riggable GLBs through the full pipeline.
- Job results report tier + backend + path; real backends only; CLAUDE.md followed.

## Note
This is the most research-heavy task — start by surveying available commercial-OK backends and benchmarking quality/cost/latency before wiring. Report the benchmark before committing to one.
