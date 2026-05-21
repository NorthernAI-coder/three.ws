# Task: Real club venue GLB + environment for /club

## Repo context

Working tree: `/workspaces/three.ws`. The `/club` page lives at
[pages/club.html](../../pages/club.html) and
[src/club.js](../../src/club.js). Today the entire venue is built from
Three.js primitives in `src/club.js:138-206`:

- A `CircleGeometry(14, 80)` floor.
- A `CircleGeometry(STAGE_RADIUS + 1.4)` dance floor inlay.
- Three `PlaneGeometry(30, 8)` walls.
- A flat `PlaneGeometry(9, 0.9)` "bar."
- Two `RingGeometry` neon rings.

No ceiling, no real bar, no crowd, no backstage door, no architectural
detail. Looks like a CAD mockup, not a club.

## Rails (CLAUDE.md — non-negotiable)

- No primitives shipped to production. No synthesized "good enough"
  art. The venue is an authored GLB or it doesn't ship.
- Real assets. No procedurally-generated stand-ins.
- No `setTimeout` fake-loading the venue. Real `GLTFLoader.loadAsync`
  with progress callback piped to the existing `setStatus` UI.
- Errors handled at boundaries — the load can throw; the page must
  surface that, not silently fall back to primitives.
- Done = `/club` loads a real authored venue, dev server confirms in
  a real browser, no console errors, `npm test` green.

## Subagent delegation

### Subagent A (Explore)

> In `/workspaces/three.ws`, return:
>
> 1. The full current scene setup in `src/club.js` — every
>    primitive being added to the scene with its file:line.
> 2. Where avatar GLBs are loaded elsewhere (e.g. `src/viewer.js`,
>    `src/agent-avatar.js`) and what loader configuration is used
>    (Draco? KTX2? Meshopt? bare `GLTFLoader`?).
> 3. Whether the repo has any existing static-GLB serving pattern
>    (R2 vs `public/`, Vite-bundled vs CDN-hosted).
> 4. `vercel.json` rules for `/public/club/` — anything special
>    about how large assets get served.
> 5. Any prior "scene environment" code we can crib from
>    (RoomEnvironment is already in use; check for HDRI loaders).

### Subagent B (Explore)

> Quote the GLB-loader configuration the rest of the app uses for
> compressed assets (Draco / KTX2 / Meshopt). Specifically, return:
>
> 1. Whether `THREE.DRACOLoader` / `KTX2Loader` / `MeshoptDecoder`
>    are wired into `GLTFLoader` anywhere.
> 2. If not, what the recommended wiring path is per
>    [prompts/finish-features/add-mesh-compression-deps.md](../finish-features/add-mesh-compression-deps.md).

Wait for both before Step 1.

## What to implement

### Step 1 — author / acquire the venue GLB

Source: Blender authored, or a CC0 / paid asset (e.g. Sketchfab CC-BY
nightclub, Quixel Megascans interior). License must be commercial-use.
Record provenance in `public/club/assets/LICENSES.md`.

Required contents of `club-venue.glb`:

- Floor with PBR varnish material (scuffed roughness map).
- Four perimeter walls with offsets for alcoves.
- Real ceiling with exposed beams, ducts, lighting truss geometry
  (the truss is where mirror-ball + spotlights will be mounted in
  prompt 04 — leave named empties `truss.mirrorball`,
  `truss.spot.01`–`truss.spot.04`).
- Bar GLB with bottles (instanced), neon backsplash, an empty named
  `bar.backsplash.neon` where prompt 04 attaches an emissive strip.
- Backstage door / curtain props on the deep wall, one per dancer
  slot. Each has a named empty `backstage.door.01`–`.04` whose
  world position becomes the dancer spawn point.
- Crowd silhouettes lining the perimeter (instanced low-poly,
  ~1.5–1.7m tall, slight idle bob via a vertex shader or a single
  shared animation clip).
- Bake AO + light maps on static geo to keep the runtime lighting
  budget for the active spotlights.

Targets:

- ≤8 MB compressed (`gltf-pipeline -i venue.glb -o club-venue.glb
  --draco.compressionLevel=10`).
