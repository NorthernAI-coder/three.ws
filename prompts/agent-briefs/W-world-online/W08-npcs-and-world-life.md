# W08 — NPCs & world life

> Read [W00-program-overview.md](W00-program-overview.md) first — stack, coin rules, the
> off-schema networking pattern, and the definition of done all apply here unmodified.

**Feature:** traffic, vendors, quest-givers, and mobs — the living-world layer that makes a
coin world feel inhabited rather than a stage set with a few paid-service NPCs on it.
**Depends on:** W01 (open-world foundation).

> Like [W03](W03-character-avatar-customization.md) and
> [W04](W04-economy-and-money.md), this file didn't exist when this pass started — the
> README/W00 table referenced `W08-npcs-and-world-life.md`, but a large share of the actual
> system was already built (dated 2026-07-04, before this pass) and only wired up to a point.
> Filed alongside the change that closes the remaining gap.

---

## Ground truth (verified in-repo before writing anything)

Most of "traffic" and "vendors" were **already fully shipped**, and most of "quest-givers"
was **fully built server-side and completely unreachable** — the same "designed but nobody
ever called it" shape W04 found for the cash economy:

| Piece | File | Status found |
|---|---|---|
| Deterministic nav graph (pedestrian loops + ring road, W01-navmesh-ready) | [src/game/npc/nav-graph.js](../../../src/game/npc/nav-graph.js) | shipped, real |
| Ambient pedestrians + traffic (client-side, deterministic, non-authoritative) | [src/game/npc/ambient-life.js](../../../src/game/npc/ambient-life.js) | shipped, real, wired into `WorldLife` |
| Vendor NPCs (Agent Exchange x402 roster + W04 general-store/bank + W03 boutique) | [src/game/npc/npc-catalog.js](../../../src/game/npc/npc-catalog.js), [economy-npcs.js](../../../src/game/npc/economy-npcs.js) | shipped, real |
| Hostile mobs (visual + nav half, gated on a `window.twsCombat` contract) | [src/game/npc/mobs.js](../../../src/game/npc/mobs.js) | shipped, correctly asleep — W07 doesn't exist yet |
| Quest engine: mission registry, daily rotation, objectives, heist crew instances, rewards | [multiplayer/src/quests.js](../../../multiplayer/src/quests.js) | **fully built, fully wired server-side** (`WalkRoom` `questReq`/`questAccept`/`questAbandon`/`questInteract` handlers all real) |
| Quest zones (goto/interact world positions the server validates against) | [multiplayer/src/quest-zones.js](../../../multiplayer/src/quest-zones.js) | fully built server-side; header comment names the exact gap: *"the client (quest-systems — renders the markers...)"* was never written |
| Client network methods (`requestQuests`/`questAccept`/`questAbandon`/`questInteract`, `quests`/`questComplete` events) | [src/game/community-net.js](../../../src/game/community-net.js) | wired, **zero consumers** |
| `giver` field on every mission | [multiplayer/src/quests.js](../../../multiplayer/src/quests.js) | comment: *"in-world quest-giver label (W08 NPCs hook this; today it's flavour)"* |

**The actual gap:** six missions across five named givers (Dockmaster Reyes, Warden Okoro,
Cook Mara, Foreman Dell ×2, The Fixer) had zero physical presence in the world and zero
client UI — a player could never discover, accept, track, or see the reward for a single job,
despite the entire server-authoritative engine (daily rotation, prereqs, per-objective
progress, heist crew splitting) being complete and correct. This brief's job was to build the
missing client half and hook the givers up, not touch the engine.

---

## What shipped

### Quest-giver NPCs (`src/game/npc/quest-npcs.js`, new)

One `Npc` per named giver, using the same data-driven engine every other townsperson uses
(`npc.js`/`world-life.js` — proximity ring, "press E" prompt, in-character greeting). Placed a
few metres clear of their own mission's quest zones (never blocking the objective marker) and
clear of every other NPC cluster:

- **Dockmaster Reyes** (24, 4) — `daily-anglers-haul` (catch 5 fish).
- **Warden Okoro** (6, 36) — `daily-grounds-survey` (patrol 3 lookouts, pure movement).
- **Cook Mara** (-24, -16) — `stock-the-kitchen` (catch 12 fish, repeatable).
- **Foreman Dell** (26, -6) — `harbor-courier` (pickup/dropoff run) and `welcome-to-work`.
- **The Fixer** (44, 0) — `vault-job` (2-player co-op heist).

