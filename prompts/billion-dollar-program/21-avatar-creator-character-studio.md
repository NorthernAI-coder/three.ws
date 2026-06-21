# 21 — Avatar creator / Character Studio / Selfie→avatar

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

"Make *me* a 3D avatar" is the most personal thing a user does on three.ws — sculpt a
character from scratch, turn a selfie into a rigged avatar, or describe one in words —
and it's the asset they carry into Walk, Worlds, the marketplace, and their agent
profile. If the creator is clumsy, the selfie pipeline dead-ends, or the result lands
as a frozen T-pose, the user never gets to the "wow, that's me, and it moves"
screenshot that drives sharing. This surface must feel like a real character creator
and always produce a rigged avatar that animates.

## Mission

Make the three avatar-creation paths — Character Studio (sculpt face+body), selfie→avatar,
and prompt→avatar — correct, resilient, and beautifully stated, each producing a
canonical-rigged GLB the user can export and publish to the gallery, all on the
universal rig pipeline (no allowlist).

## Map (trust but verify — files move)

- **Character Studio (full builder)** — [character-studio/](../../character-studio)
  (React/Vite app, MIT fork of m3-org/CharacterStudio — see
  [character-studio/LICENSE](../../character-studio/LICENSE)).
  [character-studio/package.json](../../character-studio/package.json) (`@m3-org/characterstudio`,
  builds to `/avatar-studio/` base), [character-studio/index.html](../../character-studio/index.html).
  Sculpting/body engine under `character-studio/src/library/` (e.g.
  `characterManager.js`, `VRMExporter*.js`). Wrapper page that iframes the studio:
  [pages/avatar-studio.html](../../pages/avatar-studio.html). Routes: `/avatar-studio`,
  `/create/studio` → `avatar-studio.html` (see [vercel.json](../../vercel.json)).
- **Avatar SDK (`@three-ws/avatar`)** — [avatar-sdk/package.json](../../avatar-sdk/package.json)
  (web component `<agent-3d>`; `./creator`, `./viewer`, `./react` subpaths),
  [avatar-sdk/src/creator.js](../../avatar-sdk/src/creator.js) (modal iframe controller +
  presigned upload), [avatar-sdk/src/viewer.js](../../avatar-sdk/src/viewer.js),
  [avatar-sdk/README.md](../../avatar-sdk/README.md).
- **Selfie→avatar / prompt→avatar (UI)** — [pages/create-selfie.html](../../pages/create-selfie.html)
  (`/create/selfie`), [src/selfie-pipeline.js](../../src/selfie-pipeline.js),
  [src/selfie-capture.js](../../src/selfie-capture.js); [pages/create-prompt.html](../../pages/create-prompt.html)
  (`/create/prompt`), [src/create-prompt.js](../../src/create-prompt.js).
- **Reconstruct + auto-rig (backend)** — [api/avatars/_actions.js](../../api/avatars/_actions.js)
  (`reconstruct`, `upload`, `upload-proxy`), [api/avatars/index.js](../../api/avatars/index.js)
  (list/create metadata), [api/avatars/from-forge.js](../../api/avatars/from-forge.js),
  [api/_lib/reconstruct-finalize.js](../../api/_lib/reconstruct-finalize.js) (shared
  tail: canonicalize → rig gate → materialize), [api/_lib/auto-rig.js](../../api/_lib/auto-rig.js),
  [api/_lib/regen-provider.js](../../api/_lib/regen-provider.js).
- **Gallery (publish target)** — [public/gallery/index.html](../../public/gallery/index.html),
  [public/gallery/gallery.js](../../public/gallery/gallery.js),
  [pages/gallery-picker.html](../../pages/gallery-picker.html).
- **Universal rig pipeline (must respect)** — [src/glb-canonicalize.js](../../src/glb-canonicalize.js)
  (bone-name + up-axis normalize at ingest), [src/animation-retarget.js](../../src/animation-retarget.js),
  gate in [src/animation-manager.js](../../src/animation-manager.js)
  (`supportsCanonicalClips()`).
- **Tests** — [tests/api/reconstruct-finalize.test.js](../../tests/api/reconstruct-finalize.test.js),
  [tests/api/avatars-from-forge.test.js](../../tests/api/avatars-from-forge.test.js),
  [tests/glb-canonicalize.test.js](../../tests/glb-canonicalize.test.js).

## Do this

1. **Exercise all three creation paths in a real browser** (`npm run dev`): Character
   Studio at `/avatar-studio` (sculpt a face, adjust body, change an outfit, export
   GLB); `/create/selfie` (capture/upload a photo → rigged avatar); `/create/prompt`
   (describe an avatar → rigged avatar). Watch console/Network — zero errors/warnings.
