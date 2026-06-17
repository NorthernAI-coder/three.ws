# 04 — GPS-edge hysteresis / anti-flicker

> Size **S–M** · `src/irl.js` (`loadNearbyPins`, `refreshKnownPin`, despawn path,
> `NEARBY_RADIUS`), small pure helper. A real correctness + zero-jank bug, not polish.

## Goal

Stop agents near the radius boundary from popping in and out as consumer GPS
jitters, and stop avatars from "swimming" frame-to-frame. Discovery must be rock
steady: once an agent appears, it stays put until you genuinely walk away.

## Why it matters

Consumer GPS is ~5–30 m noisy; our discovery gate is 40 m. An agent sitting at
~38–42 m will cross the threshold on *every* fix, so the server returns it, then
drops it, then returns it — the avatar spawns, disposes its GPU resources, and
respawns repeatedly. That's visible flicker, wasted GLB loads, and a janky,
unprofessional feel — exactly what "best UX" rules out. The origin low-pass
(`blendOrigin`) smooths the *viewer* origin but does nothing for *set membership*
churn at the edge.

## Current state (real lines)

- `api/irl/pins.js` nearby GET hard-caps the requested radius:
  `Math.min(60, Math.max(10, parseFloat(req.query.radius ?? '40')))`. The client
  requests `NEARBY_RADIUS = 40`.
- `src/irl.js` `loadNearbyPins()` rebuilds the set every 10 s: pins absent from the
  response are removed via `disposePin(p)`; new ones are `spawnNearbyPin`-ed. There
  is **no hysteresis** — membership is whatever the last poll returned.
- `pinWorldPos` already resolves room-anchored clusters exactly; standalone pins
  use their own lat/lng, which is where edge jitter shows.

## What to build

1. **Asymmetric radius (hysteresis).** Discover at 40 m, but only *drop* a pin once
   it's clearly gone — e.g. request a slightly wider read radius (client asks for
   the cap, ~55–60 m) and apply the **enter** threshold (40 m) only to pins not
   already rendered, while keeping an already-rendered pin until it exceeds an
   **exit** threshold (e.g. 55 m). Compute distance client-side from `pinWorldPos`
   (already done each GPS fix) so the band is enforced locally regardless of the
   server's coarse set. Keep the server cap intact — never widen past 60 m.
2. **Despawn debounce.** A pin must be out-of-band for N consecutive polls (or T
   seconds) before `disposePin` — so a single bad fix never evicts a stable agent.
3. **Spawn/despawn transitions.** Fade/scale in on spawn, fade out on despawn
   (respect `prefers-reduced-motion`) so even a legitimate arrival/exit is smooth,
   not a pop.
4. Keep the per-fix reposition (`pinWorldPos`) — that's correct; this task governs
   *membership*, not position.

## Acceptance checklist

- [ ] A pin held at ~40 m with simulated ±10 m GPS noise stays rendered without a
      single dispose/respawn cycle (assert in a unit test on the pure band helper).
- [ ] Exit requires sustained out-of-band (debounced), not one poll.
- [ ] Spawn/despawn are animated; `prefers-reduced-motion` falls back to instant.
- [ ] Server radius cap unchanged (still `Math.min(60, …)`); no roster widening.
- [ ] No extra GLB refetches on a stable pin (watch the Network tab); no console noise.
- [ ] Unit test for the hysteresis band (enter/exit/debounce) added to the suite.

## Out of scope

The arrival cue (task 03) consumes the *stable* arrival signal this produces — keep
the "newly stable in-band" event clean so 03 doesn't double-fire. No server change.

## Verify

`npm run dev` → /irl with `__irlSeedPins` + a scripted GPS wobble around a pin at
the boundary (dev harness per [memory: irl-perf-e2]); confirm the avatar holds
steady and `__irlPerf()` shows no churn in load/evict counts.
