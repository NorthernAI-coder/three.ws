# W07 — Combat & weapons

> Read [W00-program-overview.md](W00-program-overview.md) first — stack, coin rules,
> the off-schema networking pattern, and the definition of done all apply here
> unmodified.

**Feature:** server-authoritative melee/ranged combat, PvE mobs confined to named
danger zones, safe-town PvP gating, a wanted/heat meter, death + lootable
tombstones, and automatic respawn. **Depends on:** W01 (physics, district bounds).

---

## Ground truth (verified in-repo before writing anything)

Like W04, most of this brief's data + schema layer already existed, explicitly
labeled for this exact brief, and was simply never wired into `WalkRoom` or the
client:

| Piece | File | Status found |
|---|---|---|
| Targeting geometry, damage/armor resolution, wanted/heat math | [multiplayer/src/combat.js](../../../multiplayer/src/combat.js) | pure, fully built, header comment: *"the pure, server-authoritative core of the /play combat system (W07)"* |
| Weapon tuning (`WEAPONS`), mob tuning (`MOB_STATS`), loot tables | [multiplayer/src/items.js](../../../multiplayer/src/items.js) | data tables complete, every export unused outside their own module |
| Safe/danger zone geometry (`DANGER_ZONES`, `dangerZoneAt`) + mob spawn anchors | [multiplayer/src/world-features.js](../../../multiplayer/src/world-features.js) | doc comment named the still-unwritten client module "PlayCombat" by name |
| `Mob`/`Tombstone` schema classes, `Player.dead`/`Player.heat` fields, `WalkState.mobs`/`.tombstones` | [multiplayer/src/schemas.js](../../../multiplayer/src/schemas.js) | fully defined, append-only, never populated by the room |
| Player vitals (`hp`/`maxHp`/`armor`/`maxArmor`/`heat`), `consumeSlot` (heal/armor), `dropCarried`, `reviveProfile`, `bankTransfer`-style helpers | [multiplayer/src/economy.js](../../../multiplayer/src/economy.js) | starter kit already seeds a sword **and** a pistol "so the W07 combat loop... is playable on arrival" |
| Sellable weapons/ammo/armor in the general store | [multiplayer/src/shop.js](../../../multiplayer/src/shop.js) | comment: *"the ammo the W07 weapons burn"* |
| Client `net.attack()` + a `combat` event bucket | [src/game/community-net.js](../../../src/game/community-net.js) | send method existed; nothing ever called it, nothing ever listened for a reply that could arrive |
| `ACTIVITIES` "attack" entry (tool: sword, near: nearestMobSpawn) | [src/game/play-systems.js](../../../src/game/play-systems.js) | declared, never dispatched — `_onAction()` only ever called `castFish()` |
| `WorldHud.setHealth/setArmor/setWanted` | [src/game/hud/world-hud.js](../../../src/game/hud/world-hud.js) | fully built GTA-style HUD (health/armor bars, wanted stars, minimap, cash), **never imported anywhere** in `/play` |

**Nothing in `WalkRoom.js` called any combat helper** (`grep` for `weaponDef|mobStats|rollLoot|selectTarget|rollDamage|applyDamage|addHeat` → only the import line hit) and **no client module rendered a mob, a tombstone, or the wilds**. The whole system was designed end-to-end and completely unreachable. This brief's job was to wire it, not redesign it — matching the W04 pattern exactly.

