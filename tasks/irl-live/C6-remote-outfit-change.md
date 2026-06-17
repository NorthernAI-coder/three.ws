# C6 — Remote outfit change (propagates to all viewers)

> Epic C · Size **L** · Opens from the C1 card "Outfit" link.
> Depends on C1; persists on `irl_pins`; ties to D1 (realtime) for instant
> propagation, with a poll fallback. Uses the wardrobe/accessories system.

## Goal

Let an owner change a **placed agent's outfit** from the dashboard and have the
new look render on the avatar for **every** viewer at that location — not just on
the owner's own device. Persist the chosen outfit/appearance on the pin so
`spawnNearbyPin` / `loadPinGLB` render the updated GLB on the next fetch (or
instantly via D1).

## Why it matters

A static avatar is a statue. Seasonal outfits, event branding ("staff" vests at a
meetup), or just keeping it fresh are what make a placed agent feel maintained and
alive. Because IRL is multiplayer (Epic D), an outfit change must be a property of
the *pin*, server-side — otherwise only the owner's phone sees it.

## Current state (real lines)

- Wardrobe is the source of truth for the layer taxonomy:
  `src/avatar-wardrobe.js` — `WARDROBE_SLOTS` (skin/hair/outfit/glasses/…), each
  with material/mesh match patterns. Slot state round-trips through
  `appearance.colors` (per-slot tint) + `appearance.hidden` (hidden slots), and
  survives the save → validate → server-bake → viewer path (header docstring).
- `src/agent-accessories.js` is the accessory layer applied on the live scene.
- The baker that turns appearance into a served GLB: `api/_lib/bake.js`
  (referenced by the wardrobe docstring); validation `api/_lib/accessories.js`.
- The IRL viewer loads each pin from its **`avatar_url`**: `src/irl.js:992`
  `loadPinGLB` does `new GLTFLoader().loadAsync(pin.avatar_url)`. Pins are fetched
  by `loadNearbyPins` (`src/irl.js:901`) which already diffs add/remove. The pin
  carries no appearance/outfit data today — only `avatar_url`.
- `irl_pins` (`api/irl/pins.js:32`) has `avatar_url`, `avatar_name` but **no
  appearance/manifest column**.

## What to build

### 1. Persist appearance on the pin (schema extension)

Add an idempotent column so a pin owns its look independent of the source avatar:

```sql
ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS avatar_manifest JSONB;   -- {colors, hidden, accessories}
ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS avatar_version  INTEGER DEFAULT 0;  -- bumped on each change (cache-bust + D1 diff)
```

Run it in `ensureTable()` (`api/irl/pins.js:29`) so it self-migrates. `avatar_url`
remains the renderable GLB; `avatar_manifest` is the editable appearance;
`avatar_version` lets the viewer detect a change cheaply.

### 2. Outfit editor panel (dashboard)

Reuse the wardrobe UI machinery rather than rebuild it. Load the agent's avatar
GLB into an offscreen/preview viewer, render the `WARDROBE_SLOTS` controls the
GLB actually exposes (same detection contract the studio uses), and let the owner
recolor/hide/swap the outfit + accessories. Output is the same `appearance` shape
the studio produces (`{ colors, hidden, accessories }`).

### 3. Save → re-bake → persist (`PATCH /api/irl/pins`)

On save, send the appearance manifest. The server bakes a new GLB (the existing
`api/_lib/bake.js` path that the avatar editor already uses), stores it (R2 /
first-party `/cdn/<key>` per the CDN-proxy convention), then updates the pin:

```js
// PATCH /api/irl/pins  { id, avatar_manifest }
const baked = await bakeAppearance(pin.avatar_url, body.avatar_manifest); // -> { url }
const [row] = await sql`
  UPDATE irl_pins
     SET avatar_manifest = ${JSON.stringify(body.avatar_manifest)}::jsonb,
         avatar_url      = ${baked.url},
         avatar_version  = avatar_version + 1
   WHERE id = ${id} AND user_id = ${session.id}
   RETURNING id, avatar_url, avatar_version`;
```

Validate the manifest with `api/_lib/accessories.js` before baking (reject invented
slots). Reuse — do not fork — the existing avatar-bake pipeline; an IRL outfit
change is just a bake targeting the pin's GLB.

### 4. Propagation to all viewers

Two paths, both server-authoritative:

- **Poll (always works):** `loadNearbyPins` (`src/irl.js:901`) already diffs
  incoming vs `nearbyPins`. Add `avatar_version` to the nearby GET payload and the
  diff: when a known pin's `avatar_version` changed, treat it like a re-spawn —
  dispose the old GLB group and call `loadPinGLB` with the new `avatar_url`
  (which is now versioned, so the GLTFLoader/CDN won't serve a stale cache).
- **Realtime (D1):** when D1 lands, emit a `pin_updated { id, avatar_url,
  avatar_version }` event on the geohash room so co-located viewers swap the GLB
  within seconds without waiting for the next poll. Until D1 exists, the poll path
  is the contract.

Owner's own dashboard preview updates immediately from the PATCH response.

### States (state-kit)

- GLB/preview loading → skeleton over the editor viewport.
- Bake in progress → real async "Applying outfit…" disabled save button (no fake
  timers — await the bake).
- Bake/save failure → `errorStateHTML` + Retry; keep the previous look intact.
- Agent has no GLB / no exposed outfit slots → empty state explaining why.

## Data / API changes

- `irl_pins` gains `avatar_manifest JSONB` + `avatar_version INTEGER` (idempotent
  in `ensureTable`).
- `PATCH /api/irl/pins` accepts `avatar_manifest`; bakes via existing
  `api/_lib/bake.js`, stores the GLB, bumps `avatar_version`, returns new
  `avatar_url`.
- Nearby GET (`api/irl/pins.js:107`) adds `avatar_version` to its SELECT so the
  viewer can diff.
- `src/irl.js` `loadNearbyPins` diff updated to re-load a pin whose
  `avatar_version` changed.

## Acceptance checklist

- [ ] `irl_pins` self-migrates `avatar_manifest` + `avatar_version`.
- [ ] Editor renders only the slots the GLB exposes; produces the studio
      `appearance` shape; manifest validated before bake.
- [ ] Save bakes a real GLB via the existing pipeline, stores it, bumps version,
      returns new `avatar_url`; dashboard preview updates from the response.
- [ ] Nearby GET returns `avatar_version`; `loadNearbyPins` swaps the GLB for any
      viewer when version changes (poll path proven).
- [ ] D1 hook stubbed: a `pin_updated` emit point exists for when realtime lands.
- [ ] No fake loaders — bake is awaited; loading/error/empty designed; no console
      errors.

## Out of scope

The realtime transport itself (D1 owns the WS/geohash rooms; this task only
defines the event payload + the poll fallback). Authoring new accessories assets
(that's the wardrobe/marketplace).

## Verify

`npm run dev` → open Outfit from a C1 card → recolor the outfit + save → confirm a
new baked `avatar_url`, `avatar_version` incremented, and the dashboard preview
updates. Then load `/irl` near the pin in a second browser and confirm the avatar
renders the new look after a `loadNearbyPins` cycle.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/C6-remote-outfit-change.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
