# D2 — Live viewer presence

## Goal

Show how many people are **currently viewing** a location, and optionally render
ghost markers/avatars of other live viewers nearby — so the IRL world feels
inhabited even when few pins are placed. Presence joins/leaves/heartbeats ride
the **same** geocell channel D1 opened. Privacy-aware: coarse location only,
opt-out by default-safe design.

## Why it matters

A pin is a static artifact; a *person also looking at this spot right now* is
social proof and a reason to stick around. "7 viewing nearby" turns a lonely AR
screen into a moment. It also primes D3 — once you can see co-located viewers,
you can show them ambient reactions to interactions.

## Why this is cheap (depends on D1)

D1 already establishes one Colyseus room per geocell with a viewer `MapSchema`
stub. Presence is just *populating and rendering that map* — no new transport,
no new worker. Colyseus already tracks join/leave (`onJoin`/`onLeave` in the
room) and delta-broadcasts schema changes, so "who is here" is free plumbing.

## Current state (real lines)

- `src/irl-net.js` (from D1) already joins `irl_world` with `{ geocell,
  deviceToken, agent, lat, lng }` and has a `presence` handler bucket.
- `multiplayer/src/rooms/IrlRoom.js` (from D1) holds `MapSchema<Viewer>`.
- Walk presence precedent: `multiplayer/src/schemas.js` `Player` carries
  `x/y/z/yaw` and the client renders peers — we render a far simpler ghost (a
  dot + count), not a full avatar, unless the viewer opted to share an avatar.
- `src/walk-net.js:199` `$players.onAdd/onRemove` is the exact callback shape we
  reuse for the viewer map.

## What to build

### 1. Viewer schema + heartbeat (server, `IrlRoom.js`)

```js
class Viewer extends Schema {       // append-only, like Player
  constructor() { super();
    this.id = '';          // ephemeral session id (NOT the device token)
    this.glat = 0; this.glng = 0;   // COARSE: snapped to geocell-6 center + jitter
    this.heading = 0;      // optional compass facing, for ghost orientation
    this.avatar = '';      // '' unless the viewer opted to share their avatar
    this.ghost = false;    // false = counted only, true = render a marker
    this.tsServer = 0;
  }
}
```

- `onJoin(client, { lat, lng, ghost, avatar })`: add a `Viewer`. **Server snaps
  `lat/lng` to the geocell center and adds bounded jitter** — never store or
  broadcast a viewer's precise GPS. `ghost` defaults `false` (count-only).
- `onMessage('heartbeat', { heading })`: refresh `tsServer`, update heading.
- A 30s reaper drops viewers whose last heartbeat is stale (covers silent
  disconnects / backgrounded mobile tabs that never fire `onLeave`).
- `onLeave`: remove the viewer → delta-broadcast.

### 2. Client (`src/irl-net.js` + `src/irl.js`)

```js
// irl-net.js — surface viewer add/remove + a derived count
irlNet.on('presence', ({ count, viewers }) => updatePresence(count, viewers));
setInterval(() => irlNet.heartbeat(cameraYaw), 15000); // 15s heartbeat

// irl.js — HUD chip + optional ghost markers
function updatePresence(count, viewers) {
  presenceChip.hidden = count <= 1;            // don't count "1" = just me
  presenceChip.textContent = `${count} viewing nearby`;
  if (!shareGhost) return;                      // opt-in to SEEING is always on;
  for (const v of viewers) renderGhost(v);      // opt-in to BEING SEEN gates send
}
```

- **Ghost marker**: a translucent billboard dot at the viewer's coarse position
  on the radar (`updateRadar()` at `irl.js:1230` — add a `.irl-radar-ghost`
  class) and, when `ghost:true`, a faint avatar/orb in the 3D scene. Ghosts are
  visually distinct from pins (lower opacity, no name, no tap target) so they're
  never mistaken for a placed agent.
- **Privacy default:** you always *see* the count. You only *broadcast yourself
  as a ghost* if you opt in via a toggle ("Appear to others nearby"), stored in
  `localStorage('irl_share_ghost')`, default **off**. Count-only presence uses
  geocell-center coords, so even non-opted viewers reveal nothing beyond "someone
  in this ~1km cell."

### 3. Presence chip + toggle UI (`pages/irl.html`)

- A small chip near the nearby badge: a pulsing dot + "N viewing nearby".
- A settings toggle in the existing controls row for "Appear to others nearby".

## Message shapes

| Direction | Type | Payload |
|---|---|---|
| client→server | join opts | `{ geocell, lat, lng, ghost, avatar }` (ghost/avatar only if opted-in) |
| client→server | `heartbeat` | `{ heading }` |
| server→client | `presence` (derived from Viewer MapSchema delta) | `{ count, viewers:[{ id, glat, glng, heading, avatar, ghost }] }` |

Presence rides the Colyseus `Viewer` MapSchema (delta-encoded), so a fresh
joiner sees the current crowd immediately and the wire cost is tiny.

## Data / API changes

- **None in Neon.** Presence is ephemeral and lives only in room memory — viewers
  are not pins and must never be persisted. (Storing live location is exactly the
  privacy risk we're avoiding.)

## Connecting / reconnecting / offline states (state-kit)

- Presence chip hidden while `connecting` and whenever the D1 transport is in
  poll-fallback (no WS = no live presence; never fake a count from the REST poll).
- On `offline`/`unavailable`: hide the chip and any ghosts cleanly (don't leave
  stale ghosts frozen on screen). Restore on reconnect.

## Acceptance checklist

- [ ] Two devices at the same geocell: each sees "2 viewing nearby".
- [ ] Third leaves/backgrounds → count drops within the 30s reaper window.
- [ ] Ghost toggle **off** by default; no viewer marker broadcast until opted in.
- [ ] Ghosts render distinct from pins (faint, no name, not tappable) on radar + scene.
- [ ] No precise GPS of any viewer ever leaves the client (coarse/jittered only).
- [ ] Chip hidden in poll-fallback and while connecting; restored on reconnect.
- [ ] No console errors; heartbeat does not flood (15s cadence).

## Out of scope

- Reactions to interactions → **D3**. Pin add/remove sync → **D1**. Full avatar
  walk simulation (that's `/walk`, not IRL). Account-level "friends nearby" — D2
  is anonymous-by-default presence only.

## Verify

`npm run dev:walk-all`, open `/irl` on two profiles at the same mocked GPS,
confirm the count, toggle ghost on/off on one and confirm the marker
appears/disappears on the other, then close one tab and watch the reaper drop it.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/D2-live-viewer-presence.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
