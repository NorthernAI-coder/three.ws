# B4 — Raycast tap accuracy + proximity focus

## Goal

Make tapping an agent reliable. Raycast against **both** the floating billboard
label and the agent's 3D mesh, pick the nearest hit, expand hit targets for
touch, and add a proximity **focus highlight** on the nearest agent so the user
knows what they'll tap before they tap. Handle overlapping agents and small
on-screen targets gracefully.

## Why it matters

Right now you can only open an agent by hitting its tiny HTML name label — the
3D body itself is dead to touch, and labels overlap when agents cluster. On a
phone, a 24 px label is a frustrating target. Reliable tapping is the floor for
every interaction in Epic B; if the tap misses, none of B2/B3 matters.

## Current state (real lines)

`src/irl.js`:
- The only tap path today is `el.addEventListener('click', () =>
  openPinSheet(pin))` on each label in `spawnNearbyPin` ~976. The 3D group
  (`pin.group`, holding the beacon then the GLB) has **no** pointer handling.
- `updateLabels()` ~1254 already projects each `pin.group` to screen space with
  `_lblVec.project(camera)` — reuse that projected position for label hit-tests
  and for placing a focus ring.
- No `Raycaster` is instantiated for nearby pins yet. `camera`, `scene`, and
  `nearbyPins[].group` are all in scope.

## What to build

### 1. Unified tap handler (mesh ∪ label, nearest wins)

Add one `pointerup`/`click` handler on the renderer canvas (not per-label) that:

1. **Mesh ray:** build a screen-space NDC from the touch point, `raycaster
   .setFromCamera(ndc, camera)`, intersect against the loaded agent groups
   (`raycaster.intersectObjects(loadedGroups, true)`), map the hit back to its
   pin via `object.parent` walk (cache `pin` on the group: `g.userData.pin =
   pin` in `spawnNearbyPin`). Nearest intersection = `meshHit { pin, distance }`.
2. **Label ray (2D):** for each on-screen label, compute pixel distance from the
   tap to the label centre; any within an **expanded touch radius**
   (`TAP_SLOP = 28px`, larger than the label box) is a `labelHit { pin,
   pxDist }`. Nearest = best label hit.
3. **Resolve:** prefer the mesh hit when present (you tapped the body); else the
   nearest label hit within slop. Open `openPinSheet(pin)` / the B2 card.
   ```js
   const TAP_SLOP = 28;
   function handleTap(clientX, clientY) {
     const meshPin  = raycastNearestMesh(clientX, clientY);
     const labelPin = nearestLabelWithinSlop(clientX, clientY, TAP_SLOP);
     const pin = meshPin || labelPin;
     if (pin) openPinSheet(pin);
   }
   ```
   Keep the existing per-label `click` as a fallback for accessibility, but make
   the canvas handler the primary path (remove the per-label one if it
   double-fires).

### 2. Overlapping agents

When two agents project to nearly the same pixel, the raycaster's nearest
intersection (closest to camera) already disambiguates the body tap. For label
ties (both within slop), pick the one with the **smaller `distance_m`** (front
agent), and nudge the focus ring so the user can re-aim. No multi-select popup
needed.

### 3. Touch-friendly hit expansion

- Bump label CSS hit area: invisible padding / `::before` expanding the touch
  box to ≥44 px (Apple HIG min) without changing the visible label.
- Treat `pointerdown`→`pointerup` within a small move threshold (~10 px) as a
  tap; ignore drags (so panning/looking doesn't trigger taps).

### 4. Proximity focus highlight

Each frame (cheap; reuse the `updateLabels` projection loop), mark the **nearest
on-screen agent within reach** (smallest `distance_m`, on-screen) as focused:
- Add a CSS class to its label (e.g. `.irl-agent-label--focus`: brighter ring,
  subtle scale) and/or draw a thin reticle ring at the projected screen pos.
- Only one agent is focused at a time; transitions are eased (opacity/transform).
- This gives the "you'll tap this" affordance and doubles as a target for the
  overlap case.

## Data / API changes

None — pure client-side raycasting and CSS. One `Raycaster` instance reused
across taps; cache `g.userData.pin`; no per-frame allocations beyond the existing
projection vector.

## Acceptance checklist

- [ ] Tapping an agent's 3D body opens its card (mesh raycast works).
- [ ] Tapping near (within ~28 px of) a name label also opens it.
- [ ] Overlapping agents resolve to the nearest (front) agent, not a random one.
- [ ] Label touch area is ≥44 px; visible label unchanged.
- [ ] Dragging to look/pan does **not** register as a tap.
- [ ] The nearest reachable agent shows an eased focus highlight; only one at a
      time; it updates as the user moves.
- [ ] No double-open from label + canvas handlers firing together.
- [ ] No console errors; no measurable FPS cost from focus tracking.

## Out of scope

- The card contents themselves (**B2**) and CTA wiring (**B3**).
- Look-at / awareness behaviour (**B1**) — independent.
- Multiplayer presence markers (**D2**).

## Verify

`npm run dev`, open `/irl` on a touch device/emulated viewport with 2–3
overlapping placed agents. Confirm body taps and near-label taps both open the
right agent, the front agent wins on overlap, a look-drag never opens a card,
and the focus ring tracks the nearest agent as you move.
