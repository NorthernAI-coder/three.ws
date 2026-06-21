# D01 — Avatar pipeline reliability (forge → auto-rig → animate) hardening

> Phase D · Depends on: none (foundational for B05, C04, D2–D4) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
The whole 3D product rests on one pipeline: generate a mesh → auto-rig it → retarget the
animation library onto it → render it everywhere. CLAUDE.md mandates universal animation
(no rig allowlist). When any stage silently fails, avatars T-pose, animations break, and
the magic dies. Make the pipeline observably reliable end-to-end.

## Where this lives (real files)
- `src/glb-canonicalize.js` — maps diverse rig bone names (Mixamo, Avaturn, Unreal, VRM/VRoid, Daz, MakeHuman, Blender `.L`, etc.) to the canonical set.
- `src/animation-retarget.js` — retargets idle/walk onto canonicalized rigs; `AnimationManager.supportsCanonicalClips()` gate.
- `tests/glb-canonicalize.test.js` — bone-mapping coverage.
- `api/_lib/auto-rig.js`, `api/cron/auto-rig-sweep.js` — auto-rig + backfill sweep.
- Workers: `workers/unirig`, `workers/model-*`, `workers/remesh`, `workers/rembg`, etc.

## Current state & gaps
- New skeleton conventions can slip through to a bind-pose T-pose instead of falling back to the default rig; auto-rig failures need clear surfacing + retry; the auto-rig sweep should backfill static avatars; `auto-rig.js` fetches user URLs without SSRF validation (overlaps E08).

## Build this
1. **No silent T-pose:** guarantee a rig that genuinely can't be skeleton-driven falls back to the default rig via `supportsCanonicalClips()` — never a bind-pose T-pose. Add a diagnostic that flags any avatar rendering un-animated.
2. **Bone-map coverage:** add a fixture-backed test for every supported convention in `glb-canonicalize.js`; when a new convention appears, the path to add a mapping (+ test case) is documented and easy.
3. **Auto-rig reliability:** surface rig job status (queued/running/failed) to the user with retry; the sweep cron backfills un-rigged static avatars and reports counts; alert on sustained failures.
4. **Worker health:** each generation/rig worker reports health; failures propagate to `forge-health.js` + ops, not just local logs.
5. **SSRF guard:** validate every user-supplied model URL (https only, no localhost/private ranges) before fetch (coordinate with **E08**).
6. **Golden tests:** a small set of real GLBs across conventions retarget correctly (legs included) in CI.

## Out of scope
- The Forge UI (**B05**) — this is the pipeline beneath it.

## Definition of done
- [ ] No avatar ever T-poses: unsupported rigs fall back to the default rig, proven by a test + a runtime diagnostic.
- [ ] Every bone convention in `glb-canonicalize.js` has a test case; golden GLBs retarget correctly in CI.
- [ ] Auto-rig status + retry surfaced; sweep backfills + reports; worker health propagates to ops.
- [ ] User model URLs SSRF-validated; `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Feed avatars from ≥3 rig conventions → all animate (legs included); feed a non-humanoid prop → default-rig fallback, not T-pose; fail a rig job → status + retry shown.
