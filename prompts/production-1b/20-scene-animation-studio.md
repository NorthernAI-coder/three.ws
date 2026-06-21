# 20 — Scene Studio & Animation Studio

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

Creators don't just want an avatar — they want to *stage* it and *make it move*. Scene
Studio (import GLBs, compose a scene, edit materials/lights, export) and Animation
Studio (pose with IK, keyframe a timeline, export an animated GLB you can sell) are
the surfaces that turn three.ws from a generator into a creation tool — the moment a
user makes something they own and can list for USDC. A pro-grade editor that imports
cleanly, never loses work, and exports a sellable artifact is what makes three.ws a
platform creators return to, not a one-shot toy.

## Mission

Make Scene Studio and Animation Studio production-grade: clean GLB import, real
material/light editing, IK posing and a keyframe timeline that exports a valid
animated GLB, every state designed, and a working path from "animate" to "list for
sale" — all on the universal canonical-rig pipeline.

## Map (trust but verify — files move)

- **Scene Studio (`/scene`)** — [pages/scene.html](../../pages/scene.html) (host page),
  [src/scene-studio/main.js](../../src/scene-studio/main.js) (entry, mounts the editor),
  [src/scene-studio/studio.css](../../src/scene-studio/studio.css) (chrome).
  Vendored three.js r184 editor under [src/scene-studio/vendor/](../../src/scene-studio/vendor)
  — read [src/scene-studio/vendor/README.md](../../src/scene-studio/vendor/README.md)
  for the re-vendoring rules and local mods. Static decoder/lib assets ship under
  `public/scene-studio/` (draco, basis, libs, fonts, images).
- **Animation Studio (`/pose`)** — [pages/pose.html](../../pages/pose.html) (host),
  [src/pose-studio.js](../../src/pose-studio.js) (controller: FK gizmos, IK drag,
  timeline, export UI), [src/pose-animation.js](../../src/pose-animation.js) (keyframe
  document + interpolation, bakes `THREE.AnimationClip`), [src/pose-rig.js](../../src/pose-rig.js)
  (rig abstraction + `solveIK()` / `IK_CHAINS`), [src/pose-presets.js](../../src/pose-presets.js).
- **Animation data** — [public/animations/manifest.json](../../public/animations/manifest.json)
  (clip index), [public/animations/clips/](../../public/animations/clips) (retargeted
  JSON clips). Build pipeline: [scripts/build-animations.mjs](../../scripts/build-animations.mjs)
  (Mixamo FBX → retarget → canonical clips), [scripts/fbx-to-glb.mjs](../../scripts/fbx-to-glb.mjs).
- **Animation gallery + selling** — [pages/animations.html](../../pages/animations.html),
  [src/animations-gallery.js](../../src/animations-gallery.js),
  [api/animations/sell.js](../../api/animations/sell.js) (list/delist for sale),
  [api/animations/clips.js](../../api/animations/clips.js) (save/list clips),
  [api/animations/presign.js](../../api/animations/presign.js) (R2 upload),
  [api/x402/animation-download.js](../../api/x402/animation-download.js) (paid download).
- **Universal rig pipeline (the spine of both)** — [src/glb-canonicalize.js](../../src/glb-canonicalize.js)
  (bone-name + up-axis normalization on import), [src/animation-retarget.js](../../src/animation-retarget.js)
  (rebind canonical clips onto any rig).
- **Tests** — [tests/pose-animation.test.js](../../tests/pose-animation.test.js),
  [tests/animation-upright-invariant.test.js](../../tests/animation-upright-invariant.test.js),
  [tests/glb-canonicalize.test.js](../../tests/glb-canonicalize.test.js),
  [tests/animation-retarget.test.js](../../tests/animation-retarget.test.js).

## Do this

1. **Exercise Scene Studio in a real browser** (`npm run dev`): open `/scene`, import a
   GLB (Add → Model), select a mesh, edit a material (color/metalness/roughness) and a
   light, then export the scene as GLB. Re-import the exported file to prove it round-trips
   (meshes, materials, lights survive). Watch console/Network — zero errors/warnings.
