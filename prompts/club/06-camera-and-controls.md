# Task: Multi-cam (free / VIP / house) + interaction polish for /club

## Repo context

Working tree: `/workspaces/three.ws`. Today
[src/club.js:552-579](../../src/club.js) implements a single free-orbit
camera driven by pointerdown/move on the canvas. There's no way to
"zoom in on dancer 3" or get a clean overhead shot of the room.

The `POLES` layout array carries each pole's `x/z` and `yaw`, which
is enough to compute deterministic VIP shots.

## Rails (CLAUDE.md — non-negotiable)

- No `setTimeout`-faked dolly. Real interpolation in the existing
  `animate()` loop driven by `Clock.getDelta()`.
- No `OrbitControls`-injected handlers fighting the existing
  pointer code — keep the system single-author.
- Touch support: mobile must work without a keyboard.
- Done = clicking a pole card snaps the camera to a VIP shot;
  Escape returns to free; keyboard 1–4 + 0 work on desktop; pinch +
  drag still orbit on touch.

## What to implement

### Step 1 — camera state machine

New file `src/club-camera.js`:

```js
import { Vector3 } from 'three';

const MODES = ['free', 'vip', 'house'];

export class ClubCamera {
  constructor(camera, opts = {}) {
    this.camera = camera;
    this.mode = 'free';
    this.target = new Vector3(0, 1.2, -1.8);
    this.offset = new Vector3(0, 2.2, 7.2);
    this.yaw = 0;
    this.pitch = 0.05;
    this._lerp = 2.0; // 1 / seconds-to-settle approx.
    this._pending = null; // {target, offset, lerp}
  }

  setFree() { this.mode = 'free'; this._pending = null; }

  setVip(poleLayout) {
    this.mode = 'vip';
    const target = new Vector3(poleLayout.x, 1.6, poleLayout.z);
    const offset = new Vector3(
      Math.sin(poleLayout.yaw + Math.PI) * 2.6,
      1.3,
      Math.cos(poleLayout.yaw + Math.PI) * 2.6,
    );
    this._pending = { target, offset, lerp: 3.0 };
  }

  setHouse() {
    this.mode = 'house';
    this._pending = {
      target: new Vector3(0, 0.5, -1.5),
      offset: new Vector3(0, 12, 0.001), // top-down with epsilon to avoid singular up
      lerp: 1.6,
    };
  }

  // Called from pointer drag handler; only effective in 'free' mode.
  applyDrag(dx, dy) {
    if (this.mode !== 'free') return;
    this.yaw -= dx * 0.004;
    this.pitch = Math.max(-0.3, Math.min(0.5, this.pitch - dy * 0.003));
  }

  applyZoom(deltaY) { /* free + vip both honor pinch zoom */ }

  tick(dt) {
    if (this._pending) {
      this.target.lerp(this._pending.target, Math.min(1, dt * this._pending.lerp));
      this.offset.lerp(this._pending.offset, Math.min(1, dt * this._pending.lerp));
      if (this.target.distanceTo(this._pending.target) < 0.01) this._pending = null;
    }
    if (this.mode === 'free') {
      const rotated = this.offset.clone().applyAxisAngle(new Vector3(0, 1, 0), this.yaw);
      this.camera.position.copy(this.target.clone().add(rotated));
    } else {
      this.camera.position.copy(this.target.clone().add(this.offset));
    }
    this.camera.lookAt(this.target);
  }
}
```

### Step 2 — replace the inline camera math

In [src/club.js](../../src/club.js):

- Delete the inline drag handler (`src/club.js:552-579`) and the
  inline camera math in `animate()` (`src/club.js:599-605`).
- Instantiate `const clubCam = new ClubCamera(camera);`.
- New drag handler calls `clubCam.applyDrag(dx, dy)` and
  `clubCam.applyZoom(delta)`.
- In `animate()`: `clubCam.tick(dt)` before `composer.render()`.

### Step 3 — pole-card → VIP cam

In `renderPoles()` (`src/club.js:519-550`), the pole card already has
a Tip button. Add a small VIP icon button to the right of the price:

```html
<button type="button" class="club-cam-btn" data-pole="${pole.id}" title="VIP cam">
  🎬
</button>
```

Click handler: `clubCam.setVip(POLES.find(p => p.id === poleId))`.

While in VIP mode show a small dismiss chip ("Free cam") next to
`#club-status`. Escape key + the chip's click both call
`clubCam.setFree()`.

### Step 4 — keyboard shortcuts

In `bootstrap()`:

```js
window.addEventListener('keydown', (e) => {
  if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT') return;
  if (e.key === '0') return clubCam.setHouse();
  if (e.key === 'Escape') return clubCam.setFree();
  if (['1', '2', '3', '4'].includes(e.key)) {
    const layout = POLES.find((p) => p.id === e.key);
    if (layout) clubCam.setVip(layout);
  }
});
```

### Step 5 — touch / pinch

`pointermove` already handles single-pointer drag. For pinch zoom,
track up to two pointers in a `Map`:

- Two pointers → distance delta = zoom.
- Single pointer → orbit.
- Disable browser scroll on the canvas (`touch-action: none` is
  already set in [pages/club.html](../../pages/club.html) CSS).

### Step 6 — auto-cam during performance

When a `PoleStation` calls `startPerformance` and no VIP/house is
already active, auto-switch to that pole's VIP cam for the duration,
then return to free on `_endPerformance`. Make this opt-in via a
right-panel checkbox ("Auto-follow tips") that persists to
`localStorage`.

### Step 7 — manual end-to-end

```bash
npm run dev
```

- Free orbit works as before (no regression).
- Clicking a pole-card 🎬 dollies smoothly to a VIP shot of that
  pole.
- Escape returns to free.
- `0` jumps to overhead house cam.
- Numbers `1`–`4` jump to per-pole VIP.
- Auto-follow option keeps the camera on the active dancer when a
  tip lands.

### Step 8 — tests

`tests/club-camera.test.js`:

- Stub a `PerspectiveCamera`-shaped object.
- Drive `setVip()` → many `tick(dt)` calls → assert camera position
  converges to the expected world coordinate.
- Drive `setFree()` after a VIP → assert orbit yaw drag works again.

## Definition of done

- `src/club-camera.js` exports `ClubCamera`, used by
  [src/club.js](../../src/club.js).
- All four modes (free, VIP × 4, house) reachable via keyboard,
  mouse, touch.
- Auto-follow toggle persists.
- Real browser smoke clean, tests green.

## Constraints

- Do not introduce `OrbitControls` alongside the custom system —
  pick one.
- Do not teleport between modes; always interpolate over ~0.4s.
- Do not steal keyboard input from selects / inputs in the side
  panel (the early-return guard handles this — keep it).
