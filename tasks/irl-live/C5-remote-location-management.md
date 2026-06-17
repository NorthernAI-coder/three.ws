# C5 — Remote location management (map + draggable relocate)

> Epic C · Size **M** · Opens from the C1 card "Location" link.
> Depends on C1. Extends `api/irl/pins.js` PATCH.

## Goal

Give the owner a real **map** (Leaflet + OpenStreetMap tiles, no API key) with a
draggable marker for each placed agent, so they can **relocate** a pin (new
lat/lng + heading) or **remove** it from anywhere on earth — not just standing at
the spot. Reverse-geocode the new position to a human label, exactly as the list
already does.

## Why it matters

The list view (C1) tells you *where* an agent is but not visually, and gives no
way to move it. Placement happens at a physical spot via the IRL camera; nudging
it 30 m to the better corner, or moving it to a new venue, currently means
deleting and re-walking there. A map turns the dashboard into true remote control.

## Current state (real lines)

- `irl-placements.js:40` `reverseGeocode(lat,lng)` already hits Nominatim and
  extracts a city/town label — reuse verbatim.
- `irl-placements.js:91` grabs the viewer's own GPS for distance labels.
- `api/irl/pins.js:170` PATCH currently accepts **only `{ id, caption }`** and
  updates owner-scoped rows (`WHERE id=… AND user_id=…`). **Heading/lat/lng are
  not yet patchable** — this task adds them.
- DELETE already works owner/device-scoped (`api/irl/pins.js:185`).
- Pins carry `heading` (`pins.js:39`, default 0); the IRL viewer applies it as
  `-(heading·π/180)` on the group (`src/irl.js:958`).

## What to build

### 1. Extend PATCH in `api/irl/pins.js`

Accept optional `lat`, `lng`, `heading` alongside `caption`. Validate ranges,
update only provided fields, keep the owner scope.

```js
if (req.method === 'PATCH') {
  const session = await getSessionUser(req).catch(() => null);
  if (!session) return json(res, 401, { error: 'not authenticated' });
  const { id, caption, lat, lng, heading } = req.body ?? {};
  if (!id) return json(res, 400, { error: 'id required' });

  const hasGeo = lat !== undefined || lng !== undefined;
  if (hasGeo) {
    const nLat = parseFloat(lat), nLng = parseFloat(lng);
    if (!isFinite(nLat) || !isFinite(nLng) ||
        nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180)
      return json(res, 400, { error: 'invalid coordinates' });
  }
  // COALESCE keeps existing values when a field is omitted
  const [row] = await sql`
    UPDATE irl_pins SET
      caption = ${caption === undefined ? sql`caption` : (caption ?? null)},
      lat     = ${hasGeo ? parseFloat(lat) : sql`lat`},
      lng     = ${hasGeo ? parseFloat(lng) : sql`lng`},
      heading = ${heading === undefined ? sql`heading` : (parseFloat(heading) || 0)}
    WHERE id = ${id} AND user_id = ${session.id}
    RETURNING id, lat, lng, heading, caption`;
  if (!row) return json(res, 404, { error: 'not found' });
  return json(res, 200, { pin: row });
}
```

> Note: Neon's tagged template can't nest `sql` fragments inside one statement
> the way shown — if that bites, branch the UPDATE per "geo vs caption-only" (as
> `api/skills/index.js:177` branches its query) rather than COALESCE-composing.

### 2. Map UI (Leaflet, lazy-loaded)

Lazy-import Leaflet from a CDN/ESM only when the Location panel opens (perf —
don't ship it to every dashboard view). OSM tiles, no key:

```js
const L = await import('https://esm.sh/leaflet@1.9');
const map = L.map(node).setView([pin.lat, pin.lng], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
const marker = L.marker([pin.lat, pin.lng], { draggable: true }).addTo(map);
marker.on('dragend', () => {
  const { lat, lng } = marker.getLatLng();
  pendingMove = { lat, lng };
  showSaveBar(lat, lng);            // reverse-geocode → label, "Save / Cancel"
});
```

Show **all** of the owner's pins as markers (overview), but only the focused
pin's marker is draggable; clicking another marker focuses it. A heading control
(compass dial or 0–359 input) sets `heading`. A "Remove from map" button calls
the existing DELETE and drops the marker.

### 3. Save flow

`dragend` (or heading change) reveals a save bar with the reverse-geocoded new
label and Save/Cancel. Save → PATCH with `{ id, lat, lng, heading }`:

```js
const r = await fetch('/api/irl/pins', { method:'PATCH', credentials:'include',
  headers:{ 'content-type':'application/json' },
  body: JSON.stringify({ id: pin.id, ...pendingMove, heading }) });
```

On success, update the C1 card's location label + heading in place; on failure,
snap the marker back to its last saved position and show an inline error.

### States (state-kit)

- Tiles loading → skeleton over the map node; if Leaflet/CDN import fails →
  `errorStateHTML` with Retry and a fallback "edit coordinates manually" form
  (lat/lng number inputs) so the feature still works offline-of-CDN.
- No pins → empty state (shouldn't reach here from a C1 card, but guard it).

## Data / API changes

- `api/irl/pins.js` PATCH extended to accept `lat`, `lng`, `heading` (owner-scoped,
  validated). No schema change — columns already exist.
- No new endpoint. DELETE reused as-is.

## Acceptance checklist

- [ ] PATCH accepts `lat/lng/heading`, validates ranges, owner-scoped, omitted
      fields unchanged.
- [ ] Leaflet map lazy-loads with OSM tiles (no key); owner's pins shown; focused
      marker draggable.
- [ ] Drag → reverse-geocoded label + Save/Cancel; Save persists; failure snaps
      back with inline error.
- [ ] Heading control persists; Remove deletes via existing DELETE.
- [ ] CDN-import failure falls back to a manual lat/lng form; loading/error states
      designed; no console errors; works at mobile width.

## Out of scope

Realtime propagation of the move to live viewers (D1 pushes the updated pin;
otherwise viewers pick it up on the next `loadNearbyPins` poll). Anchor-pose
precision (Epic A) is separate from coarse GPS relocation.

## Verify

`npm run dev` → open Location from a C1 card → drag the marker → Save → confirm a
PATCH with new coords, the card label updates, and reloading `/irl` near the new
spot shows the agent moved.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/C5-remote-location-management.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