- ≤4 draw calls per material category once instanced.
- Origin at the dance-floor center, +X right, +Y up, +Z forward
  (camera looks down -Z).

Save to `public/club/venue/club-venue.glb`.

### Step 2 — load + place the venue

Replace `src/club.js:138-206` (floor / walls / bar / neon rings) with:

```js
const venue = await loader.loadAsync('/club/venue/club-venue.glb');
venue.scene.traverse((n) => {
  if (n.isMesh) {
    n.receiveShadow = true;
    n.castShadow = n.userData?.castShadow === true;
  }
});
scene.add(venue.scene);
```

Stash the resolved `backstage.door.NN` and `truss.spot.NN` world
positions into the `POLES` layout array so `PoleStation` reads them
instead of computing `backstageX/backstageZ` analytically.

### Step 3 — HDRI environment

Replace the inline `RoomEnvironment` with an HDRI exr/hdr file at
`public/club/venue/club-hdri.hdr`. Use `RGBELoader` +
`PMREMGenerator.fromEquirectangular`. Keep `scene.environment` set
to the resulting texture; `scene.background` stays the dark color so
the HDRI only affects PBR reflections, not the visible sky.

### Step 4 — Draco + KTX2 wiring

If subagent B reports those loaders are not wired in this repo yet,
wire them now in a shared module (`src/loaders/gltf.js`):

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let _loader;
export function gltfLoader(renderer) {
  if (_loader) return _loader;
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('/three/draco/');
  loader.setDRACOLoader(draco);
  const ktx2 = new KTX2Loader().setTranscoderPath('/three/basis/').detectSupport(renderer);
  loader.setKTX2Loader(ktx2);
  loader.setMeshoptDecoder(MeshoptDecoder);
  _loader = loader;
  return loader;
}
```

Copy the decoder + transcoder binaries into `public/three/draco/` and
`public/three/basis/` at install time (a `postinstall` script
copying from `node_modules/three/examples/jsm/libs/{draco,basis}/`).

### Step 5 — progress + error UI

Pipe `GLTFLoader.loadAsync`'s second-arg progress event into the
existing `setStatus()` helper:

```js
loader.load(
  '/club/venue/club-venue.glb',
  resolve,
  (e) => setStatus(`Loading club… ${Math.round((e.loaded / e.total) * 100)}%`),
  reject,
);
```

On failure: surface the error in `setStatus({ kind: 'error' })` and
re-throw — `bootstrap()`'s catch handler already logs.

### Step 6 — wire pole/stage placement to venue empties

The pole props (prompt 03) ride on stage discs whose center comes from
the venue's `stage.NN` named empties. Read those during venue load
and overwrite the analytical `POLES[i].x/z` so the artist can move
poles in Blender without touching code.

### Step 7 — manual end-to-end

```bash
npm run dev
```

Visit `http://localhost:3000/club`. The venue should:

- Show the authored ceiling/walls/bar, no primitives visible.
- Place poles + stages on the stage empties.
- Have the crowd silhouettes around the perimeter idling.
- Hit ≥60 fps on desktop Chrome with shadows on.

### Step 8 — tests

`tests/club-venue-load.test.js`:

- Mock `GLTFLoader.loadAsync` to return a synthetic scene with the
  required named empties.
- Assert `bootstrap()` resolves spotlight + backstage + stage
  positions from those empties (not from the analytical fallback).
- Assert it surfaces a non-blocking error if a required empty is
  missing, naming which one.

## Definition of done

- `public/club/venue/club-venue.glb` exists with the required named
  empties + materials.
- `src/club.js` loads it, removes all primitive scene props, and
  resolves stage/pole/backstage/spot positions from the GLB.
- HDRI environment lighting in place.
- Draco/KTX2/Meshopt loaders shared across the app via
  `src/loaders/gltf.js`.
- Real-browser smoke clean, `npm test` green.

## Constraints

- Do not commit decoder binaries; copy them in via `postinstall`.
- Do not ship a 50 MB venue. Hard-cap at 8 MB compressed.
- Do not silently fall back to primitives on load failure. Surface
  the error to the user and keep the canvas blank.
