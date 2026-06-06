# Task: Magic Brush — local region retexturing

## Goal
Let users **repaint a specific region** of a model's texture from a text prompt (and/or color) without regenerating the entire surface. Fix a seam, recolor one panel, add a logo to a chest plate — surgically.

## Why this matters
Our current retexture is all-or-nothing: any fix means regenerating the whole surface and losing everything else. A local brush is faster, cheaper, and gives users real control over the result.

## Where it lives
- Texture worker: [workers/texture/main.py](../../workers/texture/main.py) (SDXL + ControlNet depth, multi-view back-projection)
- MCP `retexture_model` tool: [api/_mcp3d/tools/studio.js](../../api/_mcp3d/tools/studio.js)
- Viewer / studio UI where models are displayed and edited

## Requirements
1. **Region selection:** in the 3D viewer let the user paint a mask directly on the model surface (brush with adjustable radius), or select a part/material. Produce a UV-space mask from the surface selection.
2. **Masked inpainting:** extend the texture pipeline to inpaint **only** the masked UV region from a prompt/color, blending edges so the seam is invisible. The rest of the texture is untouched (load and preserve the existing texture as the base).
3. **Iterative:** support repeated brush passes on the same model without quality loss; each pass operates on the latest texture.
4. Expose via UI (brush tool with prompt box), and add a `retexture_region` capability to the MCP tool consistent with x402 pricing.

## Done when
- A user can paint a region, type a prompt, and see only that area change — edges blend cleanly.
- Multiple sequential edits compose correctly.
- Real SDXL inpainting (no mocks), every UI state designed; CLAUDE.md followed.
