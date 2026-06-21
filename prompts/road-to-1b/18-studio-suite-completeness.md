# 18 — Studio suite completeness (Forge, Avatar, Animation, Scene)

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Surface completeness
**Owns:** `pages/forge.html`+`src/forge.js`+`api/forge.js`, `pages/avatar-studio.html`+`character-studio/`, the Animation Studio surface + `src/animation-retarget.js`/`src/glb-canonicalize.js`, `src/scene-studio/`.
**Depends on:** Phase 0–1.  ·  **Parallel-safe with:** 19–24.

## Why this matters for $1B
The creation tools are the product's beating heart — "give your AI a body." If Forge,
Avatar Studio, Animation Studio, or Scene Studio feel half-finished, nothing downstream
matters. These are the screenshot-and-share surfaces.

## Mission
Take every Studio to a demo-to-senior-engineers bar: real generation, every state
designed, exports that work, and a clean path in and out.

## Do this
1. **Forge** (`src/forge.js`, `api/forge.js`): verify the full engine matrix and the
   NVIDIA → Hugging Face → Replicate fallback; designed unconfigured/busy/error states;
   real progress (no fake timers); GLB export, AR, download, and "Remix" all work.
2. **Avatar Studio** (`character-studio/`, `pages/avatar-studio.html`): sculpt → export
   GLB end to end; selfie-to-avatar and prompt-to-avatar paths produce rigged output.
3. **Animation Studio**: IK posing + timeline keyframing → animated GLB; confirm the
   universal retarget (`src/glb-canonicalize.js`, `src/animation-retarget.js`) drives
   any humanoid rig, with the default-rig fallback gate, never a bind-pose T-pose.
4. **Scene Studio** (`src/scene-studio/` → `/scene`): import GLBs, edit materials/lights,
   export; verify save/load.
5. For all four: empty/loading/error states, mobile/touch usability (links to 14), and
   that every output is saved to the user's creations and reachable later.

## Must-not
- No fake progress, no stub exports, no engine button that silently does nothing.
- Do not narrow the animation rig support to an allowlist — fix the bone mapping instead.

## Acceptance
- [ ] Each Studio completes its core flow with real output, exercised in a browser.
- [ ] All states designed; exports (GLB/AR/download) verified; outputs persist.
- [ ] `npm test` (incl. `tests/glb-canonicalize.test.js`) green; changelog entry per Studio improved.
