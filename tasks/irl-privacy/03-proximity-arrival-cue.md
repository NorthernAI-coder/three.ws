# 03 — Proximity-arrival cue + non-map directional hint

> Size **M** · `src/irl.js` (`loadNearbyPins`/`refreshKnownPin`, spawn path,
> `onGPSPosition`, compass heading), a small pure module `src/irl/proximity-cue.js`,
> `src/irl.css`. The delight that makes serendipity actually work.

## Goal

Make the moment an agent enters your ~40 m bubble **felt**: a subtle haptic + soft
chime + a brief on-screen "an agent is near — look around," plus a gentle,
**non-map** directional nudge (an edge glow pointing toward the agent's bearing)
so the user knows which way to turn their camera. Discovery without a radar only
works if arrival is sensed.

## Why it matters

We removed the list and the radar on purpose. The cost: a user can be standing 15 m
from an agent, facing the wrong way, and never know. A single ambient "something is
here, turn around" cue — the way a notification buzz makes you look at your phone —
is what converts "empty screen" into "oh!". This is the difference between a privacy
feature that feels dead and one that feels magical. Crucially, the hint points a
*direction*, never reveals a list/coordinates — it's the in-world equivalent of
hearing a sound nearby.

## Current state (real lines)

- New pins enter via `loadNearbyPins()` → `spawnNearbyPin(entry)`. Known pins go
  through `refreshKnownPin`. There is **no** signal fired on first arrival today.
- The viewer's compass bearing is available (`currentHeadingDeg()`,
  `lastCompassHeading`); a pin's world position comes from `pinWorldPos(pin)` →
  `{x,y,z}` in metres relative to the viewer, so its **screen-relative bearing** is
  derivable (`atan2(x, -z)`) without exposing any coordinate.

## What to build

1. **`src/irl/proximity-cue.js`** — pure, unit-testable: given the set of currently
   in-range pin ids and the previously-seen set, return the newly-arrived ids
   (debounced so GPS-edge churn — see task 04 — doesn't double-fire). No DOM.
2. **Arrival cue** fired from `loadNearbyPins` when `proximity-cue` reports a new
   arrival:
   - `navigator.vibrate?.(...)` (guarded; many browsers/iOS ignore it — never assume).
   - A short, quiet chime via WebAudio (preloaded, user-gesture-unlocked on the
     same tap that started the camera). Respect a **mute toggle** (persist in
     `localStorage`) and the OS reduced-motion/`prefers-reduced-motion` for the visual.
   - A transient banner: *"An agent is near — look around."* aria-live polite.
3. **Directional nudge** — a soft glow/arrow at the screen edge toward the agent's
   current screen-relative bearing (recomputed as the user rotates, from compass +
   `pinWorldPos`). Fades once the agent is on-screen/in view frustum. **Never** a
   minimap, never a distance readout that could be triangulated — just "that way."
   When multiple agents are in range, nudge toward the nearest only.
4. Cap frequency: at most one chime/haptic per arrival, and a short global cooldown
   so a busy spot isn't a slot machine.

## Acceptance checklist

- [ ] `proximity-cue.js` is pure + unit-tested (new arrivals, debounce, no re-fire
      on a pin that merely refreshed).
- [ ] Arrival fires haptic (where supported) + optional chime + aria-live banner,
      exactly once per arrival, with a cooldown.
- [ ] Mute toggle persisted; `prefers-reduced-motion` disables the animated glow.
- [ ] Directional nudge points toward the nearest in-range agent and updates as the
      device rotates; disappears when the agent is in view. No map, no coordinates.
- [ ] WebAudio unlocked on the existing camera-start gesture; no autoplay warning.
- [ ] No console errors; clean at 320/768/1440; holder changelog entry + `build:pages`.

## Out of scope

Membership churn / hysteresis at the radius edge (task 04 — this task consumes its
debounced arrival signal). The empty-state explainer (task 02).

## Verify

`npm run dev` → /irl, seed a pin just inside range behind the camera
(`__irlSeedPins`): confirm the haptic/chime/banner fire once and the edge glow
points toward it; rotate to face it and confirm the glow fades. Toggle mute and
reduced-motion and re-confirm.
