# Prompt 06 — Material, restyle & variant tools for existing 3D (new)

> Paste into a fresh Claude Code chat. Follow CLAUDE.md + `prompts/roadmap/00-README.md`. Run `npm run gate` before and after.

## Context
Forge makes models; once made, users can't easily *re-skin* or *re-style* them. Avatar Studio already has `avatar-studio-colorpicker.js`, `avatar-wardrobe.js`, `avatar-sculpt.js`, `avatar-studio-optimize.js`. Extend this idea to general GLBs: edit materials and generate stylistic variants of any model.

## Objective
New tools to transform an existing GLB without regenerating from scratch: re-texture, edit PBR materials, and produce style variants.

## Tasks (new, additive)
1. **Material editor (web + tool).** Given a GLB, expose its materials and allow editing base color, metalness, roughness, emissive, and texture swaps — live in the viewer. Reuse Avatar Studio color/optimize patterns; generalize beyond avatars. Export the edited GLB.
2. **AI re-texture / restyle.** "Make it chrome", "wooden", "cyberpunk" → generate new textures/materials for the existing geometry (preserve mesh + UVs). Use the generation stack for texture synthesis; apply to the model. Real output, real UV handling.
3. **Variant generation.** From one model, produce N controlled variants (color ways, material families, minor style shifts) for the user to pick. Seeded + reproducible (reuse prompt-02 `seed`).
4. **Material library.** A reusable PBR material/preset library users can apply with one click (extend `packages/viewer-presets/`).
5. **Non-destructive editing.** Edits produce a new asset + keep the original; track parent→child so the user can revert (this lineage also feeds prompt 09 remixing).

## Non-negotiables
- New tools/routes; do not change Avatar Studio's existing public behavior. Reuse, generalize, don't fork.
- Preserve mesh integrity and UVs through restyle — validate the output is a valid glTF.

## Verification
- Re-texture one model 3 ways and edit materials on another, live in the browser, then export valid GLBs. Screenshots + URLs to `prompts/roadmap/_generated/06/`.
- Variant generation returns N distinct, valid models from one seed set.
- Original is preserved; lineage recorded. `npm run gate` green. Changelog + `npm run build:pages`.

## Definition of done
- Working material editor + AI restyle + seeded variants + preset library, non-destructive with lineage, producing valid GLBs.

## Hand-off
Report the new tools, the lineage format (align with prompt 09), and example transforms. Commit/push only if asked; both remotes.
