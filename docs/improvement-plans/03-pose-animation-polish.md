# Task: Level up the pose studio + animation retarget

You are a senior 3D/graphics engineer on three.ws. Follow `CLAUDE.md` (auto-loaded).
Non-negotiables: $THREE is the only coin; no mocks/placeholders; real assets/APIs;
every state designed; add tests; changelog for user-visible changes; don't break
the architecture.

## Why this matters

A generated avatar is just a mesh until it moves. Our differentiation is the
universal rig + animation system — any humanoid avatar drives the pre-baked clip
library. Making posing and animation richer and more reliable is what turns a
"cool mesh" into something people actually use and share.

## What exists today — read these first

- Pose studio: [src/pose-studio.js](../../src/pose-studio.js), `src/pose-mannequin.js`,
  `src/pose-rig.js`, `src/pose-library.js`, `src/pose-presets.js`,
  `src/pose-animation.js`, `src/pose-share.js`. Mannequin route: `/pose`.
- Canonicalization + retarget (the universal-rig core, per `CLAUDE.md`):
  [src/glb-canonicalize.js](../../src/glb-canonicalize.js),
  [src/animation-retarget.js](../../src/animation-retarget.js),
  `src/animation-manager.js`, `src/animation-library.js`,
  `src/animation-state-machine.js`. Tests: `tests/glb-canonicalize.test.js`.
- Pose seed MCP tool exists (deterministic preset → joint rotations).

## Goal

More expressive posing and animation with broader rig coverage, cleaner export, and
all the polish states — without regressing any currently-supported rig.

## Scope (pick the subset that fits one focused session; do them well)

1. **Rig coverage.** Add at least one new skeleton-convention mapping to
   `glb-canonicalize.js` (e.g. a convention not yet covered) with a matching case in
   `tests/glb-canonicalize.test.js`. Never hardcode a curated rig allowlist — extend
   the bone-name mapping. Confirm legs included, no T-pose fallback for valid humanoids.
2. **Pose library.** Add new, genuinely useful preset poses (sit, point, cheer, think,
   etc.) with correct full joint rotations, wired into `pose-presets.js` and the
   pose-seed flow so they're reachable from both the UI and the MCP tool.
3. **Animation export.** Let the user export a posed/animated avatar as a GLB that
   plays back correctly elsewhere (verify the exported clip plays in the viewer).
   Real export, real file — no placeholder download.
4. **Studio states.** Loading skeleton while the rig loads, empty state guiding a
   first pose, error state if a mesh can't be rigged (with the documented graceful
   fallback to the default rig, not a broken T-pose), responsive + keyboard-navigable.

## Guardrails

- Do not regress any rig currently passing `tests/glb-canonicalize.test.js`.
- Reuse the canonical clip library; don't fork a parallel animation path.
- Keep the `supportsCanonicalClips()` gate semantics intact for non-humanoid props.

## Definition of done

- [ ] New rig mapping + test; full canonicalize suite green.
- [ ] New poses reachable from the studio UI and the pose-seed tool, with correct joints.
- [ ] Posed/animated GLB export verified to play back in the viewer.
- [ ] Studio loading/empty/error states designed; keyboard + responsive.
- [ ] `npm test` green.
- [ ] `data/changelog.json` entry; `npm run build:pages` passes.