2. **Exercise Animation Studio in a real browser:** open `/pose`, load the built-in
   mannequin and a user avatar GLB, pose with FK gizmos and IK drag (grab a hand/foot,
   confirm the chain solves), add timeline keyframes, scrub, then export an animated
   GLB. Re-open the exported GLB in the viewer to confirm it plays.
3. **Import is bulletproof.** Every imported GLB runs through
   [src/glb-canonicalize.js](../../src/glb-canonicalize.js) so arbitrary skeletons
   (Mixamo/Avaturn/VRM/Daz/Blender, etc.) normalize to the canonical set. A humanoid
   that won't pose/retarget is a bone-name gap — extend `glb-canonicalize.js` and add a
   `tests/glb-canonicalize.test.js` case. Never hardcode a rig allowlist; a genuinely
   non-humanoid prop falls back gracefully, not to a broken editor.
4. **Every state designed** for both studios: loading (skeleton/progress on GLB load,
   real bytes not a fake bar), empty (no model yet → "import a GLB to start" with a
   sample), error (bad/corrupt file → actionable message, not a stack trace), and
   overflow (large scene/long timeline stays responsive). Mask any vendor/decoder error.
5. **No lost work.** Confirm the timeline and scene state survive a tab refresh
   (autosave/local persistence) or, if not present, add it. Warn on unload with unsaved
   changes. Undo/redo must work for pose + scene edits.
6. **Export quality.** The exported animated GLB must have a valid `AnimationClip` with
   canonical bone tracks, play upright (no flipped/tilted root — see
   `animation-upright-invariant.test.js`), and carry a real name. The scene export must
   be self-contained (embedded textures/materials/lights).
7. **"Animate → sell" path works end-to-end.** From Animation Studio, save the clip
   ([api/animations/clips.js]), presign + upload the artifact ([api/animations/presign.js]),
   list it for sale ([api/animations/sell.js]) with a USDC price, and confirm it shows
   in the gallery ([pages/animations.html]) with a working preview and an x402 paid
   download ([api/x402/animation-download.js]). No mocks — real R2 + real listing.
8. **Performance & accessibility.** Lazy-load heavy editor modules and decoders; pause
   the render loop when the tab is hidden; keyboard shortcuts for play/pause/keyframe;
   ARIA on timeline controls; `prefers-reduced-motion` respected in previews.
9. **Run the tests:** `npx vitest run tests/pose-animation.test.js
   tests/animation-upright-invariant.test.js tests/glb-canonicalize.test.js
   tests/animation-retarget.test.js`. Cover any failure mode you fixed (bad-GLB import,
   export of an unrigged mesh, IK chain with a missing bone).
10. Add a `data/changelog.json` entry for any user-visible change and run
    `npm run build:pages`.

## Must-not

- Do not hardcode a rig allowlist — extend `glb-canonicalize.js` for new skeletons so
  IK/posing/export work on any humanoid.
- Do not edit the vendored three.js editor upstream files without recording the change
  per `src/scene-studio/vendor/README.md` (the re-vendor must stay reproducible).
- Do not ship a fake progress bar, an export that produces an invalid/upright-flipped
  GLB, or a "sell" flow backed by mocks.
- Do not let a corrupt import or decoder failure surface a raw stack trace or vendor URL.
- Do not reference any coin other than `$THREE` (prices/payments are USDC; never name
  another token).

## Acceptance (all true before claiming done)

- [ ] Scene Studio imports a GLB, edits a material + light, exports a self-contained
      scene GLB that round-trips on re-import — no console errors/warnings.
- [ ] Animation Studio poses with FK + IK, keyframes a timeline, and exports a valid
      animated GLB that plays upright in the viewer.
- [ ] Arbitrary skeletons normalize via `glb-canonicalize.js`; any new convention added
      with a test case; no rig allowlist, no unjustified T-pose.
- [ ] Loading/empty/error/overflow states designed in both studios; vendor/decoder
      errors masked; no fake progress bars.
- [ ] Unsaved-work protection (autosave or unload warning) and undo/redo work.
- [ ] "Animate → save → upload → list for sale → gallery → x402 download" works
      end-to-end with real R2 and real listings.
- [ ] Listed tests pass; new failure modes covered.
- [ ] Changelog updated and `npm run build:pages` is clean.
