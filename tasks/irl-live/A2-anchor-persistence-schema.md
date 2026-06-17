# IRL-Live A2 — Anchor pose persistence schema

**Epic A · Effort: M · Depends on:** nothing (foundation; A1/A3/A4 depend on it)

## Goal

Extend `irl_pins` so a placement stores a full, reproducible **anchor pose** —
not just `lat/lng/heading`. Add columns for vertical offset, orientation, and
sensor-accuracy metadata so any later session or any other user can reconstruct
where the agent stands in the real world. Migrate `savePin()` to capture and
send the pose; update the POST handler in `api/irl/pins.js` to store it.

## Why it matters (user value)

Today a pin is a 2D dot with a compass heading. That loses the floor height
(agent floats or sinks indoors / on slopes), loses precise orientation, and
keeps no record of how trustworthy the GPS fix was. Persisting the full pose is
the prerequisite for A1 (WebXR anchors), A3 (everyone sees it in the same spot),
and A4 (gyro lock reproducing the placement). Without it, multiplayer anchoring
is guesswork.

## Current state (real files + lines)

- `api/irl/pins.js` — `ensureTable()` (lines 29–51) idempotently creates
  `irl_pins` with `id, user_id, agent_id, device_token, lat, lng, heading,
  avatar_url, avatar_name, caption, x402_endpoint, placed_at, expires_at`. POST
  (lines 130–167) inserts those. Nearby GET selects `heading` (lines 107–116).
- `src/irl.js` — `savePin(lat, lng, heading=0, caption='')` (line 837) POSTs
  `{ lat, lng, heading, caption, avatarUrl, avatarName, deviceToken, agentId }`.
  GPS accuracy/altitude are available on `pos.coords` in `onGPSPosition`
  (line ~794) but currently discarded; `EYE_HEIGHT = 1.6` (line 766).

## What to build

### 1. Idempotent migration (`api/irl/pins.js`, inside `ensureTable()`)

Keep the existing `CREATE TABLE IF NOT EXISTS`, then add columns with the same
idempotent pattern so it is safe on every cold start:

```js
async function ensureTable() {
  if (_tableReady) return;
  await sql`CREATE TABLE IF NOT EXISTS irl_pins ( /* …existing columns… */ )`;
  // Anchor pose — added 2026-06 for IRL-Live world anchoring (A2).
  await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS anchor_height_m  DOUBLE PRECISION`;
  await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS anchor_yaw_deg   DOUBLE PRECISION`;
  await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS anchor_quat      JSONB`;        // [x,y,z,w], optional richer orientation
  await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS gps_accuracy_m   DOUBLE PRECISION`;
  await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS altitude_m       DOUBLE PRECISION`;
  await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS anchor_source    TEXT`;          // 'webxr' | 'gyro-gps'
  await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS vps_provider     TEXT`;          // reserved for visual positioning
  await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS vps_id           TEXT`;          // reserved
  await sql`CREATE INDEX IF NOT EXISTS irl_pins_lat_lng ON irl_pins (lat, lng)`;
  await sql`CREATE INDEX IF NOT EXISTS irl_pins_expires ON irl_pins (expires_at)`;
  _tableReady = true;
}
```

`anchor_yaw_deg` is the canonical orientation A3/A4 read; `anchor_quat` is an
optional full-orientation upgrade for WebXR. `vps_provider/vps_id` are reserved
nullable columns — no provider is wired yet; they exist so A3's future
visual-positioning path needs no further migration. They reference no coin and
no third-party token; $THREE remains the only coin this platform references.

### 2. POST accepts pose (`api/irl/pins.js`, lines 130–167)

