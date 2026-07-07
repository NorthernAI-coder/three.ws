# R05 — Kickable physics ball

**Phase 2 (Social playground) · Depends on: R01, R02 · Server-authoritative physics**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Reuse the R01 object channel and the R02 `kind` registry. The **server owns the physics**.

## Goal

Spawn a shared beach ball in `/play` that players kick by walking into it. All clients see the
same trajectory; it settles realistically and never desyncs badly.

## Files

- `multiplayer/src/rooms/WalkRoom.js` — `ball:kick` handler + server-side ball physics integration
  on the room tick; uses the R01 `objects` map (`kind:'ball'`).
- `src/game/world-objects.js` — register a ball mesh factory in the R02 `kind` registry.
- `src/game/coincommunities.js` — detect walk-into-ball collision intent and send `ball:kick` with
  an impulse derived from player velocity.

## Spec

1. **One ball per room**, `kind:'ball'`, spawned via the R01 object channel on room start, owned by
   the server (not a player).
2. **Kick intent** — when the local player walks into the ball, the client sends `ball:kick` with
   an impulse direction/magnitude derived from the player's velocity. Rate-limit the intent.
3. **Server physics** — on `ball:kick` the server applies velocity, then each tick integrates with
   **friction + world-radius bounce**, and streams position via the `objects` map (`obj:update`).
   The server validates the impulse (cap magnitude, sane direction) — never trust the client's
   raw values.
4. **Respawn** — auto-respawn at world center if the ball leaves bounds or on room start.
5. **Mesh** — the registered factory renders a recognizable beach ball; it interpolates via R02.

## Definition of done

- Any player can kick it; all clients see the same trajectory within interpolation tolerance.
- It settles realistically (friction), bounces off the world edge, and auto-respawns when lost.
- No bad desync, no client-trusted physics, no leaks. Verified with two clients in a real browser.
- Diff self-reviewed per the R00 / CLAUDE.md DoD.
