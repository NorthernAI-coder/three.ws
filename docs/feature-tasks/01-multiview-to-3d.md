# Task: Multiview-to-3D reconstruction

## Goal
Let users supply **multiple reference images of the same object from different angles** (e.g. front / back / left / right) and reconstruct a single, higher-fidelity 3D mesh from them. Today the generation pipeline only accepts one `image_url`, which caps geometric accuracy for anything with detail on unseen sides.

## Why this matters
Single-image reconstruction hallucinates the back of every object. Feeding 2–4 calibrated views removes that guesswork and is the single biggest quality lever available without changing models — the backends we already use (Hunyuan3D, TRELLIS) support multi-view conditioning.

## Where it lives
- Generation entrypoint: [api/forge.js](../../api/forge.js)
- Model providers: [api/_providers/replicate.js](../../api/_providers/replicate.js), [api/_providers/gcp.js](../../api/_providers/gcp.js)
- Forge UI: [pages/forge.html](../../pages/forge.html)
- MCP tool surface: `mesh_forge` (wherever it is registered under `api/_mcp3d/`)

## Requirements
1. **API contract:** accept `image_urls: string[]` (1–4 images) in addition to the existing single `image_url` (keep backward compatibility — a single string still works). Validate count, fetch/validate each image at the boundary.
2. **Provider routing:** when >1 image is supplied, route to a backend that supports multi-view conditioning and pass all views. If a chosen backend does not support multi-view, fall back gracefully and surface which mode was used in the job result. No silent downgrade without reporting it.
3. **UI:** extend [pages/forge.html](../../pages/forge.html) so a user can add up to 4 view slots with drag/drop + file picker, labelled (front/back/left/right or freeform). Show thumbnails, allow removal/reorder. Every state designed: empty slot, uploading, uploaded, error.
4. **MCP:** extend `mesh_forge` to accept the array form. Keep pricing/x402 behavior consistent with the existing tool.
5. **Job result:** record how many views were used and which backend handled it, surfaced in the polling response.

## Done when
- Single-image and multi-image both work end-to-end through `/forge` and through the MCP tool.
- Real generation succeeds with real images (no mocks); model-viewer renders the result.
- Backward compatibility verified: existing single-`image_url` callers unaffected.
- Follow CLAUDE.md: real APIs only, every UI state designed, no TODOs, `git diff` self-reviewed.
