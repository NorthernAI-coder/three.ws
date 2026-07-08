# W03 — Character & avatar customization

> Read [W00-program-overview.md](W00-program-overview.md) first — stack, coin rules, the
> off-schema networking pattern, and the definition of done all apply here unmodified.

**Feature:** avatar creator (design-from-scratch or selfie→3D) + a server-authoritative wardrobe
economy, with a physical presence in the world. **Depends on:** nothing (buildable standalone).

> This file didn't exist when this pass started — `README.md` and `W00-program-overview.md`
> both referenced it, but the brief itself was never written. Filed alongside the change it
> describes, same as [W04-economy-and-money.md](W04-economy-and-money.md).

---

## Ground truth (verified in-repo before writing anything)

Almost everything this brief asks for already existed, already wired into `/play`, and already
real — no mocks, no stub catalog, no fake payment flow:

| Piece | File | Status found |
|---|---|---|
| Pre-game "Create your avatar" flow (design/selfie, `.glb` upload, Advanced Studio) | [src/game/coincommunities-ui.js](../../../src/game/coincommunities-ui.js) `_openCreate()` | fully wired, all three paths real |
| Selfie→3D SDK wrapper | [src/avatar-creator.js](../../../src/avatar-creator.js) | real `@avaturn/sdk` integration, no mock |
| Cosmetics shop (browse/preview/buy) | [src/game/cosmetics-shop.js](../../../src/game/cosmetics-shop.js) | real `/api/cosmetics/catalog` fetch, real x402 purchase |
| Wardrobe (owned items, equip) | [src/game/cosmetics-wardrobe.js](../../../src/game/cosmetics-wardrobe.js) | real server-echoed profile, no hardcoded list |
| Equip persistence | [multiplayer/src/rooms/WalkRoom.js](../../../multiplayer/src/rooms/WalkRoom.js) `equip-cosmetic` | server-validated, persisted to account |
| Vendor stall spawn points | [src/game/world-zones.js](../../../src/game/world-zones.js) | 2 points reserved since W01, comment: *"Vendor stalls ringing Downtown (economy / shop briefs)"* — zero consumers |
| Interactive-NPC engine | [src/game/npc/npc.js](../../../src/game/npc/npc.js), [world-life.js](../../../src/game/npc/world-life.js), [npc-catalog.js](../../../src/game/npc/npc-catalog.js) | reusable, no cosmetics-vendor NPC registered |

**The actual gap:** cosmetics customization was real end-to-end but reachable only from a HUD
menu button — no physical storefront, unlike every other economy interaction in `/play` (which
is NPC-fronted: the Agent Exchange roster in `npc-catalog.js`). This brief's job was to give the
existing, already-real shop/wardrobe system a place to stand in the world, not to rebuild it.

### A collision with the concurrent W04 pass, and how it was resolved

`world-zones.js`'s two reserved `vendor` stalls looked like the obvious home for boutique NPCs —
until the concurrently-running W04 (economy & money) pass claimed both of them for its
general-store clerks (a legitimate reading of "vendor": a general store is a vendor too). Rather
than fight over the same coordinates, the boutique got its own `type: 'boutique'` pair in
`world-zones.js`, mirrored onto the plaza's other diagonal (`(44,44)`/`(-44,-44)` vs. the
general store's `(44,-44)`/`(-44,44)`) so the two features never stand on top of each other.
Same reserved-spawn-point pattern, just a second reservation instead of a fight over the first.

---

## What shipped

### World data (`src/game/world-zones.js`)

- Two new `type: 'boutique'` spawn points — `boutique-se` `(44, 44)` and `boutique-nw`
  `(-44, -44)` — following the exact registry pattern every other spawn type already uses
  (`spawnsOfType()`), so nothing hardcodes duplicate coordinates.

### NPCs (`src/game/npc/npc-catalog.js`)