2. **Every result is canonical-rigged and animates.** Confirm `reconstruct-finalize.js`
   canonicalizes every GLB and the auto-rig gate ([api/_lib/auto-rig.js]) produces a
   skeleton that drives idle/walk (legs included). A humanoid that lands T-posed is a
   bug — fix the bone map in `glb-canonicalize.js` (+ a `tests/glb-canonicalize.test.js`
   case), never hardcode a rig allowlist. Only a genuinely non-humanoid mesh may fall
   back to the default rig via `supportsCanonicalClips()`.
3. **No provider internals reach the user.** Audit every error path in
   [api/avatars/_actions.js], [api/_lib/reconstruct-finalize.js],
   [api/_lib/regen-provider.js], and the selfie/prompt UIs: provider quota/billing,
   raw stack traces, vendor URLs, NSFW/no-face/OOM responses must become neutral,
   actionable copy. Keep raw detail in server logs only.
4. **Every phase is designed.** Selfie capture (camera permission prompt, face-not-found
   hint, retake), reconstruct, and rig each show a live label + real elapsed time +
   progress affordance (not a fake `setTimeout` bar). Empty state tells the user what to
   do; error state says how to recover; Character Studio loading uses a skeleton, not a
   blank canvas.
5. **Resilience.** A hung/throttled provider must time out and either retry or hand off
   (reuse the existing `regen-provider` chain / cockatiel helper), never stall a spinner
   forever. Verify the cascade and add cover for uncovered failure modes (402/429/
   timeout/NSFW/no-face/OOM/unconfigured).
6. **Export + publish path works end-to-end.** From any creation path, export the GLB
   and publish it to the gallery: confirm the avatar appears in
   [public/gallery/index.html](../../public/gallery/index.html) with the correct
   `visibility`, a real thumbnail (not a 1px snapshot), correct rigged/static tagging,
   and an owner-scoped storage key (you can't claim someone else's GLB).
7. **Right input → right path.** Make affordances obvious so a "humanoid" prompt goes
   to the avatar flow (not a box on a non-humanoid pipeline), and the selfie flow guides
   the user to a clear, face-forward photo.
8. **Accessibility, mobile, performance.** Camera/selfie flow works on mobile (320px),
   ARIA on creator controls and the picker, keyboard navigation, lazy-load the heavy
   `<agent-3d>` runtime and Character Studio bundle, and respect `prefers-reduced-motion`
   in previews. Confirm Character Studio's iframe wrapper sizing is responsive.
9. **Run the tests:** `npx vitest run tests/api/reconstruct-finalize.test.js
   tests/api/avatars-from-forge.test.js tests/glb-canonicalize.test.js`. Add cover for
   any failure mode or new bone mapping you fixed.
10. Add a `data/changelog.json` entry for any user-visible change and run
    `npm run build:pages`.

## Must-not

- Do not hardcode a rig allowlist — extend `glb-canonicalize.js` bone maps so every
  humanoid animates; never ship a bind-pose T-pose for a riggable humanoid.
- Do not surface any provider's billing page, credit balance, quota, or raw error to the
  user — mask to neutral, actionable copy.
- Do not ship a fake progress bar, a spinner with no timeout, or a "publish" backed by
  mocks/sample arrays.
- Do not let a user claim or overwrite another user's avatar/storage key.
- Do not reference any coin other than `$THREE` in copy, metadata, or sample data.

## Acceptance (all true before claiming done)

- [ ] Character Studio (sculpt), selfie→avatar, and prompt→avatar all complete in a real
      browser with no console errors/warnings; each exports a GLB.
- [ ] Every produced humanoid is canonical-rigged and animates (no unjustified T-pose);
      any new skeleton convention added to `glb-canonicalize.js` with a test case.
- [ ] Every failure mode (402/429/timeout/NSFW/no-face/OOM/unconfigured) yields a
      neutral, actionable message — no vendor internals, verified by tests.
- [ ] Loading/empty/error states designed for all three paths; elapsed time is real; no
      fake progress bars.
- [ ] Export → publish-to-gallery works with a real thumbnail, correct visibility +
      rigged/static tag, and owner-scoped storage.
- [ ] Mobile (320px) selfie flow, ARIA/keyboard support, and lazy-loading verified.
- [ ] Listed tests pass; new failure modes covered.
- [ ] Changelog updated and `npm run build:pages` is clean.