Pressing E opens the Jobs Board scrolled straight to that giver's mission (`world.openQuests
(highlight)`), the same physical-storefront pattern W03's boutique NPCs and W04's store/bank
clerks already established.

### Quest-zone waypoints (`src/game/npc/quest-markers.js`, new)

The client half `quest-zones.js`'s own header comment said was missing. Renders a ground ring
+ floating waypoint chip for every zone tied to the **current objective** of any of the
player's active missions (not the whole registry — accept nothing, see nothing). Driven purely
by the `quests` snapshot the server already sends, so it's automatically correct after every
accept/abandon/progress tick. Interact-kind zones (courier pickup/dropoff, the two alarm
terminals, the vault door) additionally contend for `world-life.js`'s single shared "press E"
prompt against NPCs — whichever is actually closer wins — and pressing E there sends
`net.questInteract()`; the server re-derives the zone from the player's own authoritative
position, same anti-cheat posture as every other off-schema action. Goto zones (the three
survey lookouts) get a waypoint only — the server already auto-completes them from real
movement (zone-entry edge detection), so there's nothing to press.

### Jobs Board UI (`src/game/quests-ui.js` + `quests-ui.css`, new)

A Board tab (available offers — title, giver, summary, objective preview, reward, an "Accept"
button, heist offers flagged with the crew size they need) and an Active tab (every accepted
run with a live per-objective checklist — done/current/upcoming — and an "Abandon" button).
Reuses the exact `EconPanel` shell W04's store/bank modals already built (now exported from
[economy-ui.js](../../../src/game/economy-ui.js) instead of forked) so it reads as the same
family of walk-up counter, not a new design language. Opening from a specific giver flashes and
scrolls to that giver's row once. Also reachable directly from the HUD's new **Jobs** button
(`src/game/coincommunities-ui.js`, mirroring the existing Shop/My Fits buttons) — a player who
hasn't found a giver yet can still browse.

### Wiring (`src/game/coincommunities.js`, `world-life.js`)

- `WorldLife`'s NPC list gained `questNpcsFor()` alongside the existing Agent Exchange +
  economy rosters; its constructor now also owns a `QuestMarkers` instance.
- The shared proximity prompt/interact dispatch (`_nearestNpc` → `_nearestInteractable`) now
  picks whichever is closer — an NPC or an in-range interact quest zone — so the world never
  shows two competing prompts.
- `world.openQuests(highlight)` calls a new `_toggleQuests()` method (lazy-imports
  `quests-ui.js` so the panel chunk isn't in the initial bundle), mirroring `_toggleShop`/
  `_toggleWardrobe`.
- A global `net.on('questComplete', ...)` listener toasts every payout (`"<title> complete —
  +<gold> cash"`, success tone) even when the board panel isn't open — `WalkRoom` sends
  `questComplete` as its own event, not a generic `notice`, so without this a completed job
  would otherwise pay out in total silence.

### Docs

- [STRUCTURE.md](../../../STRUCTURE.md) gained a row for this surface.

---

## Explicitly out of scope (documented, not silently dropped)

- **Mobs stay asleep.** `mobs.js` already implements the full visual + nav-graph chase logic,
  gated behind `window.twsCombat` (W07). Building W07 to light it up is a different, much
  larger brief (health/armor, wanted levels, weapons, safe zones) with no design spec here —
  out of scope for "NPCs & world life" specifically. Confirmed still correctly inert:
  `MobSystem.enabled` is `false` with no combat contract present, and it spawns nothing.
- **`WorldHudSystem` (the W10 HUD layer with `setObjective`/`clearObjective`, the minimap, the
  radial "Missions" menu item) is still completely unwired into `coincommunities.js`** — a
  pre-existing gap from before this pass (zero importers), not something this brief's scope
  covers. The Jobs Board panel itself is the source of truth for objective progress today;
  wiring the ambient HUD objective card is W10's job when that pass lands.
- **No new "mob" content, no new traffic vehicle types.** Ambient life's existing pedestrian/
  vehicle counts and behavior were already tuned and shipped; this brief didn't touch them.

---

## Definition of done

Inherits [W00](W00-program-overview.md)'s full DoD. Checked off:

- [x] Reuses the existing off-schema architecture and `world.three.ws`-style patterns — the
      quest engine, quest zones, and network plumbing were untouched; only the missing client
      (NPCs, waypoints, panel) was added.
- [x] Server-authoritative: the panel only ever sends intents (`questAccept`/`questAbandon`/
      `questInteract`); the server's `quests`/`questComplete`/`notice` replies are the only
      thing that changes rendered state. A quest zone "interact" is re-derived from the
      player's server-tracked position, never trusted from the client.
- [x] Every new networked action reuses an existing, already-rate-limited handler
      (`ACTION_RATES.quest`/`questInteract` predate this pass) — no new message types added.
- [x] Dev server run, feature exercised in a real (headless) browser against a freshly-started
      Colyseus `WalkRoom`, zero unexpected console errors/warnings.
- [x] Loading/empty/error states: the Board tab's empty state explains daily rotation and
      repeatable availability; the Active tab's empty state points back to the Board/an NPC;
      a failed accept (already active, daily done, prereqs unmet) surfaces the server's own
      reason text via the existing `notice` toast.
- [x] Mobile/touch: quest-giver NPCs and interact-zone waypoints both hit-test through the
      same `tryActivateAt` raycast every other NPC already supports.
- [x] `data/changelog.json` entry added.
- [x] Gaps intentionally left open (mobs/W07, `WorldHudSystem`/W10) are documented above, not
      silently dropped — neither blocks a working, demoable feature.

**W08 done when:** a player can walk up to any of five quest-giver NPCs (or open Jobs from the
HUD), see the real server-priced board, accept a job, see a waypoint appear at its objective,
walk there (goto auto-completes; interact zones offer their own "press E"), and receive a real
cash payout with a toast — all server-authoritative, the ambient crowd/traffic reading
identically for every player in the world the whole time. **Verified for real** against a
local Vite dev server + a freshly-started Colyseus `WalkRoom` — no mocked physics, no mocked
network, no mocked quest data — see `scripts/tmp-verify-w08-*.mjs` (deleted after use per
CLAUDE.md repo hygiene; see [PORT-CHECKLIST.md](PORT-CHECKLIST.md) for the dated run details).
