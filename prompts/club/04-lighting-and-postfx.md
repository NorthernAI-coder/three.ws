# Task: Volumetric lighting + mirror ball + post-processing for /club

## Repo context

Working tree: `/workspaces/three.ws`. Today
[src/club.js](../../src/club.js) sets up:

- One `AmbientLight` + one `HemisphereLight` (low intensity).
- Four `SpotLight`s pointing at each pole base.
- Four `PointLight` floor accents.
- Four orbiting `PointLight`s in a "disco" group
  ([src/club.js:418-426](../../src/club.js)).
- No post-processing — `renderer.render(scene, camera)` direct.

There's no volumetric glow, no mirror ball reflection, no bloom, no
beat-synced animation, no rim lights along bar/ceiling. The room
looks evenly lit instead of moody.

## Rails (CLAUDE.md — non-negotiable)

- No fake "volumetric" rendered as a static texture decal — the
  cones must respond to camera position via real billboarded
  geometry or a proper volumetric pass.
- No `setTimeout`-driven light pulses. Phase off the render loop's
  `clock.elapsedTime`.
- Bloom + tone mapping wired via `EffectComposer` from
  `three/addons/postprocessing/*`. Cleanly disposable on resize.
- Done = real-browser smoke shows visible spotlight cones through
  fog, mirror-ball dots scattering across the room, bar neon strip
  glowing, no fps regression on desktop.

## What to implement

### Step 1 — postprocessing pipeline

Wire `EffectComposer` in [src/club.js](../../src/club.js):

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new Vector2(window.innerWidth, window.innerHeight),
  0.55, // strength
  0.85, // radius
  0.7,  // threshold
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
```

Replace `renderer.render(scene, camera)` in the animate loop with
`composer.render()`. Update `resize` to call
`composer.setSize(w, h)` and `bloom.resolution.set(w, h)`.

### Step 2 — volumetric spotlight cones

For each `SpotLight`, add a billboarded cone mesh that fakes
volumetric glow. Cleanest pattern:

- `ConeGeometry` (open bottom) sized to match the spotlight angle
  and distance.
- Custom `ShaderMaterial`:
  - vertex shader passes view-space normal and position;
  - fragment shader fades by `dot(view, normal)` so the cone is
    bright when looking across it and faint when looking along it;
  - density falls off with distance from cone axis.
- Additive blending, depth write off, `transparent: true`.
- The cone color matches the slot accent (`POLE_COLORS[i]`).
- Intensity follows `this.spot.intensity` from `PoleStation` so it
  ramps up when a dancer takes the pole.

The volumetric cone is a child of the spotlight target group so it
moves correctly with the spotlight orientation.

Don't try a screen-space fullscreen volumetric pass — too expensive
for four cones on mobile.

### Step 3 — mirror ball

Add `public/club/props/mirrorball.glb` (or build procedurally — an
`IcosahedronGeometry(0.35, 2)` with per-face material variation):

- Hangs from the venue's `truss.mirrorball` empty.
- Rotates slowly: `mirrorball.rotation.y = t * 0.4` in the animate
  loop.
- Cube camera (`CubeCamera`) parented to the ball, captures the
  scene every frame at 64×64 px into a `CubeRenderTarget`.
- A small instanced `PointsMaterial` of "reflection dots" scattered
  across the floor and walls, where each dot's brightness is
  modulated by sampling the cube-cam target. Practical shortcut:
  instead of a real reflection bounce, project ~80 spotlight-like
  beams from the ball position at random outward angles and let
  them paint emissive specks on the wall via a `Points` system
  whose positions are computed on the CPU once and rotated with the
  ball.

Cube camera updates only when the camera is in a wide shot — skip
when the active camera is a VIP zoom (prompt 06).

### Step 4 — bar neon strip + ceiling rim

Find the venue's `bar.backsplash.neon` and `truss.rim.*` empties.
Attach `LineSegments` along their paths with an emissive material
(0xff3bd6 for the bar, color-cycling for the truss). Bloom does the
heavy lifting — the lines don't need to be thick.

### Step 5 — beat-synced rim pulse

The audio prompt (prompt 05) wires a Web Audio analyser. Read its
peak value every frame and modulate the rim-light intensity:

```js
const peak = audioAnalyser?.getPeak?.() ?? 0; // 0..1
rimMat.emissiveIntensity = 0.4 + peak * 1.6;
```

If audio isn't available (analyser is null), default to a slow
sine: `0.4 + 0.4 * Math.sin(t * 1.2)`. No fake beat detection —
real audio drives it when audio plays, real sine when it doesn't.

### Step 6 — chromatic aberration during high-energy clips

For `pole-spin`, `pole-invert`, `thriller`:

- Add an `ShaderPass` between `bloom` and `OutputPass` with a small
  chromatic-aberration shader (per-channel UV offset).
- Strength interpolates from 0 → 0.004 during the active clip and
  back to 0 on exit.
- Driver: `composer.passes` reads each `PoleStation.performing` +
  `activeTicket.clip` to compute a global "intensity" 0..1.

### Step 7 — shadow tuning

Today every spotlight has shadows on. With four spots + bloom +
volumetric cones + mirror ball this gets heavy.

- Only the spot whose station is `performing` casts shadows. The
  rest set `castShadow = false`. Toggle on in
  `_spotTarget = active`, off when returning to idle.
- Shadow map size 512×512 (already the default in `src/club.js:254`).
- `shadow.bias = -0.0008` (already set).

### Step 8 — manual end-to-end

```bash
npm run dev
```

Visit `/club`. Confirm:

- Spotlight cones visible through fog when looking across them.
- Mirror ball rotates and paints reflection dots on the floor/walls.
- Bar neon strip glows with bloom.
- Tipping a dancer ramps the cone intensity up + chromatic
  aberration in on high-energy clips, then back.
- Frame rate ≥60fps on a 2020-era laptop.

### Step 9 — tests

`tests/club-lighting.test.js`:

- Construct a `PoleStation` with a stubbed `SpotLight`; assert the
  volumetric cone child mesh exists and shares intensity.
- Drive `tick()` with a fake `dt` and assert the cone material's
  intensity lerps toward the target.

Visual / postprocessing has no unit test that adds value — rely on
the manual smoke and on the Playwright snapshot in prompt 10.

## Definition of done

- `EffectComposer` pipeline live with bloom + tone mapping +
  optional chromatic aberration.
- Volumetric cones visible per spotlight.
- Mirror ball + reflection dots render.
- Bar + ceiling rim lights render and pulse.
- No fps regression vs primitives-only baseline on the same
  hardware.

## Constraints

- Do not require WebGPU; everything must work on WebGL2 + bloom.
- Do not write a fullscreen volumetric god-rays pass — too costly
  for the budget. Billboarded cones only.
- Do not leave the cube-camera updating every frame when a VIP cam
  is active.
- Do not allow bloom to clip the dancer's albedo into white on the
  brightest clips — set `material.toneMapped = true` on dancer
  skin shaders.
