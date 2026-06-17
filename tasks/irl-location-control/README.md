# IRL — Location Control & Safe Testing

The program that makes **placing, testing, and living with a real-world location**
in `three.ws/irl` feel safe and intentional — for the developer testing on a
phone, and for the real user who does not want their home address written into a
public feed.

Today `/irl` reads your live GPS (`navigator.geolocation.watchPosition`) and, the
moment you lock/place an agent, writes your **exact standing coordinates** to the
public `irl_pins` table. That is correct for the AR product — but it leaves two
gaps this epic closes:

1. **No safe way to test.** On a real iPhone you cannot spoof Safari's location,
   and a dev build served over LAN can't even read GPS (geolocation is blocked on
   non-secure origins). So testing the place-a-pin flow means leaking your real spot.
2. **No user control over the placement leak.** A user can only pin where they
   physically stand, has no plain-language picture of what is shared or who can
   see it, and no fast way to purge what they dropped.

This epic delivers a **production-ready, fully-designed Location Control system**:
choose where you place (precise GPS *or* a point on a map), understand and control
what's shared, harden the proximity read so browsing doesn't broadcast your exact
position, manage/purge your pins, and a DEV-only simulated-location mode so QA can
exercise the whole flow on a real device without ever touching a real coordinate.

---

## What already exists (do NOT rebuild — extend)

Grounded in the current tree:

| Piece | Location | State |
|---|---|---|
| IRL AR client | `src/irl.js` | `gpsState` (`:1123`), `onGPSPosition` (`:1227`), `initGPS`/`watchPosition` (`:1336`), `savePin` POST (`:1351`/`:1370`), `anchorGpsPin` (`:1313`), caption-confirm save (`:1456`), `loadNearbyPins` w/ caller coords (`:2009`/`:2016`) |
| My-pins management | `src/irl.js` | `openMyPinsSheet` (`:2514`), `loadMyPins` (`:2476`), `renderMyPins` (`:2501`), `deleteMyPin` (`:2531`), `revealMyPinsBtn` (`:2555`), button (`:2561`) |
| Presence opt-in (ghost) | `src/irl.js` | `getShareGhost`/`setShareGhost` (`:1820`), toggle (`:2578`), `syncGhostToggle` (`:2568`) — default **off** |
| DEV perf harness | `src/irl.js:4405` | `import.meta.env.DEV`-gated `__irlSeedPins` / `__irlSeedRoom` / `__irlPerf` — the pattern every dev-only tool in this epic mirrors |
| Pins API + table | `api/irl/pins.js` | `irl_pins` schema + `ensureTable` (`:167`), GET nearby (`:467`, radius clamp `:473`, IP rate-limit `:415`, owner-id-stripped projection `:504`), POST (`:554`, anon 7-day expiry `:668`), PATCH/calibrate (`:756`), DELETE (`:847`) |
| Permission / first-run | `src/irl/onboarding.js` | Single source of truth — `PERMS.location` (`:22`), designed prompt/granted/denied/unsupported states, persisted outcomes, state-kit |
| Map + geocode (reuse) | `src/dashboard-next/pages/irl-placements.js` | Leaflet lazy-loaded from `https://esm.sh/leaflet@1.9.4` (`:1083`), dark theme (`:339`), `reverseGeocode` via Nominatim (`:111`) — the canonical map approach to copy |
| Shared UI states | `src/shared/state-kit.js` | Skeleton / empty / error / retry shells — use everywhere |

---

## Task index

- **L1** `L1-simulated-location-dev.md` — DEV-gated simulated location (`?mockLoc=`
  + `__irlMockLocation()`) that bypasses geolocation and the insecure-context block.
  *The direct answer to "test on my iPhone without leaking my real location."* **S**
- **L2** `L2-map-placement-picker.md` — "Use my location" **or** "Pick a spot on a
  map" when placing. Leaflet picker + search. The real-user privacy + UX win. **M**
- **L3** `L3-location-privacy-center.md` — One designed in-app surface: what's
  stored, who sees it, precise/approximate discovery, presence opt-in, first-run
  disclosure. **M**
- **L4** `L4-proximity-read-hardening.md` — Coarsen the caller's coords on the
  nearby read (approximate discovery) + no exact-coordinate logging server-side.
  Closes the browsing-leak vector. **M**
- **L5** `L5-my-pins-management-upgrade.md` — Map overview of your pins, expiry
  countdown, and a guarded "Remove all from this device" purge. **S**

## Run order

```
L1  (independent — ship first; unblocks safe testing of everything below)
L3  (privacy control surface) ─> L4 (the approximate-discovery behavior it toggles)
L2  (placement picker — independent of L3/L4)
L5  (pin management — independent; nicer once L2 exists)
```

Suggested: **L1 → L2 → L3 → L4 → L5.** L1 first so every later task can be
exercised on a real device without leaking. L3 before L4 (L3 owns the toggle, L4
implements what it does).

---

## Ground rules for every task

- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  None of these tasks touch tokens; keep it that way.
- **No mocks / fake data in production.** L1's simulated location is a **DEV-only,
  tree-shaken harness** (gated behind `import.meta.env.DEV`, exactly like the
  existing `__irlSeed*` tools) — it must never exist in a production bundle. Every
  other task uses real GPS, real DB, real Leaflet/Nominatim.
- **Every state designed** — loading / empty / error / permission-denied /
  unsupported via `src/shared/state-kit.js`. No blank screens, no silent failures.
- **Errors at boundaries** — every `fetch` / sensor / map-load call fails into a
  retryable, human state. Rule 9: never let an error stand without a fallback.
- **Mobile-first** — this is a phone product. Test at 320 / 768 / 1440px; mind iOS
  Safari quirks (motion gesture, no WebXR, geolocation needs HTTPS or localhost).
- **Changelog** — L2, L3, L5 are user-visible → add a `data/changelog.json` entry
  (`feature`/`improvement`) and run `npm run build:pages`. L1 and L4's server log
  change are internal → no entry.
- **Each task file is self-contained** — copy its prompt into a fresh agent and it
  executes without this README.
