# L4 — Proximity-read privacy hardening

> Epic · Size **M** · Touches `src/irl.js` (client coarsening) + `api/irl/pins.js`
> (logging/PII). Consumes the toggle from **L3**. Closes the browsing-leak vector.

## Goal

Make *browsing* `/irl` stop broadcasting the viewer's exact position. Two halves:

1. **Client (Approximate discovery):** when the L3 precision toggle is
   `approximate`, snap the caller's own `lat/lng` to a coarse grid (~75–150 m)
   before the nearby read, so the server only ever receives a fuzzed origin. The
   proximity radius still finds nearby agents; the viewer's precise position never
   leaves the device.
2. **Server (no exact-coordinate logging):** ensure `api/irl/pins.js` never writes
   precise caller coordinates to logs, and document retention. The endpoint already
   strips owner ids from the response and IP-rate-limits scraping — this closes the
   remaining "our own logs know where everyone stood" gap.

## Why it matters

Placement is the obvious leak, but the quieter one is **reads**: every ~10 s,
`loadNearbyPins` sends the viewer's exact GPS to the server to ask "who's near me?"
A user who never places a single pin is still continuously telling the backend
(and any log sink) precisely where they are. For a location product, hardening the
read is as important as hardening the write — and "Approximate" is the concrete
lever L3 promises the user. Coarsening client-side means the precise coordinate is
never transmitted at all, which is strictly stronger than trusting the server to
forget it.

## Current state (real lines)

- `src/irl.js:2009` `loadNearbyPins()` → `src/irl.js:2016`
  `fetch('/api/irl/pins?lat=${gpsState.lat}&lng=${gpsState.lng}&radius=${NEARBY_RADIUS}')`
  — sends full-precision coordinates on every poll.
- `api/irl/pins.js:467` the GET nearby branch parses `lat`/`lng` (`:468`), clamps
  `radius` to ≤60 m (`:473`), IP-rate-limits the read (`:415`), and projects out
  `user_id`/`device_token` (`:504`). No caller-coordinate logging exists today —
  **keep it that way and assert it** (a future `console.log(req.query)` would regress this).
- L3 provides `getDiscoveryPrecision()` (default `precise`).

## What to build

### 1. Client-side coarsening (the Approximate behavior)

In `loadNearbyPins`, when `getDiscoveryPrecision() === 'approximate'`, snap the
origin to a fixed grid before building the URL:

```js
// ~111 m per 0.001° lat. Snap to a ~150 m cell so the exact origin never leaves the device.
const CELL_DEG = 0.0015;
function coarsen(v) { return Math.round(v / CELL_DEG) * CELL_DEG; }

const precise = getDiscoveryPrecision() !== 'approximate';
const qLat = precise ? gpsState.lat : coarsen(gpsState.lat);
const qLng = precise ? gpsState.lng : coarsen(gpsState.lng);
```

Send `qLat/qLng`. Because the snapped origin can sit up to ~one cell from the true
position, **widen the request radius by one cell** in approximate mode (still
clamped server-side to 60 m) so a nearby agent isn't missed, and keep computing the
on-screen distance/threshold against the *true* `gpsState` locally (the server's
`distance_m` is advisory; the client already places pins from the live origin).
Document the precision/recall trade-off in a comment — approximate trades a little
placement precision for not transmitting an exact position.

### 2. Server: assert no exact-coordinate logging + retention note

- Audit the GET path in `api/irl/pins.js` and add a short comment at `:467`
  stating the contract: **caller `lat`/`lng` are used for the proximity query and
  are never logged.** If any debug log of `req.query`/coords exists anywhere on this
  path, remove it.
- Add a one-line note (in the file header or near `ensureTable` `:167`) that
  `irl_pins` stores placement coordinates only; proximity *reads* are not persisted
  beyond the rate-limit counter (which keys on IP, not coordinates).
- Keep the existing IP rate-limit + owner-id-stripped projection exactly as-is.

### 3. No behavior change when precise

Default is `precise`, so unless the user opted into Approximate in L3, the read is
byte-identical to today. This task adds a lever, it doesn't degrade the default
experience.

## Data / API changes

- **No schema or endpoint signature change.** Same `GET /api/irl/pins?lat&lng&radius`.
- Client may send a slightly larger `radius` in approximate mode (server still clamps ≤60 m).
- Documentation/comments only on the server; a possible deletion of any stray
  coordinate log line.

## Acceptance checklist

- [ ] In Approximate mode, the nearby request URL carries a grid-snapped `lat/lng` (verify in Network tab — the exact `gpsState` value is **not** present).
- [ ] In Precise mode, the request is unchanged from today.
- [ ] Nearby agents within the radius still resolve in approximate mode (radius widened by one cell, on-screen distances computed from the true origin).
- [ ] `api/irl/pins.js` GET path provably logs no caller coordinates; contract comment added; retention note added.
- [ ] Existing IP rate-limit + owner-id-stripped projection untouched.
- [ ] No console errors; precise-mode behavior identical to pre-change.

## Out of scope

The toggle UI + persistence (L3). Placement coordinate privacy (L2 — placement is
a deliberate, user-chosen write; this task is only about the passive read).
Server-side geofuzzing of *stored* pins (placement stays precise so the AR walk-up
works).

## Verify

`npm run dev` → `/irl` with a fix (real or L1 mock): in Precise mode confirm the
nearby URL has full-precision coords; flip to Approximate (L3) and confirm the URL
coords are snapped to the grid while nearby agents still render. Grep the server
path to confirm no coordinate is logged.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-location-control/L4-proximity-read-hardening.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