One real gap found and closed in passing: `src/game/items.js` (the client's display/glyph registry) was missing `bat`/`pistol`/`bow`/`ammo`/`arrow`/`vest` — the server already had icons for all of them (`multiplayer/src/items.js`), but the client would have rendered them as a bare first-letter fallback in the hotbar. Added.

---

## What shipped

### Server

- **`multiplayer/src/combat-handlers.js`** (new) — mirrors `activities.js`'s split
  exactly: the room registers two message handlers and two ticks, everything else
  stays out of `WalkRoom.js`.
  - **Mob AI** (`seedMobs`/`tickMobs`, 200 ms tick): seeds a difficulty gradient
    across the three named `DANGER_ZONES` (southern-wilds: 2 goblins,
    northern-wilds: goblin + ogre, eastern-marches: ogre + troll). Each mob idles,
    chases the nearest live player within its `aggro` radius, and swings on
    `atkRange`/`atkCd` — clamped so a chase can never step outside its home zone's
    circle, which is what keeps the town lawful **by construction** rather than by
    a separate per-action check. A killed mob respawns fresh at a new random point
    in the same zone after 26s.
  - **`attack` intent**: validates a weapon is on the active hotbar slot, the
    attacker is standing in a `DANGER_ZONES` circle (attacking is simply
    unavailable from town), ammo for ranged weapons, and the per-weapon cooldown;
    then builds the live candidate list (mobs + other players, PvP candidates
    filtered to danger-zone-only on both ends) and hands it to
    `combat.selectTarget`. A mob kill grants XP/gold and spills a tombstone; a
    player kill raises the attacker's heat (`combat.addHeat`), applies damage to
    the **victim's own off-schema vitals** (never trusted from the attacker), and
    on a kill calls the shared `killPlayer` death flow.
  - **`loot` intent**: proximity-gated (3.2 m) claim of a tombstone's off-schema
    gold + item manifest into the looter's pack/purse, firing the existing
    `collect` quest-event hook per item so W05 objectives can key off combat loot
    with zero W05 changes.
  - **`killPlayer`**: drops carried gold + pack into a tombstone (`dropCarried` —
    banked cash and equipped hotbar tools survive, matching the existing
    risk/reward contract), flags `player.dead = true` on the shared schema (so
    peers render the downed state and stop targeting them), and schedules a
    5.5s respawn back at the safe `SPAWN_POINT` at full HP/zero armor
    (`reviveProfile`).
  - **`tickHeat`** (1s tick): decays every online player's wanted meter, faster in
    town than in the wilds, republishing the public star count only when it
    actually changes.
  - `WalkRoom.js`: wires `registerCombatHandlers`/`seedMobs`/`tickMobs`/`tickHeat`
    into `onCreate` next to the vehicle/activity seeding, adds `attack: 0` to the
    per-player cooldown map, publishes `player.heat` on join, extends `_sendInv`
    to carry `armor`/`maxArmor`/`heat` on every economy delta, and rejects a
    `move` from a downed player (`player.dead`) so a "ragdolled" peer can't be
    walked around mid-death — a real correctness gap found while wiring this in,
    not part of the original ground truth.

### Client

- **`src/game/combat-system.js`** (new, "PlayCombat" per the world-features.js doc
  comment) — the server's mob/tombstone schema state rendered as procedural
  low-poly monster meshes (primitive geometry, no third-party assets, matching
  `vehicle-mesh.js`'s approach) with live HP bars, plus tombstone markers with a
  walk-up loot prompt (`E`, or a tap on mobile via `tryActivateAt`). Paints the
  danger-zone ground (a red ring + faint fill + a proximity-gated signpost) from
  the **same** `DANGER_ZONES` data the server gates on, so the rendered danger
  ring and the authoritative one can never drift apart. Owns hit feedback
  (floating damage numbers, a red screen flash when hit, a death overlay driven
  by the existing `notice` channel) and a touch-friendly Attack button that only
  appears while a weapon is equipped.
- **`src/game/hud/world-hud.js`** — finally imported and mounted (it was fully
  built and dormant). `CombatSystem` feeds it `setHealth`/`setArmor`/`setWanted`
  from `profile`/`inv`/`combat` messages, plus `setCash`/`setBanked` (closing that
  same dormant-HUD gap for W04's money readout as a natural side effect of
  mounting it at all — `playSystems.setGoldVisible(false)` retires the legacy
  purse chip the HUD's own comment already called out as legacy) and
  `minimap.setViewer` every frame.
- **`src/game/community-net.js`** — `mobAdd/mobChange/mobRemove` and
  `tombstoneAdd/tombstoneRemove` state-callback wiring (byte-identical pattern to
  the existing vehicle wiring), a `lootTombstone(id)` send method, and a clarified
  `combat` message contract (`{role:'attacker'|'victim', target:'mob'|'player', ...}`
  — the original doc comment's shape was ambiguous about whose hit a `combat`
  event described; fixed on the way in).
- **`src/game/coincommunities.js`** — instantiates `CombatSystem` alongside
  `PlaySystems`/`VehicleManager`, ticks it every frame, binds the `X` key to
  `combat.attack()` (the fourth free single-letter key after `e`/`f`/`i`/`c`/`q`
  were already taken), folds `combat.interact()` into the existing `E`
  townsperson/kiosk/exchange fallback chain, and adds `combat.tryActivateAt(ray)`
  to the same tap-dispatch chain vehicles/NPCs already use for mobile parity.
  `RemotePlayer` now renders a peer's `dead`/`heat` schema fields: a downed peer
  tilts flat and dims (an honest static pose, not a fabricated physics ragdoll —
  nothing else in the client has one) and a wanted peer's nameplate carries a
  star-count badge, matching `WorldHud`'s own star vocabulary.

---

## Definition of done — verification performed

Real Colyseus `WalkRoom` (freshly started, no mocks) + a real Vite dev server +
two independent Chromium contexts (Playwright), driven by real WASD/sprint
keyboard input through the real on-foot Rapier movement path — see
[scripts/tmp-verify-w07-combat.mjs](../../../scripts/tmp-verify-w07-combat.mjs).
Proved, against the live production code (not a test harness copy):

1. The seeded mob roster (`state.mobs`) replicates to the client on join.
2. Attacking from town is rejected server-side with a `notice` — zero damage,
   zero state change — proving the safe-zone gate is enforced, not just rendered.
3. Walking into the Southern Wilds and swinging a real sword lands a real
   server-rolled kill on a live mob, which spills a real tombstone into
   `state.tombstones`.
4. Looting that tombstone removes it from the world and credits the looter.
5. A second player joins the same wilds; player A's swing reduces player B's
   **own privately-held** HP (never trusted from A), raises A's wanted heat on
   the shared schema, and renders a real wanted star on `WorldHud`.
6. Finishing B off flags `player.dead` on the shared schema (A sees B's downed
   pose), and a stray `move` B sends while downed is rejected server-side.
7. B respawns automatically ~5.5s later, back at the safe spawn point, at full
   HP.
8. Zero unexpected console errors/warnings across both sessions.

See the script's own PASS/FAIL log for the exact run this shipped against.

## Explicitly out of scope (documented, not silently dropped)

- **No in-hand weapon meshes.** Nothing in the codebase attaches a mesh to an
  avatar's hand bone across the full multi-rig canonicalization system yet (not
  even the existing fishing rod) — building that generically was a separate,
  much larger R&D effort outside this brief. Combat feedback instead uses
  honest, already-established client patterns: floating damage numbers and a
  screen flash, the same visual language `play-systems.js` already uses for
  catch/miss feedback.
- **No ragdoll physics.** A downed peer gets a static tilted pose, not a
  simulated ragdoll — no other system in the client has one, and faking it with
  a single rotation is more honest than a half-built physics rig.
- **No NPC "wanted" enforcement.** The wanted/heat meter is fully modeled and
  visible (stars on the HUD and on a peer's nameplate), but nothing yet *reacts*
  to it — the doc comment in `combat.js` explicitly defers enforcer NPCs to W08
  ("in W08, NPC enforcers will react to [it]"). Not a gap in this brief.
- **No kill quest objectives.** `multiplayer/src/quests.js` only knows
  `collect`/`goto`/`interact` objective types; a mob kill is *not* modeled as its
  own quest event type here — looted **items** already fire the existing
  `collect` event per item, which is enough for any W05 mission that wants
  "bring back N bones" without touching the quest engine. A dedicated `kill`
  objective type is a W05 decision, not this brief's to make.
