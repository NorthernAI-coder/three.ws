# Prompt 07 — New input modalities into 3D: sketch, photo, multi-image, voice (new)

> Paste into a fresh Claude Code chat. Follow CLAUDE.md + `docs/roadmap/00-README.md`. Run `npm run gate` before and after.

## Context
Today most creation starts from a text prompt. More on-ramps = more people creating. The platform already has `src/avatar-face-capture.js` (face capture), `packages/vision-mcp/` (image understanding), `packages/audio-mcp/` (STT), and Forge's image input lane.

## Objective
Add new ways to start a 3D creation: a sketch, a photo, several photos, or your voice.

## Tasks (new on-ramps; reuse generation + vision + audio)
1. **Sketch → 3D.** A simple in-browser drawing canvas; the sketch becomes a Forge image-conditioned generation. Designed empty/loading/error states. Reuse `forge-prompt-studio.js` / `forge-studio` patterns.
2. **Photo → avatar.** Wire `avatar-face-capture.js` + Forge so a single selfie/photo yields a rigged avatar likeness. Privacy: process transiently, don't retain the source image beyond the request unless the user opts in; document this.
3. **Multi-image → 3D.** Accept several photos of an object from different angles → a higher-fidelity reconstruction via the multi-view path. Use `vision-mcp` to validate/normalize inputs.
4. **Voice → scene/avatar.** Use `audio-mcp` STT so a spoken description drives generation (and pairs with prompt 05 scenes). Push-to-talk in the web UI.
5. **Unified entry.** A single "Create" surface that offers text / sketch / photo / multi-image / voice, all funneling into the same generation + viewer flow. Each modality is opt-in; nothing replaces the existing text path.

## Non-negotiables
- Additive UI + new endpoints; existing Forge/text flow untouched.
- Handle PII (faces, photos) carefully at the boundary — transient by default, clear disclosure, no leaking into responses or logs.

## Verification
- Each modality produces a real 3D result in the browser: sketch→model, photo→avatar, 3 photos→object, voice→scene. Evidence to `docs/roadmap/_generated/07/`.
- Bad inputs (blank sketch, non-face photo, silent audio) hit designed error states with guidance.
- Confirm source images aren't retained beyond the request (unless opted in). `npm run gate` green. Changelog + `npm run build:pages`.

## Definition of done
- Four working new input modalities feeding the existing generation pipeline through one unified Create surface, with privacy-safe handling and designed states.

## Hand-off
Report each modality's endpoint + flow and the privacy handling. Commit/push only if asked; both remotes.
