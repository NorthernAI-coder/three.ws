# Prompt 03 — Embodiment: animation library, expressions, audio lipsync (additive)

> Paste into a fresh Claude Code chat. Follow CLAUDE.md + `prompts/roadmap/00-README.md`. Run `npm run gate` before and after.

## Context
Avatar animation is universal here (CLAUDE.md): `src/glb-canonicalize.js` maps arbitrary humanoid rigs to a canonical skeleton, `src/animation-retarget.js` retargets the baked clip library, driven by `src/animation-manager.js` / `animation-library.js` / `animation-state-machine.js`. `packages/audio-mcp/` already does TTS, STT, and audio-to-face lipsync. The animation build is `scripts/build-animations.mjs` over `public/animations/`.

## Objective
Make avatars feel **alive**: richer clip library, emotion/expression states, and audio-driven lipsync — all reusing existing pipelines, all backward compatible.

## Tasks (additive)
1. **Expand the clip library.** Add new baked clips (emotes: wave, nod, shrug, point, cheer; locomotion: turn, jog, sit; reactions: think, listen, celebrate) through the existing `build-animations.mjs` pipeline. Keep current clip names/IDs stable; new clips are additions. Cover new clips in tests.
2. **Expression / emotion layer.** Add a facial-expression system driven by blendshapes/morph targets when present (happy, sad, surprised, angry, neutral) with graceful fallback to bone-driven brows/mouth when a rig lacks visemes/morphs. Add an emotion → (expression + body gesture) mapping. Default state unchanged for existing consumers.
3. **Audio-driven lipsync.** Wire `audio-mcp` lipsync into the viewer: given TTS audio (or text), drive visemes in real time, synced to playback. Reuse `src/avatar-face-capture.js` patterns where relevant. Falls back to amplitude-driven jaw motion if no viseme rig.
4. **New rig conventions.** If you find any humanoid skeleton convention not yet mapped, add its bone-name mapping to `glb-canonicalize.js` with a covering case in `tests/glb-canonicalize.test.js` (per CLAUDE.md — never a curated allowlist).
5. **State machine polish.** Smooth cross-fades between idle/listen/think/speak/emote states; no T-pose pops; respect reduced-motion; dispose resources on unmount.

## Non-negotiables
- Existing clip IDs, `AnimationManager` API, and `glb-canonicalize` outputs stay backward compatible (golden tests from prompt 01 must stay green).
- A rig that can't be skeleton-driven still falls back to the default rig — never a bind-pose T-pose.

## Verification
- In a browser, load 3 different rigs (e.g. Mixamo, VRM, a simple `shoulderL` rig); each plays new emotes, shows distinct expressions, and lipsyncs to a spoken sentence. Screenshots/clip to `prompts/roadmap/_generated/03/`.
- A non-viseme rig lipsyncs via jaw fallback; a non-humanoid GLB falls back gracefully.
- No console errors/warnings. `npm run gate` green. Changelog + `npm run build:pages`.

## Definition of done
- Larger clip library, working expression layer, real audio lipsync across diverse rigs, with fallbacks and zero regressions.

## Hand-off
Report new clips, the emotion mapping, the lipsync wiring, and any new rig conventions added. Feeds the agent-embodiment work (prompt 10). Commit/push only if asked; both remotes.