```js
const pose = body.anchor ?? {};
const [pin] = await sql`
  INSERT INTO irl_pins
    (user_id, agent_id, device_token, lat, lng, heading,
     avatar_url, avatar_name, caption, x402_endpoint, expires_at,
     anchor_height_m, anchor_yaw_deg, anchor_quat,
     gps_accuracy_m, altitude_m, anchor_source)
  VALUES (
    ${userId}, ${body.agentId ?? null}, ${body.deviceToken ?? null},
    ${lat}, ${lng}, ${parseFloat(body.heading) || 0},
    ${body.avatarUrl ?? null}, ${body.avatarName ?? null},
    ${body.caption ?? null}, ${body.x402Endpoint ?? null}, ${expiresAt},
    ${Number.isFinite(pose.heightM) ? pose.heightM : null},
    ${Number.isFinite(pose.yawDeg)  ? pose.yawDeg  : null},
    ${Array.isArray(pose.quat) ? JSON.stringify(pose.quat) : null},
    ${Number.isFinite(pose.gpsAccuracyM) ? pose.gpsAccuracyM : null},
    ${Number.isFinite(pose.altitudeM)    ? pose.altitudeM    : null},
    ${pose.source === 'webxr' ? 'webxr' : 'gyro-gps'}
  )
  RETURNING *
`;
```

Validate softly: a missing `anchor` object inserts NULLs and the pin still
works (back-compat with old clients). Clamp `gps_accuracy_m` to a sane range
(0–500 m); reject absurd `height_m` (> ±50 m) to NULL rather than store noise.

### 3. Read pose back (nearby + mine GETs)

Add `anchor_height_m, anchor_yaw_deg, anchor_quat, gps_accuracy_m, altitude_m,
anchor_source` to the SELECT column lists in the nearby GET (line 108) and the
`?mine=1` GET (line 84) so A3/A4 and the dashboard can consume them.

### 4. Capture pose in the client (`src/irl.js`)

- In `onGPSPosition` (line ~794), retain `gpsState.accuracy = pos.coords.accuracy`
  and `gpsState.altitude = pos.coords.altitude ?? null`.
- Change the signature to `savePin(lat, lng, heading=0, caption='', anchor=null)`
  and merge `anchor` into the POST body as `anchor: { heightM, yawDeg, quat,
  gpsAccuracyM: gpsState.accuracy, altitudeM: gpsState.altitude, source }`.
- For the existing gyro path (`setLocked`, line 713), pass
  `{ heightM: EYE_HEIGHT - <floor offset, default 0>, yawDeg: headingDeg,
  gpsAccuracyM: gpsState.accuracy, source: 'gyro-gps' }` so even today's
  placements persist real accuracy metadata.

## Data / API changes

- `irl_pins`: +`anchor_height_m, anchor_yaw_deg, anchor_quat, gps_accuracy_m,
  altitude_m, anchor_source, vps_provider, vps_id`. All nullable, additive.
- `POST /api/irl/pins`: optional `anchor` object in body.
- Nearby + mine GETs return the new fields.

## Acceptance criteria

- [ ] `ensureTable()` runs the `ADD COLUMN IF NOT EXISTS` migration idempotently;
      safe on a populated table and on repeat cold starts.
- [ ] POST stores pose when present; old clients (no `anchor`) still create a
      valid pin (NULL pose).
- [ ] Nearby + mine GETs return the new pose fields.
- [ ] `savePin()` captures and sends `gpsAccuracyM` + `altitudeM` from
      `pos.coords` for both gyro and (later) WebXR placements.
- [ ] Out-of-range height / accuracy values coerce to NULL, not stored.
- [ ] No other token referenced; `vps_*` columns are reserved + empty.

## Out of scope

- Using the pose to render (A1/A4) or to reconcile across users (A3).
- Any actual VPS provider integration — columns are reserved only.

## Verify

- Hit `POST /api/irl/pins` with and without an `anchor` body via a local mock
  `req/res` (dev proxies `/api` to prod, so exercise the handler directly per
  the `pump [action] shadows` memory note) — both 201.
- `SELECT column_name FROM information_schema.columns WHERE table_name='irl_pins'`
  shows the new columns after one request.
- Place a pin in `/irl` on a phone; confirm the row has non-NULL
  `gps_accuracy_m` and `anchor_yaw_deg`.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/A2-anchor-persistence-schema.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
