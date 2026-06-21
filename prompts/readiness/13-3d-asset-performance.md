# 13 — 3D asset & render performance

**Phase 3. [parallel-safe]** with 12, 14.

## Where you are

`/workspaces/three.ws` — three.ws, a 3D platform. Three.js + glTF/GLB, an
animation pipeline (`public/animations/`, `scripts/build-animations.mjs`), GLB
optimization scripts (`npm run optimize:glb`, `npm run compress:glbs`), and a
universal avatar-animation system (`src/glb-canonicalize.js`,
`src/animation-retarget.js`). Read [CLAUDE.md](../../CLAUDE.md), especially the
"Avatar animation is universal — no rig allowlist" section. The only coin is
**$THREE**.

## Objective

3D loads fast and runs smoothly on mid-tier mobile GPUs: compressed/optimized
GLBs, bounded draw calls and texture memory, a steady frame rate with graceful
quality scaling, and no memory leaks across avatar swaps or scene changes.

## Why it matters

The 3D experience IS the product's wow moment — the screenshot-and-share moment
CLAUDE.md asks for. If it's a stuttering, battery-melting, slow-to-load
experience on a phone, the magic is gone. Smooth 3D on commodity hardware is a
hard moat and a core differentiator.

## Instructions

1. **Audit asset weight.** Find heavy GLBs/textures:
   ```bash
   find public -name '*.glb' -size +1M -exec ls -lah {} \; | sort -k5 -h | tail -30
   find public -name '*.png' -o -name '*.jpg' | xargs ls -lah 2>/dev/null | sort -k5 -h | tail -30
   ```
2. **Compress everything.** Run/extend `npm run optimize:glb` and
   `npm run compress:glbs`: Draco/meshopt geometry compression, KTX2/Basis
   texture compression, dedupe, prune unused nodes. Confirm the decoders are
   wired (`scripts/copy-three-decoders.mjs`). Target dramatic size cuts with no
   visible quality loss; record before/after bytes per asset.
3. **Runtime budgets.** Establish and enforce per-scene budgets: triangle count,
   draw calls, texture memory. Merge geometry/instancing where avatars/props
   repeat. Cap pixel ratio on mobile (`renderer.setPixelRatio(min(dpr, 2))`).
4. **Quality scaling.** Detect device capability and scale: shadow resolution,
   antialiasing, post-processing, animation LOD. A low-end phone should get a
   smooth simplified scene, never a 5fps full-quality one.
5. **Frame budget & loop hygiene.** Pause `requestAnimationFrame` when the canvas
   is offscreen/tab hidden. Avoid per-frame allocations. Throttle expensive
   updates. Confirm idle scenes drop to low/zero CPU.
6. **Memory leaks.** On avatar swap / scene unmount, dispose geometries,
   materials, textures, and render targets. Verify in devtools that repeated
   swaps don't grow GPU/JS memory unbounded — this is the most common Three.js
   production bug.
7. **Loading UX.** Progressive load (low-res or skeleton → full), a real progress
   indicator (no fake `setTimeout` progress — CLAUDE.md forbids it), and a
   designed fallback if a GLB fails to load.
8. **Verify on a throttled mobile profile** in devtools (CPU 4x slowdown, mobile
   GPU): measure FPS on forge preview, an agent profile, walk companion, and the
   club scene.

## Definition of done

- [ ] All shipped GLBs/textures compressed (Draco/meshopt + KTX2); before/after
      sizes recorded; decoders wired and working.
- [ ] Per-scene tri/draw-call/texture budgets defined and met; pixel ratio capped
      on mobile.
- [ ] Device-tier quality scaling implemented and verified on a low-end profile.
- [ ] rAF pauses when offscreen/hidden; no per-frame allocations in hot paths.
- [ ] No memory growth across repeated avatar/scene swaps (verified in devtools).
- [ ] Real (non-faked) progressive loading + failure fallback on every 3D surface.
- [ ] Measured FPS on forge/profile/walk/club on a throttled mobile profile,
      recorded in your report; `npm test` passes.
- [ ] Changelog: `improvement` entry ("Lighter, smoother 3D on mobile").
