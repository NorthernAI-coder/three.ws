# L2 — "Choose where to place" map picker

> Epic · Size **M** · Touches `src/irl.js` + `pages/irl.html` (UI) · reuses the
> Leaflet/Nominatim approach from `src/dashboard-next/pages/irl-placements.js`.

## Goal

When a user places an agent, give them a real choice instead of silently writing
their exact GPS:

- **Use my location (precise)** — the current behavior: anchor at the live fix.
- **Pick a spot on a map** — open a Leaflet picker (search + draggable marker),
  confirm a chosen point, and `savePin` uses *that* coordinate.

This is both the headline **privacy** win for real users (place your agent at a
chosen public spot — a café, a plaza, a venue — without your home coordinates ever
entering the feed) and a UX upgrade (place an agent somewhere you're planning to
be, or somewhere meaningful, not only where you're standing right now).

## Why it matters

The product premise is "agents anchored to real places," but forcing precise GPS
means the *only* place a user can pin is wherever they currently are — usually
home. That is a privacy non-starter for a public feed and it caps the product:
people want to place an agent at a landmark, an event, a storefront. A map picker
removes the leak and unlocks intentional placement. It mirrors how every mature
location product (Find My, Airbnb, Uber) lets you confirm/adjust a point rather
than trusting a raw fix.

## Current state (real lines)

- `src/irl.js:1313` `anchorGpsPin()` and `src/irl.js:1454` `openCaptionPanel()` both
  end at `savePin(lat, lng, heading, caption, anchor)` (`:1351`) which POSTs to
  `/api/irl/pins`. Placement coordinates today come straight from `gpsState`.
- `api/irl/pins.js:554` POST already validates and stores arbitrary `lat`/`lng`
  (range-checked `:566`), so **no server change is required** to accept a picked point.
- `src/dashboard-next/pages/irl-placements.js:1083` lazy-loads Leaflet from
  `https://esm.sh/leaflet@1.9.4` + CSS from unpkg (`ensureLeafletCss`/`loadLeaflet`),
  dark-themed (`:339`); `reverseGeocode` (`:111`) hits Nominatim. **Copy this loader
  and theme verbatim** — do not introduce a second map stack.

## What to build

### 1. Placement-source chooser

Before the caption panel opens, present two clear choices (a small designed
sheet, not a browser confirm):

```
How should we place this agent?
  ◉ Use my location        ~precise · within {accuracy}m
  ○ Pick a spot on a map   choose any point
```

Default to "Use my location" when `gpsState.ready`; default to (and only offer)
the map when there's no fix. Selecting the map opens the picker; selecting precise
goes straight to the existing caption/anchor flow unchanged.

### 2. Leaflet picker sheet

A full-width bottom sheet (mobile-first) containing:

- A Leaflet map, dark theme, centered on `gpsState` if available else a sensible
  default, zoom ~16. Lazy-load via the dashboard's `loadLeaflet()`/`ensureLeafletCss()`
  pattern — **with a designed loading skeleton and a retry error state** if the CDN
  fails (Rule 9: never a blank map).
- A **draggable center marker** (or tap-to-move) — the agent drops where the marker
  sits. Show the live `lat, lng` + a debounced `reverseGeocode` label under the map.
- A **search box** (Nominatim `/search?q=`) so a user can type "Dolores Park, SF"
  and fly the map there. Debounce input; handle empty/no-results/error states.
- **Confirm** ("Place here") and **Cancel**. Confirm closes the picker and calls
  the normal caption flow with the chosen `{ lat, lng }`; heading falls back to the
  device compass or 0.

### 3. Wire chosen coordinate through `savePin`

Thread the picked point so `savePin` posts it instead of `gpsState`. A map-picked
pin is **not** GPS-anchored, so set the anchor pose `source` accordingly — pass
`source: 'map'` (the server already normalizes unknown sources; extend the
`anchor_source` allow-list note in `api/irl/pins.js:688` to record `'map'` so the
viewer/A3 knows this pin's bearing isn't compass-trustworthy). Caption/avatar/x402
flow is unchanged.

### 4. Designed states + a11y

Loading (map tiles), empty (search no-results), error (CDN/tiles/Nominatim
failure → retry), and a clear "you're placing remotely" hint. Keyboard: search
focusable, Confirm/Cancel reachable, `Esc` cancels. Marker has an ARIA label.
Respect 320 / 768 / 1440px.

## Data / API changes

- **No schema change.** POST already accepts arbitrary in-range `lat`/`lng`.
- Add `'map'` to the recognized `anchor_source` values (doc + the normalize line at
  `api/irl/pins.js:688`) so a map-placed pin is distinguishable from a `gyro-gps` one.
- New external calls: Nominatim `/search` (in addition to the existing `/reverse`).
  Reuse the dashboard's memoized client + a short timeout; never block placement on it.

## Acceptance checklist

- [ ] Placement offers "Use my location" vs "Pick a spot on a map"; precise path is byte-for-byte the current flow.
- [ ] Map picker lazy-loads Leaflet (dashboard pattern), dark theme, draggable marker, working search, live reverse-geocode label.
- [ ] Confirm places the agent at the **picked** coordinate (verify POST body); Cancel returns with nothing written.
- [ ] Map load failure / no GPS / no search results each render a designed, retryable state — never a blank map.
- [ ] `anchor_source` records `'map'` for map-placed pins.
- [ ] 320 / 768 / 1440px clean; keyboard + ARIA pass; no console errors/warnings.
- [ ] `data/changelog.json` entry added (`feature`); `npm run build:pages` passes.

## Out of scope

Moving/relocating an *existing* pin (that's the dashboard's remote-location
management + L5). Precise-vs-approximate *discovery* of nearby agents (L3/L4).
A custom tile server — OSM tiles via Leaflet default are fine.

## Verify

`npm run dev` → `/irl`: place via "Pick a spot on a map," search a landmark, drag
the marker, Place here → Network tab shows the POST with the picked coords and
`anchor_source:'map'`; the agent renders; your real GPS never entered the request.
