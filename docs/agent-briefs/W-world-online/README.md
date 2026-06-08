# W — World Online program

Turning `/play` into a **GTA Online–class, high-quality 3D multiplayer world** (not isometric):
drivable open world, in-game economy, jobs/missions/heists, activities & races, combat, deep
avatar customization, and living NPCs — wallet-native to `$THREE`.

**Reuse-first, no engine switch.** We extend our live stack — three.js + Rapier + Colyseus
(already running in `/play` + `/walk`) — and port proven systems from our existing
`world.three.ws` framework. Reference repo for vehicle/ECS netcode: iErcann/Notblox.

## Read order

1. **[W00 — Program overview & shared architecture](W00-program-overview.md)** — READ FIRST.
   Stack, package allowlist, the off-schema networking pattern, coin rules, DoD, dependency
   graph. Every other brief assumes it.

## Briefs (one agent each, end-to-end)

| Brief | Feature | Depends on |
|-------|---------|------------|
| [W01](W01-open-world-foundation.md) | Open-world foundation (drivable, physics, day/night) | — |
| [W02](W02-vehicles-and-driving.md) | Vehicles & driving (Rapier raycast vehicle, networked) | W01 |
| [W03](W03-character-avatar-customization.md) | Character & avatar customization (avatar creator + selfie→3D + wardrobe) | — |
| [W04](W04-economy-and-money.md) | Economy & money (cash, bank/ATM, vendors, `$THREE` bridge) | — |
| [W05](W05-jobs-missions-heists.md) | Jobs, missions & heists (data-driven quest engine) | W04 |
| [W06](W06-activities-and-minigames.md) | Activities & minigames (gather/craft loop, races, arcade) | W04 (W02 for races) |
| [W07](W07-combat-and-weapons.md) | Combat & weapons (authoritative, zones, wanted) | W01 |
| [W08](W08-npcs-and-world-life.md) | NPCs & world life (traffic, vendors, quest-givers, mobs) | W01 |
| [W09](W09-social-and-crews.md) | Social & crews (crews, parties, profiles, minimap) | — |
| [W10](W10-hud-menu-and-gamefeel.md) | HUD, interaction menu & game-feel polish | W01 |

Suggested build order = the table order (W01 → W10). W01 unblocks the most.