- **Roux · Tailor** at `boutique-se` — `prompt: 'Browse the wardrobe'`, `onInteract` calls
  `world.openShop()`.
- **Nell · Fitting Room** at `boutique-nw` — `prompt: 'Open your fits'`, `onInteract` calls
  `world.openWardrobe()`.

Both use the same `Npc`/`WorldLife` engine every other townsperson in the plaza uses — proximity
ring, "press E" prompt, in-character greeting line + emote on interact. No new rendering or
interaction code; two data-driven catalog entries.

### Wiring (`src/game/coincommunities.js`)

- The `world` config object passed into `new WorldLife({...})` gained `openShop` and
  `openWardrobe` callbacks, bound to the exact same `_toggleShop()` / `_toggleWardrobe()`
  methods the HUD's Shop / **My Fits** buttons already call — one system, two entry points, zero
  duplicated panel logic.

### Docs

- [docs/character-studio.md](../../../docs/character-studio.md) gained a "Character
  customization in `/play` (World Online)" section: the lobby creation flow, the shop/wardrobe
  economy, and the new boutique NPCs, written for a reader with zero prior context.

---

## Verified for real

Against a local Vite dev server (`npm run dev`) + a freshly-started local Colyseus `WalkRoom`
(`npm run start` in `multiplayer/`) — no mocked physics, no mocked network, no mocked catalog,
no mocked SDK:

[scripts/tmp-verify-w03-boutique.mjs](../../../scripts/tmp-verify-w03-boutique.mjs) drives a
real headless Chromium session through:

1. The lobby's **Design your avatar** card opens `AvatarCreator`, which fires a real network
   request to `avaturn.*` — the selfie→3D SDK is genuinely wired, not a stub.
2. The player joins the `$THREE` world over a real Colyseus session
   (`window.__CC__.phase === 'world'` with a live `sessionId`).
3. Both boutique NPCs are present in `worldLife.npcs` (`npc-tailor`, `npc-fitting-room`).
4. Real on-foot, Rapier-driven movement (camera-relative WASD + sprint, ~62 m from spawn) reaches
   Roux · Tailor; the "E · Browse the wardrobe" proximity prompt appears; pressing E opens the
   real `CosmeticsShop` panel, which renders real catalog cards fetched live from
   `/api/cosmetics/catalog`.
5. Repositioning to the Fitting Room stall and pressing E opens the real `CosmeticsWardrobe`
   panel via the identical `onInteract` → `world.openWardrobe()` path.
6. Zero unexpected console errors/warnings across the whole run.

See [PORT-CHECKLIST.md](PORT-CHECKLIST.md) for the dated ship entry and exact run details.

---

## Definition of done

Inherits [W00](W00-program-overview.md)'s full DoD. Checked off:

- [x] Reuses `world.three.ws`-style patterns and the existing off-schema architecture — nothing
      here is a parallel system; it's two catalog entries plus two callback bindings over an
      already-real shop/wardrobe/x402 stack.
- [x] Server-authoritative: the shop purchase and wardrobe equip were already server-validated
      before this pass; the NPCs only open the client panels, they grant nothing themselves.
- [x] Dev server run, feature exercised in a real (headless) browser, zero console
      errors/warnings.
- [x] Loading/empty/error states: inherited from the existing shop/wardrobe panels (already
      designed — skeleton cards while loading, retry on fetch failure, "nothing owned yet" empty
      state in the wardrobe).
- [x] Mobile/touch: the NPC proximity system already supports tap-to-interact
      (`world-life.js` `tryActivateAt`) alongside keyboard E.
- [x] `data/changelog.json` entry added for the in-world boutique.
- [x] Gaps intentionally left open are documented in [PORT-CHECKLIST.md](PORT-CHECKLIST.md)
      rather than silently dropped (cash/crypto cosmetics-economy unification, embedding Avatar
      Studio in-canvas, unifying the two selfie pipelines) — none block a working, demoable
      feature.
