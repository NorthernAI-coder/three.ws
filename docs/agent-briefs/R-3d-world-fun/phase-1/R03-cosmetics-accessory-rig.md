# R03 — Cosmetics rig: wire the accessory GLBs to avatars

**Phase 1 (Foundation) · Depends on: nothing · Unblocks: R21, R23 (the entire avatar economy)**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Follow the off-schema networking pattern in R00. Server whitelists URLs like avatars.

## Goal

The GLBs in `public/accessories/` (baseball/beanie/cowboy hats, round/shades glasses, hoop/stud
earrings) are unused. Build attachment so a player can wear them, the wear state syncs to everyone,
and it survives avatar swaps. This rig is the foundation the Phase 4 economy sells against.

## Files

- `src/game/coincommunities.js` — the avatar build path (`buildAvatar` / `RemotePlayer`): add the
  bone-attachment logic and `equipCosmetic` / `unequip`.
- `multiplayer/src/schemas.js` — add a `cosmetics` field to the player schema.
- `multiplayer/src/rooms/WalkRoom.js` — sync `cosmetics` like `avatar`; whitelist accessory URLs.
- `src/game/community-net.js` — add a `setCosmetics()` send method.

## Spec

1. **Attachment.** After an avatar GLB loads, locate the head bone and the parent attachment
   points. Add `equipCosmetic(slot, url)` and `unequip(slot)` that load and parent an accessory
   GLB using a **per-slot offset table**: `hat` → top of head, `glasses` → eyes, `earrings` → ears.
   Tune offsets so each accessory sits correctly on the rig used by `/play` avatars.
2. **Schema + sync.** Add a `cosmetics` string field to the player schema, comma-separated
   `slot:url` (e.g. `hat:/accessories/hat-cowboy.glb,glasses:/accessories/glasses-shades.glb`).
   Sync it like the existing `avatar` field. Apply remote players' cosmetics on add **and** on
   change.
3. **Net send.** Add `community-net` `setCosmetics(cosmeticsString)` mirroring how the avatar is
   sent.
4. **Server whitelist.** Validate/whitelist accessory URLs server-side exactly like avatar URLs —
   reject anything not under the known accessory set. No arbitrary URLs.
5. **Survives swaps.** Equipped cosmetics must re-apply after an avatar swap (re-parent on the new
   rig), persist through the session, and never duplicate/orphan attachment nodes.

## Definition of done

- Equipping a hat shows it on **your** head and on **everyone else's** view of you.
- Cosmetics persist through the session and survive an avatar swap with no orphaned/duplicated
  meshes; `unequip` cleanly removes and disposes.
- Server rejects non-whitelisted accessory URLs.
- Verified in a real browser with two clients. No console errors/warnings; no leaks.
- Diff self-reviewed per the R00 / CLAUDE.md DoD.
