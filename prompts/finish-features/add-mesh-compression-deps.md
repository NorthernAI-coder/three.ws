# Task: Add `meshoptimizer` + `draco3d` to the GLB bake pipeline

## Repo context

Working tree: `/workspaces/three.ws`. The bake pipeline at
`api/_lib/bake.js` already runs a `weld + quantize + textureCompress`
compression pass on every baked avatar GLB (see `docs/internal/
PROGRESS.md` item 1). That ships an ~5-10× reduction over the
uncompressed source. The pipeline could do another 2-3× by adding the
`meshopt()` and `draco()` transforms from `@gltf-transform/functions`
— but those transforms require the optional peer dependencies
`meshoptimizer` and `draco3d`, which are not currently installed
(~5 MB combined).

`docs/internal/NEXT.md` documents the deferred decision.

## Rails (CLAUDE.md — non-negotiable)

- No mocks. No fake data. No placeholders.
- Real APIs only — the compression must actually decode in the
  browser, which means we must verify the in-browser GLTFLoader has
  the matching decoders wired.
- Done = baked GLBs are 2-3× smaller than the current baseline, every
  avatar still renders correctly in the viewer, `npm test` green.
- Push to both remotes only when the user says push.

## What to implement

### Step 1 — install the deps

```bash
npm install meshoptimizer draco3d
```

These go into runtime `dependencies` because they are used by the
serverless bake function at request time. (`@gltf-transform/
functions` is already in `package.json`.)

### Step 2 — wire `meshopt()` and `draco()` into `api/_lib/bake.js`

Read the existing transform chain:

```bash
cat api/_lib/bake.js | head -200
```

The current pass (per `docs/internal/PROGRESS.md` item 1):

```js
await doc.transform(
  weld(),
  quantize({ ... }),
  textureCompress({ encoder: sharp, ... }),
);
```

Add the meshopt + draco transforms. Order matters:

```js
import { MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3d';

await MeshoptEncoder.ready;

await doc.transform(
  weld(),
  quantize({ /* same as before */ }),
  // EXT_meshopt_compression — fast browser decode, ~2× extra reduction
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  textureCompress({ encoder: sharp, ... }),
);
```

`draco3d` is for `KHR_draco_mesh_compression`, which yields a bit
more reduction than meshopt but decodes slower in the browser. **Pick
one, not both.** Meshopt is the right call for avatars (small, many,
decoded on page load) — draco is better for large static models.

Use meshopt only. Keep the `draco3d` install for now because gltf-
transform may transitively require it; but do not add a `draco()`
transform to the chain. If after install `npm ls draco3d` shows it
is unused, `npm uninstall draco3d` in the same diff.

### Step 3 — preserve the fallback

The existing pipeline has a try/catch fallback to a minimal
`unpartition + prune + dedup` chain for pathological inputs. Keep it.
If the new meshopt pass throws on some weird input, the fallback path
saves the bake. Do not remove safety nets to chase max compression.

### Step 4 — verify browser decoders are wired

The in-app viewer (`src/viewer/internal.js` or wherever
`getDecoders()` lives) must register the MeshoptDecoder:

```js
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
```

`docs/internal/PROGRESS.md` notes the main viewer already has this.
Confirm by reading the file. If the marketplace lobby viewer
(`src/marketplace-lobby.js`) does **not** have it, add it — otherwise
meshopt-compressed avatars will fail to load there.

### Step 5 — run the existing tests

```bash
npm test -- tests/avatar-bake.test.js
```

These 9 tests assert correctness invariants (morph weights baked,
accessory parented to bone, hash stability, etc.). They should all
still pass — meshopt is transparent to those guarantees. If any fail,
the compression broke a structural invariant; fix the transform
parameters until they all pass.

### Step 6 — measure size change

`scripts/measure-bake-size.mjs` (create if it does not exist).
Reads a known avatar from R2 (or `tests/fixtures/`), bakes it once
**before** the new transforms (via `git stash` of just this change,
or a copy of the old function), and **after**. Reports both sizes
and the ratio.

If the after/before ratio is worse than 0.6 (i.e. less than 40%
reduction), something is wrong — meshopt should yield 30-50%
reduction on top of the existing pipeline for typical avatars.

If the script existed before this task, just extend it. Do not
duplicate.

### Step 7 — manual browser smoke

```bash
npm run dev
```

Open the avatar customizer, load an existing avatar, Save (triggers
a re-bake), then reload the page from a clean browser cache and
confirm:

1. Network tab shows the baked GLB is meaningfully smaller than
   before.
2. The avatar renders with no console errors.
3. Morph targets still work (facial expressions visibly change when
   the agent-avatar empathy layer activates).
4. Animations still play.

Also check the marketplace lobby route — that viewer was flagged in
`docs/internal/PROGRESS.md` as historically lacking decoders. Verify
it loads meshopt-compressed avatars correctly.

### Step 8 — clean up `docs/internal/NEXT.md`

Remove the "meshoptimizer / draco3d peer deps" section. Add a line
under `docs/internal/PROGRESS.md` describing the new compression
ratio measured in Step 6.

## Definition of done

- `meshoptimizer` is in `dependencies`.
- `draco3d` is in `dependencies` only if something transitively
  requires it; otherwise uninstalled.
- `api/_lib/bake.js` applies `meshopt()` after `quantize()` and
  before `textureCompress()`.
- The fallback path is preserved.
- Browser-side decoder is registered in every viewer that loads
  baked avatars.
- `tests/avatar-bake.test.js` (all 9 tests) still passes.
- A measurement script shows 30-50% additional size reduction on a
  reference avatar.
- Manual browser smoke confirms no rendering regression.
- `docs/internal/NEXT.md` no longer lists this as deferred.

## Constraints

- Do not enable `KHR_draco_mesh_compression` (`draco()`) — it decodes
  slower in the browser and the meshopt path is already a clear win.
- Do not raise meshopt `level` above `'medium'`. `'high'` increases
  bake time substantially with marginal extra reduction.
- Do not change the bake API surface (function signatures, R2 key
  layout). This is internal pipeline only.
- If meshopt breaks for a specific avatar, **fix the input** or
  **tune the transform** — do not silently skip meshopt for that
  case. A silently-uncompressed GLB is a regression.
