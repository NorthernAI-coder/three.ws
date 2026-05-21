# Task: Four distinct dancer GLBs for /club

## Repo context

Working tree: `/workspaces/three.ws`. Today
[src/club.js](../../src/club.js) clones a single template from
`/avatars/default.glb` four times (`src/club.js:286-316`,
`attachAvatar()`), tints each clone's emissive by pole index, and
calls it four "different" dancers. Four identical avatars in four
different lights is not four dancers.

## Rails (CLAUDE.md — non-negotiable)

- No mocks, no placeholders, no "good enough" tinting trick.
- Real authored GLBs, one per dancer slot.
- All four must share the same skeleton so the existing animation
  clips in `/animations/manifest.json` drive them without per-dancer
  retargeting at runtime.
- Done = `/club` renders four visibly distinct dancers, animations
  play on each without bone mismatch warnings, `npm test` green.

## Subagent delegation

### Subagent A (Explore)

> In `/workspaces/three.ws`, document the canonical Avaturn /
> three.ws skeleton:
>
> 1. What loader/builder authors `/avatars/default.glb`? Is it
>    Avaturn? Custom Blender rig? Quote the source.
> 2. Where is the bone name list canonicalized? (Look in
>    `src/animation-manager.js`, `scripts/build-animations.mjs`,
>    `docs/avatar-creation.md`.)
> 3. How are animation clips retargeted to it from Mixamo? Quote
>    the retarget mapping table.
> 4. Whether any other authored GLB in the repo uses the same
>    skeleton (e.g. `/avatars/cz.glb`).

### Subagent B (Explore)

> Read [docs/avaturn.md](../../docs/avaturn.md) +
> [docs/avatar-creation.md](../../docs/avatar-creation.md) and quote
> the avatar-authoring pipeline: which platform produces the GLBs,
> what blendshapes are required (for lip-sync), what the texture
> resolution targets are.

Wait for both.

## What to implement

### Step 1 — author / acquire the four dancer GLBs

Use the same pipeline that authors `/avatars/default.glb`. Each
dancer is a stylistic variant — different outfit, hair, body shape,
skin tone, accent palette — sharing the canonical skeleton.

| Slot | File | Palette | Vibe |
|---|---|---|---|
| 1 | `public/club/dancers/dancer-01.glb` | neon pink (`#ff3bd6`) | cyberpunk, neon-streak hair |
| 2 | `public/club/dancers/dancer-02.glb` | cyan (`#4ad6ff`) | latex, mirrored visor |
| 3 | `public/club/dancers/dancer-03.glb` | amber (`#ff8a3b`) | streetwear, oversized hoodie |
| 4 | `public/club/dancers/dancer-04.glb` | violet (`#9b5dff`) | goth-couture, choker |

Each GLB:

- ≤2 MB compressed via `gltf-pipeline --draco.compressionLevel=10`.
- KTX2 textures (basis-universal) for clothing albedos.
- Identical bone hierarchy + names as `/avatars/default.glb`.
- Identical blendshape names (for lip-sync compatibility, even
  though the club doesn't use them yet).
- Idle origin at feet on Y=0, facing -Z, scale 1.0.

### Step 2 — dancer registry

Create `src/club-dancers.js`:

```js
export const DANCERS = [
  {
    slot: '1',
    glb: '/club/dancers/dancer-01.glb',
    name: 'Nyx',
    bio: 'Neon-fast spin queen.',
    accent: 0xff3bd6,
    walletEvm: process.env?.CLUB_DANCER_01_EVM ?? null,
    walletSolana: process.env?.CLUB_DANCER_01_SOLANA ?? null,
  },
  // ...slots 2-4
];
```

Wallets are read at request time on the server (prompt 08) — the
browser only needs `slot/glb/name/bio/accent`. Export the registry
without secret fields.

### Step 3 — bind to PoleStation

In `src/club.js`:

1. `bootstrap()` `await Promise.all(DANCERS.map(d => loader.loadAsync(d.glb)))`.
2. Pass the resolved scene + dancer metadata into each
   `PoleStation.attachAvatar(template, animationDefs, dancer)`.
3. Drop the emissive-tinting block (`src/club.js:295-301`) — the
   GLB's own materials carry the visual identity. Keep an optional
   gentle rim-light tint via the accent color, but the dancer must
   read different even with the rim light off.

`attachAvatar(template, animationDefs, dancer)` now stores `this.dancer
= dancer` so the side-panel render shows the name + bio (Step 5).

### Step 4 — animation retarget verification

Run `npm run build:animations` (or whatever
[scripts/build-animations.mjs](../../scripts/build-animations.mjs)
exposes) against each new dancer GLB to confirm the clips bind.

If retargeting fails on any dancer (bone mismatch), do not patch the
runtime — fix the GLB. The runtime must trust the skeleton.

### Step 5 — side-panel UX

`src/club.js` `renderPoles()` (`src/club.js:519-550`) currently shows
"Pole 1 / 2 / 3 / 4." Change to show the dancer's name + bio +
small headshot:

- Pre-render a headshot PNG per dancer at build time
  (`scripts/render-dancer-headshots.mjs`) using the existing
  `api/_lib/render-glb.js` from
  [prompts/finish-features/server-side-glb-render.md](../finish-features/server-side-glb-render.md),
  output to `public/club/dancers/headshot-NN.png` 256×256.
- Right-panel card: 48×48 headshot + name + bio + tip button.

### Step 6 — manual end-to-end

```bash
npm run dev
```

Visit `/club`. The four dancers should be visibly distinct on stage
(zoomed out and zoomed in). Tipping any dancer should still play the
chosen clip without console errors.

### Step 7 — tests

`tests/club-dancers.test.js`:

- Assert `DANCERS` exports four slots with distinct GLB URLs.
- Mock `GLTFLoader.loadAsync` to return scenes with matching bone
  names; assert `PoleStation.attachAvatar` runs without throwing.
- Add a fixture GLB with mismatched bones; assert the load throws
  with a clear `clip_skeleton_mismatch` error code.

## Definition of done

- Four authored `public/club/dancers/dancer-0N.glb` files exist,
  each ≤2 MB compressed.
- `src/club-dancers.js` registry exports the four slots.
- `PoleStation` uses per-slot GLB; the emissive-tint stand-in is
  removed.
- Right-panel cards show name + bio + headshot.
- All existing dance clips play on every dancer with no skeleton
  warnings.

## Constraints

- Do not procedurally tint the same GLB four ways and call it done.
- Do not ship a dancer GLB whose bones don't match the canonical
  skeleton — fix the GLB, not the retarget.
- Do not bake dancer wallets into the client bundle. Server only.
