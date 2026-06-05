# R01 — Server: generic world-object state sync

**Phase 1 (Foundation) · Depends on: nothing · Unblocks: R02, R05, R17, R18 (the entire object pipeline)**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Follow the off-schema networking pattern described in R00. Server is authoritative.

## Goal

Extend the multiplayer server so worlds can hold shared, networked **objects** — not just players.
Balls, thrown props, placed build pieces, pickups. This is the single channel every later object
feature (ball, confetti, blocks, props) reuses, so it must be generic and bulletproof.

## Files

- `multiplayer/src/schemas.js` — add the `WorldObject` schema + `objects` map on world state.
- `multiplayer/src/rooms/WalkRoom.js` — add the `obj:*` message handlers, rate limits, bounds,
  and disconnect cleanup. Match the existing chat/emote limiter style exactly.

## Spec

1. **Schema.** Add a `WorldObject` schema with fields: `id` (string), `type` (string), `x`, `y`,
   `z` (number), `yaw` (number), `scale` (number), `ownerId` (string), `vx`, `vy`, `vz` (number),
   `kind` (string), `ts` (number). Add `objects: MapSchema<WorldObject>` to the world state schema.
   Keep field types consistent with how players are declared in the same file.
2. **Message handlers** in `WalkRoom.js`:
   - `obj:spawn` — validate payload, assign/accept an `id`, set `ownerId` to the sender, clamp
     position to world radius, stamp `ts`, add to the `objects` map.
   - `obj:update` — only the owner (or server-owned objects, see R05) may move an object; clamp
     to bounds; update position/rotation/velocity.
   - `obj:remove` — only the owner (or coin creator) may remove; delete from the map.
3. **Anti-cheat & limits** — mirror the existing avatar/chat limiter style:
   - Per-client rate limit on each handler (reuse the limiter pattern already in the room).
   - Clamp all positions to the world radius; reject NaN/Infinity/out-of-range payloads.
   - Cap total objects per room (~200) and per player (~30). Reject over-cap spawns; do not crash.
4. **Lifetime** — server owns object lifetime. On owner disconnect, clean up that owner's
   non-persistent objects (persistence comes later in R17; do not build it here).
5. **Document the protocol** in a top-of-file comment block: every message name, its payload
   shape, who is authorized, and the limits. Later briefs read this comment instead of the code.

## Definition of done

- Schema compiles; `objects` map replicates with no schema-encoding errors.
- Each handler is rate-limited, bounds-clamped, and cap-bounded; bad payloads are rejected
  cleanly (no unhandled throw, no room crash).
- **No client changes** are needed for this brief — existing `/play` and `/walk` still connect and
  behave identically (verify both load and a second client still sees you move).
- Protocol documented in the top comment. Diff self-reviewed per the R00 / CLAUDE.md DoD.
