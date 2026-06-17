# Epic: IRL location privacy → production

The /irl world lets anyone place a 3D AI agent at a real-world spot and come
across other people's agents in AR. We just changed the trust model: **an agent's
location is private.** It is revealed to a viewer ONLY when they are physically
within a tight radius of it (the per-viewer proximity read) — never as a list, a
map, a neighborhood feed, or a realtime roster. You discover an agent by walking
up to its spot and pointing your camera; you cannot browse where agents are.

This epic takes that model from *implemented + unit-tested* to **100% production
ready, zero-error, shipped, and the best discovery UX on the planet** — without
ever weakening the privacy guarantee.

---

## The hard invariant (every task inherits this — do not break it)

> **No surface — API response, realtime channel, UI, deep-link, share image,
> dashboard, or log — may let anyone obtain the location of an agent they are not
> physically standing near.**

Concretely, all of these must stay true after every task:

- The realtime room (`multiplayer/src/rooms/IrlRoom.js`) carries **presence +
  reactions only** — never pins. A client that joins a geocell receives **zero**
  pin coordinates in its synced state.
- The only read that returns another user's pin coordinates is the nearby GET in
  `api/irl/pins.js`, scoped to the caller's **own** live position, **hard-capped**
  to a tight radius (`Math.min(60, Math.max(10, … ?? '40'))`) and IP rate-limited
  (`limits.publicIp`). There is no bbox/window feed.
- Owner identifiers (`user_id`, `device_token`) are **never** projected into any
  public feed.
- The `?mine` feeds return coordinates only for the authenticated/device owner's
  own pins.

If a task seems to require relaxing any of the above to ship — stop and flag it.
The privacy model wins; find another way.

---

## Current shipped state (ground truth, do not re-derive wrong)

- **API** — `api/irl/pins.js`: nearby GET returns pins within `NEARBY_RADIUS`
  around the caller, projecting public fields + the room-frame columns
  (`room_id`, `rel_east_m`, `rel_north_m`, `origin_lat`, `origin_lng`,
  `origin_yaw_deg`) but never owner ids. No `?bbox`. No realtime publish.
  Rate-limited on every GET. `report.js` hides on threshold (poll picks it up).
- **Client** — `src/irl.js`: `NEARBY_RADIUS = 40`; pins come *only* from the
  proximity poll (`startPinPolling`/`stopPinPolling`, `POLL_INTERVAL_MS = 10000`,
  `loadNearbyPins` + `refreshKnownPin`); the WS (`src/irl-net.js`, `IrlNet`) is
  presence + reactions only. Rendering is room-aware via `pinWorldPos`/`pinRoom`
  (shared room-anchor — `src/irl/room-anchor.js`). HUD: `updateNearbyBadge`
  (`#irl-nearby-badge`), `setNetPill` (`#irl-net-pill`), `updatePresence`
  (`#irl-presence-chip`), confidence ring, opt-in ghosts.
- **Realtime** — `multiplayer/src/rooms/IrlRoom.js` is presence + reactions only;
  the publish webhook + `irl-registry`/`irl-publish-auth` and the API-side
  `irl-publish`/`irl-realtime` modules are deleted.
- **Tests** — `tests/api/irl-pins-location-guards.test.js` proves no window feed,
  the hard radius cap, rate-limiting, and no owner-id projection; room-frame and
  presence/reaction suites are green.

## Definition of done (the whole epic)

Per the root `CLAUDE.md`: real APIs only, no mocks/placeholders, every state
designed (loading/empty/error/populated/permission-denied), accessible, responsive
at 320/768/1440, no console errors/warnings, existing tests green + new coverage,
exercised in a real browser/device, and a holder-readable changelog entry for each
user-visible change. The feature should be something you'd demo to a room of
senior engineers and screenshot to share.

## Tasks (suggested order)

1. **01** — Ship both surfaces safely + adversarial "no roster" proof.
2. **02** — Discovery onboarding + the designed empty state (teach "stumble upon").
3. **03** — Proximity-arrival cue + non-map directional hint (the delight).
4. **04** — GPS-edge hysteresis / anti-flicker (zero jank at the radius boundary).
5. **05** — Location-leak audit across every sibling endpoint, deep-link, share.
6. **06** — Every state, permission, and accessibility pass.
7. **07** — E2E + regression coverage that locks the invariant in CI.
8. **08** — User-facing "how location works" trust surface + docs + changelog.

Each task file is self-contained: read it, read the real lines it cites, ship it,
check its acceptance list, then delete the task file in the shipping commit.
