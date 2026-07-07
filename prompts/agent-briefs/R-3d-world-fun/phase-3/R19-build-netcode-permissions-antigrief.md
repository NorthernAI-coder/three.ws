# R19 — Build netcode hardening + permissions + anti-grief

**Phase 3 (Sandbox building) · Depends on: R17, R18 · Server-authoritative**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. All enforcement is server-side. Limits must be **surfaced in the UI — no silent failures.**

## Goal

Server-side validation for builds: ownership, per-player caps, rate limits, bounds, and a simple
grief guard. Plus a creator "clear area" moderation tool. Griefing is bounded; ownership enforced.

## Files

- `multiplayer/src/rooms/WalkRoom.js` — build validation on `obj:spawn` / `obj:remove`: ownership,
  caps, rate limits, bounds, grief guard, creator clear-area.
- `src/game/coincommunities-ui.js` — surface limits/denials to the user; creator clear-area control.
- `src/game/coincommunities.js` — reflect rejected placements (no ghost left behind) and show why.

## Spec

1. **Ownership** — only the placer may delete a piece, **except** the coin creator, who may delete
   any piece in their world. Enforce server-side; never trust the client's claim of ownership.
2. **Caps & limits** — per-player placement cap, per-room density cap, rate limit on spawns, and
   world-radius bounds. These build on R01's generic caps but add build-specific tuning.
3. **Grief guard** — disallow burying the spawn point or the totem, and cap density per tile so a
   single user can't wall off the world.
4. **Creator moderation** — a creator-only "clear area" action (and/or clear-all-in-radius) for the
   coin owner, validated server-side.
5. **Surface everything** — when a placement is rejected (cap hit, too dense, protected zone,
   rate-limited), the UI tells the user clearly and removes the failed ghost. **No silent failures.**

## Definition of done

- Griefing is bounded; ownership enforced; creator moderation works; all limits are clearly
  surfaced in the UI with no silent failures.
- All enforcement is server-side and survives malicious clients. No console/server errors.
- Verified with two clients (including a non-owner trying to delete and an over-cap user).
  Diff self-reviewed per the R00 / CLAUDE.md DoD.
