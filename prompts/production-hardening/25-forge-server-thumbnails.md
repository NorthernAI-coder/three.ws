# 25 · Server-side Forge thumbnails

> **Phase 4 — Frontend excellence** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
Geometry-first Forge lanes (nvidia/trellis/replicate) produce a GLB but **no `preview_image_url`**,
so the "Fresh from the Forge" gallery falls back to client-side GLB frame capture — fragile, slow
(megabytes per card), and a frequent source of blank/odd thumbnails. Generate a real thumbnail
**server-side** at creation time so every creation has a stored preview, and the client never has to
render a GLB just to show a card.

## Context (read first)
- `CLAUDE.md`.
- `api/_lib/forge-store.js` (`setPreview`, `preview_image_url`, `listShowcase` orders preview-first).
- `src/forge-showcase.js` (the Plan A→D client fallback chain — keep as a *last* resort, not the norm).
- Worker fleet that already does GLB/render work: `workers/` (e.g. `stylize`, `texture`, `remesh`, `model-*`). `sharp` and `@gltf-transform/*` are dependencies. There's an auto-rig sweep cron precedent (recent commit) for backfilling.

## Build this
1. **Render-on-create** — when a generation finishes and has a GLB but no preview, render a thumbnail server-side (headless GLB→image: a worker using a GL/offscreen renderer, or the existing render worker if one fits) and store it to R2/S3, then `setPreview`.
2. **Backfill sweep** — a cron/worker (mirror the auto-rig sweep) that finds `done` creations with `glb_url` and null `preview_image_url` and backfills thumbnails, oldest-visible-first.
3. **Consistent framing** — neutral lighting, auto-framed camera, square output, reasonable resolution (e.g. 512²), webp. Deterministic enough that thumbnails look uniform across the gallery.
4. **Client simplification** — with previews now populated, `src/forge-showcase.js` should hit Plan A (stored image) for the vast majority; keep the GLB-capture/gradient fallback only for the rare missing case.
5. **Tests** — store path sets preview correctly; backfill selects the right rows; gallery now serves previews; client fallback still works when a preview is genuinely absent.

## Files likely in play
A thumbnail render worker (`workers/forge-thumbnail/` or reuse an existing render worker), `api/_lib/forge-store.js`, the forge-completion path, a backfill cron, `src/forge-showcase.js` (simplify), tests.

## Definition of done
- [ ] New finished creations get a stored server-side `preview_image_url`.
- [ ] Backfill sweep populates previews for existing preview-less creations.
- [ ] Gallery cards render from stored previews (no GLB download needed for thumbnails).
- [ ] Client GLB-capture path remains only as a genuine last resort.
- [ ] Tests cover create-render, backfill, and gallery serving.
- [ ] Changelog: **improvement** entry ("Forge gallery thumbnails are crisp and instant").

## Guardrails
Follow CLAUDE.md. No fake/placeholder thumbnails — render the real model. Mind worker cost/scale (coordinate with prompts 30/31). Push both remotes.
