# Task 06 — Memory, GPU resource, and context-loss hygiene

**Phase:** 1 (AR correctness) · **Effort:** M · **Files:** `src/irl.js`, `src/irl/load-queue.js`

## Why
IRL is a long-lived single-page session: users swap avatars, walk through dense
pin areas, and leave the tab backgrounded. Three.js does not auto-free GPU
resources — every undisposed geometry/material/texture/render-target is a leak
that eventually crashes the WebGL context on mobile. A production AR app must run
for an hour without degrading.

## Read first (verify before fixing)
- Avatar (re)load + clear — `src/irl.js:742-770` (`loadAvatar`, `_clearAvatar`, mixer handling)
- Pin disposal — `src/irl.js:~1896-1905` (`disposePin`, `disposeObject3D`)
- Impostor render targets — `src/irl.js:~2250-2260` (creation) + disposal site
- Load queue + cancel — `src/irl/load-queue.js` (priority pump, `cancel()`)
- LOD/eviction — `enforceLOD()` `src/irl.js:~3448-3550`
- Renderer creation — `src/irl.js:150-158` (single WebGL context, per memory `irl-perf-e2`)

## Scope — confirm, then fix

1. **Animation mixer leak on avatar swap.** On hot-swap, confirm the old mixer is
   stopped (`stopAllAction()` / `uncacheRoot`) and detached before the new model
   loads, and that a **failed** load leaves the manager in a clean state (not a
   nulled mixer with orphaned clips). Fix any dangling references.

2. **Impostor render-target / texture disposal order.** Before disposing a pin's
   `_impostorRT`, null the sprite material's texture reference so no live material
   points at a freed texture. Dispose RT + texture + sprite material/geometry.

3. **Cancel in-flight loads on large distance jumps.** When a pin's live camera
   distance jumps far (teleport, unlock snap, walking past), cancel its queued/
   in-flight GLB load so a now-distant pin doesn't hold a slot ahead of the nearest
   one. Use the queue's `cancel()` hook from `enforceLOD()`.

4. **WebGL context-loss recovery.** Add `webglcontextlost`/`webglcontextrestored`
   handlers: preventDefault on loss, pause the tick, and on restore rebuild what's
   needed (or show a designed "tap to reload AR" recovery state). Today a context
   loss likely leaves a black canvas with no recovery.

5. **Backgrounded-tab throttling.** On `visibilitychange` to hidden, pause the RAF /
   stop the camera track to save battery and avoid sensor churn; resume cleanly on
   return. Confirm no leak across pause/resume cycles.

## Implementation guidance
- There is an existing DEV harness (`__irlSeedPins(30)`, `__irlPerf()` per memory
  `irl-perf-e2`). Use it to drive churn and watch `renderer.info.memory`
  (geometries/textures) across repeated swaps + seed/clear cycles — counts must
  return to baseline, not climb.

## Out of scope
The LOD band tuning itself (shipped); adding new visual effects.

## Definition of done
- [ ] Repeated avatar swaps and `__irlSeedPins`/clear cycles return
      `renderer.info.memory` to baseline (no monotonic growth) — paste the numbers.
- [ ] Impostor RTs/textures provably disposed; no console GL warnings.
- [ ] Context loss recovers (or shows a designed recovery), never a silent black canvas.
- [ ] Backgrounding pauses/resumes cleanly with no leak.
- [ ] esbuild clean; `npm test` green; changelog entry if user-visible (e.g. "AR runs
      stably in long sessions").

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-production/06-memory-gpu-hygiene.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
