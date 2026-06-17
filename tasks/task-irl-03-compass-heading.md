# IRL Task 03 — Compass Heading: Avatars Face the Right Direction

## Context

The IRL GPS pin system (`/api/irl/pins`, `src/irl.js`) stores a `heading` column (float, degrees 0–360) in `irl_pins`, but:

1. The frontend `savePin()` in `src/irl.js` **never sends a heading** — it's always 0 in the DB
2. `spawnNearbyPin()` places foreign avatars in the scene but **never rotates them** based on heading
3. The device compass (`DeviceOrientationEvent`) is already wired in `src/irl.js` (see `onDeviceOrientation`, `devOrientBaseAlpha`, `devOrientAlpha`) but its value is only used for AR camera control — not captured at pin time

The result: all foreign avatars face the same direction (Three.js default, Z- axis) regardless of which way they were facing when pinned.

## What to build

### 1. Capture heading at pin time (`src/irl.js`)

Find the `devOrientAlpha` variable (already maintained by `onDeviceOrientation`). This is the device's compass heading in degrees (0 = north, clockwise). When `savePin()` is called (inside the lock button handler), pass the current heading:

```js
// In the lockBtn click / setLocked(true) handler, find where savePin is called:
savePin(gpsPin.lat, gpsPin.lng, devOrientAlpha ?? 0)
  .then(result => { ... });
```

Update `savePin()` to accept and send heading:

```js
async function savePin(lat, lng, heading = 0) {
  try {
    const r = await fetch('/api/irl/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat, lng,
        heading: Math.round(heading) % 360,   // add this
        avatarUrl:   resolveAvatarUrl(_currentAvatarId),
        avatarName:  nameEl.textContent,
        deviceToken: _deviceToken,
        agentId:     avatarIdParam || null,
      }),
    });
    ...
  }
}
```

The API already accepts `heading` in the POST body and stores it — no API change needed.

### 2. Rotate foreign avatars in the scene (`src/irl.js`)

In `spawnNearbyPin(pin)`, after setting `g.position`, rotate the group to face the stored heading.

GPS heading 0 = north. In Three.js the scene's Z- axis = "forward" (camera looks down -Z by default). The mapping from compass heading to Three.js Y rotation is:

```
threeRotationY = -(heading * Math.PI / 180)
```

(Negate because Three.js rotates counter-clockwise, compass is clockwise.)

Add this after `g.position.set(...)`:

```js
if (pin.heading != null) {
  g.rotation.y = -(pin.heading * Math.PI / 180);
}
```

This applies to the whole group — beacon placeholder and loaded GLB alike — so both face the right direction from the moment they appear.

### 3. Re-rotate when GLB loads (`src/irl.js`)

In `loadPinGLB(pin)`, after the model is added to the group, re-apply the rotation because the GLB loader may reset it. Find the end of `loadPinGLB`:

```js
// After: pin.group.add(model); pin.glbLoaded = true;
if (pin.heading != null) {
  pin.group.rotation.y = -(pin.heading * Math.PI / 180);
}
```

### 4. Live heading updates for own avatar (optional but high quality)

When the user is in GPS pin mode (`gpsModeActive === true`) and walking, their own avatar already faces the direction of movement. But when **locked** (avatar stationary, camera orbiting), the avatar should face the stored heading rather than defaulting to whatever it was last walking toward.

In `setLocked(next)`, when `next === true` and `gpsPin` exists:

```js
if (next && avatar && devOrientAlpha != null) {
  avatar.rotation.y = -(devOrientAlpha * Math.PI / 180);
}
```

This snaps the avatar to face north-relative at lock time, consistent with what gets stored.

### 5. Show heading in IRL placement status

In the status message shown after locking, include the compass direction:

```js
function compassLabel(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

// In savePin().then():
const dir = compassLabel(devOrientAlpha ?? 0);
setStatus(`Pinned facing ${dir} — others nearby can see you`);
```

### 6. Dashboard card (Task 02 follow-up)

In `src/dashboard-next/pages/irl-placements.js` (built in Task 02), each pin card should show the facing direction using the same `compassLabel` function. Display it as a small badge next to the location: `📍 New York · Facing NE`.

Export `compassLabel` from a shared util or inline it in both files (it's 3 lines).

## Files to edit

- `src/irl.js` — capture heading in savePin(), rotate groups in spawnNearbyPin() + loadPinGLB(), snap avatar on lock

## Files that may need a minor touch

- `src/dashboard-next/pages/irl-placements.js` (Task 02) — show compass direction in pin card

## Definition of done

- Locking your avatar captures the current compass heading and sends it to the API
- Foreign avatars spawn facing their stored heading direction (not always Z-)
- After GLB loads, heading rotation is preserved
- When you lock your own avatar, it snaps to face the stored heading
- Status message shows compass direction (e.g. "Pinned facing NE")
- Dashboard pin cards show facing direction badge
- No regressions: anonymous flow, unlocking, and AR camera orbit all still work

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/task-irl-03-compass-heading.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
