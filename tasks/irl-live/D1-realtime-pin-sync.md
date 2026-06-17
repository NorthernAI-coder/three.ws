# D1 — Realtime pin sync (the core multiplayer task)

## Goal

Replace the one-shot/poll `loadNearbyPins()` fetch with **live** sync: when anyone
places, moves, or removes a pin near you, it appears / updates / disappears on
your screen within ~1s, no reload. This is the keystone of Epic D — D2 (presence)
and D3 (interaction broadcast) ride the same channel.

## Why it matters

Today the data layer is *already* multiplayer (`GET /api/irl/pins` returns every
user's nearby pins), but the client only learns about new pins on the next fetch.
A shared world that updates only on reload doesn't feel shared. Liveness is the
difference between "an AR toy" and "a place where things are happening."

## Current state (real lines)

- `src/irl.js:901` `loadNearbyPins()` — fetches `/api/irl/pins?lat&lng&radius`,
  diffs against the in-memory `nearbyPins` array, removes vanished pins
  (`scene.remove`, `labelEl.remove()` at :914) and spawns arrivals via
  `spawnNearbyPin()` (:950). **This diff/reconcile logic is exactly what we keep**
  — D1 just feeds it from a live stream instead of a poll.
- `src/irl.js:884` `commitPin()` → `savePin()` (:837) POSTs the pin; the placer
  already knows its own pin id. Other viewers don't, until their next poll.
- `src/walk-net.js` — the existing Colyseus client wrapper: `connect()` with
  jittered single reconnect (:239), `_setStatus()` surfacing
  `idle|connecting|online|offline|failed|unavailable`, room message relay
  (`onMessage('chat')` :212). **Mirror this class shape exactly.**
- `multiplayer/src/index.js:189` `gameServer.define('walk_world', WalkRoom).filterBy(['coin','tier'])`
  — the matchmaking pattern we copy: a room instance per filter key.

## Recommended approach (honest)

**Reuse the existing Colyseus host (`wss://three-ws-multiplayer.fly.dev`), add a
new `irl_world` room keyed by geohash, AND keep poll-delta as a real fallback.**

- The walk server is a long-lived Colyseus process — Vercel can't host WS, so we
  do **not** add a new worker; we add one more `Room` class to the deployed host.
- A new room (not WalkRoom) because IRL has no avatars-walking schema; its state
  is the *set of pins in this geocell* plus *live viewers* (D2). Define it with
  `gameServer.define('irl_world', IrlRoom).filterBy(['geocell'])` so every viewer
  inside one coarse geohash lands in the same room instance.
- **Geohash room key:** geohash precision 6 (~1.2km × 0.6km cell). The client
  subscribes to its own cell **plus the up-to-8 neighbor cells** (standard
  geohash neighbor expansion) so pins straddling a cell edge inside
  `NEARBY_RADIUS` (150m) are never missed. One Colyseus connection, N filterBy
  joins is heavy — instead the room is keyed on the **center** cell and the
  server fans pins from neighbor cells into it (room holds a 3×3 cell window).
- **Poll fallback is not optional.** When the WS is `unavailable`/`failed`
  (production with no `irl-server` meta, offline, corporate WiFi blocking WS),
  fall back to the existing `loadNearbyPins()` on a 10s interval. The reconcile
  code is identical, so the rest of the app never knows which transport fed it.

## What to build

### 1. `src/irl-net.js` — IRL realtime client (mirror `walk-net.js`)

```js
import { Client, getStateCallbacks } from 'colyseus.js';
import { IrlState } from '../multiplayer/src/irl-schemas.js';
import { encodeGeohash } from './shared/geohash.js'; // precision-6, new tiny util

const ROOM = 'irl_world';

export class IrlNet {
  constructor({ lat, lng, deviceToken, agent, getServerUrl } = {}) {
    this.geocell = encodeGeohash(lat, lng, 6);
    this.status = 'idle'; // idle|connecting|online|offline|failed|unavailable
    this._handlers = { status: new Set(), 'pin:add': new Set(),
                       'pin:update': new Set(), 'pin:remove': new Set(),
                       presence: new Set() }; // presence → D2
    // …same on()/_emit()/_setStatus()/_scheduleReconnect() shape as WalkNet
  }
  async connect() { /* joinOrCreate(ROOM, { geocell, deviceToken, agent, lat, lng }, IrlState) */ }
  // Re-join a new cell when the viewer physically walks into a new geohash:
  async moveTo(lat, lng) {
    const cell = encodeGeohash(lat, lng, 6);
    if (cell === this.geocell) return;
    this.geocell = cell; await this.connect(); // leave old room, join new
  }
}
```

### 2. Server: `multiplayer/src/rooms/IrlRoom.js` + `irl-schemas.js`

- `IrlState` = `MapSchema<Pin>` (pin id → `{ id, lat, lng, heading, avatarUrl,
  avatarName, caption, x402Endpoint, agentId, ownerToken, placedAt }`) +
  `MapSchema<Viewer>` for D2. Append-only fields like `schemas.js` warns.
- `onCreate({ geocell })`: load the cell's current live pins from Neon
  (`SELECT … WHERE geocell IN (this + 8 neighbors) AND not expired`) into state.
- The room is the **broadcast hub, not the source of truth** — Neon stays
  authoritative (pins survive server restarts / Vercel POSTs). On a Vercel
  `POST /api/irl/pins`, the API publishes a `pin:add` to the room (see Data-API).
- `onMessage('pin:moved' | 'pin:removed', …)` validate ownerToken, persist, then
  schema-patch removes/updates the MapSchema entry → Colyseus delta-broadcasts.

### 3. Wire into `src/irl.js`

```js
// Replace the poll with a stream; keep loadNearbyPins() as the fallback path.
function startPinSync() {
  if (irlNet) irlNet.destroy();
  irlNet = new IrlNet({ lat: gpsState.lat, lng: gpsState.lng,
                        deviceToken: _deviceToken, agent: _currentAgentId });
  irlNet.on('pin:add',    p => reconcilePin('add', p));
  irlNet.on('pin:update', p => reconcilePin('update', p));
  irlNet.on('pin:remove', p => reconcilePin('remove', p));
  irlNet.on('status', ({ status }) => {
    setNetPill(status); // state-kit pill: connecting/live/offline
    if (status === 'unavailable' || status === 'failed') startPollFallback();
    else stopPollFallback();
  });
  irlNet.connect();
}
function reconcilePin(kind, p) {
  if (gpsPin?.id && p.id === gpsPin.id) return; // never spawn my own pin twice
  const existing = nearbyPins.find(n => n.id === p.id);
  if (kind === 'remove') { /* scene.remove + labelEl.remove, splice */ return; }
  if (existing) { /* update caption/heading/avatar; re-spawn GLB if changed */ return; }
  const entry = { ...normalize(p), group: null, labelEl: null, glbLoaded: false };
  nearbyPins.push(entry); spawnNearbyPin(entry); updateNearbyBadge();
}
```

- `normalize(p)` maps wire camelCase (`avatarUrl`) → the snake_case
  (`avatar_url`) the rest of `irl.js` already reads, so `spawnNearbyPin`,
  `openPinSheet`, and the radar are untouched.
- On GPS movement crossing a geocell boundary, call `irlNet.moveTo(lat, lng)`.

## Message shapes (wire contract)

| Direction | Type | Payload |
|---|---|---|
| server→client | `pin:add` | `{ id, lat, lng, heading, avatarUrl, avatarName, caption, x402Endpoint, agentId, placedAt }` |
| server→client | `pin:update` | same shape (caption/heading/avatar/location changed) |
| server→client | `pin:remove` | `{ id }` |
| client→server | `pin:moved` | `{ id, lat, lng, heading, ownerToken }` (relocate, D-side of C5) |
| client→server | `pin:removed` | `{ id, ownerToken }` |

Adds/updates/removes are delivered as **Colyseus schema deltas** off the pin
`MapSchema`, not bespoke `broadcast()` calls — so a late joiner gets the full
current set on join for free, exactly like walk players sync on connect.

## Data / API changes

- `irl_pins`: add `geocell TEXT` (generated precision-6 geohash, indexed) so the
  room and the nearby query both filter by cell. Backfill on migration.
- `POST /api/irl/pins` (`api/irl/pins.js:130`): after insert, fire-and-forget a
  publish to the room so other viewers see it immediately. Since Vercel can't
  hold the WS, POST to a small server ingress: `POST {irlServer}/publish` with
  `{ geocell, type:'pin:add', pin }`, authed by a shared `IRL_PUBLISH_SECRET`.
  Same for DELETE → `pin:remove`, PATCH → `pin:update`.
- New `multiplayer` route `POST /publish` (HTTP, not WS) that validates the
  secret and `room.broadcast`-equivalents into the matching geocell room.

## Connecting / reconnecting / offline states (state-kit)

- A net pill (reuse the walk HUD pattern): `connecting` (pulsing), `live` (green
  dot + "Live"), `offline` ("Polling" — fallback active, still functional),
  `unavailable` (silent; poll path). Never show a dead "reconnecting…" forever —
  after the single jittered retry, drop to poll and say "Polling".

## Acceptance checklist

- [ ] Two phones at the same spot: A places a pin, it appears on B within ~1s, no reload.
- [ ] A removes/relocates a pin → disappears/moves on B live.
- [ ] Walking across a geocell boundary re-joins the new room; pins stay correct.
- [ ] WS blocked (DevTools offline / kill server) → falls back to 10s poll, pill says "Polling", still works.
- [ ] Late joiner gets the full current pin set on join (schema sync), not just future deltas.
- [ ] My own pin is never double-spawned (`gpsPin.id` guard holds).
- [ ] No console errors; reconnect does not storm.

## Out of scope

- Presence counts / ghost viewers → **D2**. Interaction reactions → **D3**.
  Moderation / caps → **D4**. Cross-user anchor *accuracy* → A3. D1 only makes
  the pin set live.

## Verify

`npm run dev:walk-all` (Vite + Colyseus), open two browser profiles on
`/irl` at the same mocked GPS, place/remove pins, watch them sync. Then kill the
Colyseus process and confirm the poll fallback engages and the pill flips to
"Polling".

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/D1-realtime-pin-sync.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
