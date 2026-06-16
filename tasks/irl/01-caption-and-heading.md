# Task: IRL — Caption & compass heading when pinning

## What to build

When the user taps "Pin here" in AR mode, show a small slide-up input panel BEFORE the pin is saved so they can add an optional caption (e.g. "P2P trades here — DM me on Telegram"). Also capture the device's compass heading at pin time so the placed agent faces the world correctly.

## Current state

- `src/irl.js` — `setLocked(true)` at ~line 644 calls `savePin(lat, lng)` immediately, with no caption or heading.
- `savePin()` at ~line 758 sends `{ lat, lng, avatarUrl, avatarName, deviceToken }` — no `caption`, no `heading`.
- `api/irl/pins.js` — POST handler accepts `caption` and `heading` and stores them; nothing to change there.
- `api/_lib/db.js` exports `sql` tagged template for Neon Postgres.

## Changes required

### 1. Capture compass heading

In `src/irl.js`, there is already a `cameraYaw` variable (radians, updated by `onDeviceOrientation`). This represents the heading the user is currently facing. Convert it to degrees at pin time:

```js
const headingDeg = ((cameraYaw * 180 / Math.PI) % 360 + 360) % 360;
```

Store this in `gpsPin.heading` and pass it to `savePin`.

Update `savePin(lat, lng, heading, caption)` to include both fields in the POST body.

### 2. Caption input UI

In `pages/irl.html`, add a caption panel that slides up between "Pin here" tap and actual save. It should sit above `#irl-sheet` (z-index 21), look like a bottom sheet (same glass style), and contain:

- A `<textarea id="irl-caption-input">` placeholder "Add a caption… (optional)"  
- A "Pin it" confirm button (green pill, same style as `.irl-sheet-btn-primary`)  
- An "×" dismiss that cancels the whole pin action

CSS: same `transform: translateY(100%)` / `.is-open` pattern as `#irl-sheet`.

### 3. Flow change in `setLocked(true)`

Instead of calling `savePin` immediately:
1. Compute `gpsPin` lat/lng as now (lines 650-658)
2. Set `gpsModeActive = true` and lock the avatar
3. Open the caption panel
4. On "Pin it" click: read the caption value, call `savePin(lat, lng, headingDeg, caption)`, close the panel
5. On "×" dismiss: call `setLocked(false)` to undo the lock

### 4. Orient the placed agent in world space

In `spawnNearbyPin()` (~line 811), the `Group` is spawned with default rotation. After spawning, set:

```js
// Face the agent toward the placer's original heading (they placed it facing them)
pin.group.rotation.y = -(pin.heading ?? 0) * Math.PI / 180;
```

### 5. Update the nearby pin entry

In `loadNearbyPins()` the `entry` spread already carries `pin.heading` since the API returns it. No change needed there.

## Checklist

- [ ] Caption panel HTML added to `pages/irl.html` with CSS slide-up
- [ ] `setLocked(true)` opens caption panel instead of saving immediately
- [ ] Caption panel "Pin it" calls `savePin` with caption + heading, closes panel
- [ ] Caption panel dismiss cancels the lock
- [ ] `savePin` sends `caption` and `heading` in POST body
- [ ] `spawnNearbyPin` sets `group.rotation.y` from `pin.heading`
- [ ] No console errors, no unreachable states
- [ ] Changelog entry NOT required (internal UX refinement of a feature shipped same day)
