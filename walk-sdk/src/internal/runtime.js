// Shared animation runtime.
// ==========================
// The retargeting engine (AnimationManager + animation-retarget +
// glb-canonicalize) is the platform's crown-jewel rig-agnostic clip system: it
// takes the shared Mixamo/VRM-canonical clip library and replays it on ANY
// humanoid skeleton (Ready Player Me, Mixamo, VRM, custom). It is large and
// evolves with the app, so rather than vendor a copy that would silently drift,
// this SDK re-exports it from the monorepo source. The publish build
// (`build.mjs`, esbuild with `three` external) bundles it into a self-contained
// `dist/`, so npm consumers get one standalone file with nothing to resolve.
//
// PROMOTION NOTE — when this package is split into its own external repo
// (see the repo's STRUCTURE.md "Promotion path"), replace this single import
// with a vendored copy of src/animation-manager.js and its two dependencies.
// This file is the only seam that reaches back into the monorepo.

export { AnimationManager } from '../../../src/animation-manager.js';
