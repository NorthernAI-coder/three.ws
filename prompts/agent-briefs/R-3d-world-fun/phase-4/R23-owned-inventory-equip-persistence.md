# R23 — Owned-cosmetics inventory + equip persistence

**Phase 4 (Avatar economy) · Depends on: R03, R22**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Ties the R03 rig to durable ownership — equip state persists across sessions AND worlds.

## Goal

A "My Cosmetics" inventory of owned items; equipping persists to the account and re-applies on next
login and across worlds (`/play` and `/walk`).

## Files

- `src/game/` — a "My Cosmetics" inventory UI (or shop tab) reading the R22 ownership store.
- The account/equip persistence store (same provider the economy uses) — save equipped slot→item.
- `src/game/coincommunities.js` and the `/walk` avatar build path — restore equipped cosmetics on
  load via the R03 `equipCosmetic`.
- `multiplayer/src/rooms/WalkRoom.js` — ensure restored equip state syncs to other players via the
  R03 `cosmetics` field.

## Spec

1. **Inventory UI** — "My Cosmetics" lists owned items (from the R22 ownership store) with
   equipped/unequipped state, rarity, and preview. Designed empty (nothing owned → links to shop)/
   loading/error states.
2. **Equip persistence** — equipping writes the equipped slot→item to the account store. On next
   login, equipped cosmetics are restored automatically via the R03 rig.
3. **Cross-world** — equip state applies in **both** `/play` and `/walk` (and any world using the
   shared avatar build path), not just the world it was set in.
4. **Sync** — restored equip state propagates to other players through the R03 `cosmetics` schema
   field so everyone sees your fit.
5. **Consistency** — owned-only can be equipped; unequip persists too; no orphaned attachments on
   re-login or world switch.

## Definition of done

- Owned cosmetics persist across sessions and worlds; equip state is restored on login; equipping
  is reflected to other players.
- Inventory states (empty/loading/error) designed and helpful. No console errors/warnings, no leaks.
- Verified across a logout/login and a `/play`↔`/walk` switch with two clients. Diff self-reviewed per DoD.
