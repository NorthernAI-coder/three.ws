# Task 17 — Walk Page: Multiplayer (Colyseus Rooms)

## Priority: HIGH

## Objective
Enable multiple users to walk in the same shared space and see each other's avatars in real time. Build on the existing `multiplayer/` Colyseus workspace referenced in `pages/walk.html`'s `walk-server` meta tag.

## Scope
- Server: `multiplayer/` workspace (verify the existing Colyseus schema; extend if needed)
  - `WalkRoom` schema:
    - players: MapSchema of `{ id, avatarId, x, y, z, rotation, anim, gesture?, displayName? }`
    - chat: optional message log (last 20)
  - Tick rate: 20 Hz
  - Auto-create rooms by `roomCode` query param; default `lobby`
- Client: `src/walk-multiplayer.js`
  - On walk page load, if `?room=<code>` present (or always for default lobby), connect to Colyseus
  - Send local avatar position/rotation/anim state at 20 Hz (delta-only)
  - On peer join: fetch peer's avatar from `/api/avatars/<id>` and add to scene
  - On peer leave: remove from scene
  - On peer move: interpolate position smoothly (180 ms delay buffer)
  - Render peer name labels above their heads using the speech bubble system (task 15) for chat
- Production deployment:
  - Deploy `multiplayer/` to Fly.io (or use existing deployment if present)
  - Update `pages/walk.html` `<meta name="walk-server" content="wss://three-ws-multiplayer.fly.dev">` to the real host
- HUD additions:
  - Player count in top-right
  - "Share room" button → copies `https://three.ws/walk?avatar=<id>&room=<code>`

## Definition of Done
- Open `https://three.ws/walk?room=test` in two browser windows with different avatars → both see each other moving in real time
- Peer movement is smooth (interpolated, not jittery)
- Disconnect cleanly cleans up peer mesh
- Production Colyseus host responds within 100 ms p50
- No console errors

## Rules
Complete 100%. No stubs. No fake data. Real Colyseus server, real WebSocket connection, real avatar fetch for peers. Wire end-to-end.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/walk/17-walk-multiplayer.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
