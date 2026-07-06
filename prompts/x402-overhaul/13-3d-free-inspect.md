# 13 — Free 3D API: Inspect / Validate / Optimize Report

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
An agent handling 3D assets (from any source) needs to validate a glTF/GLB and get structural
stats + optimization advice before using it: vertices, triangles, materials, textures,
animations, extensions, and a prioritized "make this smaller/faster" list. Free = adoption.

## Note on existing code
`api/x402/model-check.js` already does this for a sub-cent charge. Move the capability to a
FREE `/api/3d/inspect` (a validation utility should be free — it drives trust and funnels to
paid pipelines). Reuse its inspection logic (`_lib/glb-size-optimizer.js`,
`_lib/x402/enrich-model-metadata.js`, existing glTF validators in the repo). Add a one-line
deprecation note to the paid `model-check.js` header pointing here; leave actual retirement to
prompt 20. Stage only your new files + that one-line header edit.

## Build — `GET/POST /api/3d/inspect`
- New file `api/3d/inspect.js`, free plain-handler pattern (00-CONTEXT).
- Input: `?url=<glb/gltf url>` (GET) or `{ url }` / raw upload (POST) — match how model-check
  accepts input.
- Output: `{ url, valid, stats: { vertices, triangles, materials, textures, animations,
  extensions[] }, sizeBytes, recommendations: [{ severity, issue, fix }], ts }`.

## Catalog registration
Drop `api/_lib/3d-catalog/inspect.js` (entry shape per prompt 12 / 00-CONTEXT).

## States
Bad URL / not a model → 400 with reason. Fetch fails → 502 + retry hint. Huge file → enforce a
sane size cap with a clear message. Never 500.

## Tests
Stat extraction on a real GLB; recommendation ordering by severity; invalid-input handling.
Use a repo test GLB or a generated one.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Live call on a real GLB captured in PROGRESS.md.
- [ ] `docs/3d-api.md` section + curl + use-case.
- [ ] `data/changelog.json` (tags: `feature`,`improvement`) — "3D model inspection is now free".
