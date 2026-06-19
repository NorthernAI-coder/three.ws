# L5 — My-pins management upgrade

> Epic · Size **S** · Touches `src/irl.js` (My-pins sheet) · reuses the Leaflet
> loader from `src/dashboard-next/pages/irl-placements.js`. Builds on the existing sheet.

## Goal

Make the existing **My-pins** sheet a real management surface so a tester (or any
user) can see and purge what they've placed in seconds:

1. **Map overview** — a small Leaflet map at the top of the sheet plotting every
   pin this device/account owns, so "where did I drop things?" is answered visually.
2. **Expiry countdown** — each row shows `expires in 6d` (anonymous) or `permanent`
   (signed-in), so a tester knows exactly when a forgotten test pin self-destructs.
3. **Remove all from this device** — a guarded bulk purge (confirm step) that deletes
   every pin tied to the local device token in one action, for fast cleanup after testing.

## Why it matters

The whole anxiety in "I'm worried my location will leak" is really "and I won't be
able to take it back." The sheet today lists pins and deletes them one at a time
(`deleteMyPin`), with no map and no expiry visibility. After a testing session you
might have a dozen pins at (or near) a real spot and no fast way to confirm they're
gone. A map + countdown + one-tap purge turns cleanup from a chore into a reflex —
which is exactly what makes people comfortable experimenting in the first place.

## Current state (real lines)

- `src/irl.js:2476` `loadMyPins()` → `GET /api/irl/pins/mine?deviceToken=` returns
  `id, lat, lng, avatar_name, caption, placed_at, expires_at, view_count`
  (`api/irl/pins.js:428`) — **expiry + coords already come back**, nothing new to fetch.
- `src/irl.js:2501` `renderMyPins(pins, listEl)` paints rows; `:2531` `deleteMyPin(id, btn)`
  does the per-row DELETE; `:2466` `MYPINS_EMPTY` is the shared empty state;
  `:2442` `relativeTime()` already formats `placed_at` (mirror it for `expires_at`).
- `src/irl.js:2514` `openMyPinsSheet()` uses `loadInto` (skeleton/empty/error/retry).
- `api/irl/pins.js:847` DELETE removes one pin by `id` + owner (`device_token`/`user_id`);
  there is **no** bulk-delete endpoint yet.
- Leaflet loader to reuse: `src/dashboard-next/pages/irl-placements.js:1083`.

## What to build

### 1. Map overview in the sheet

Above the list, render a Leaflet map (lazy-loaded via the dashboard's
`loadLeaflet()`/`ensureLeafletCss()`, dark theme) with a marker per owned pin,
auto-`fitBounds` to them. Empty → hide the map and show `MYPINS_EMPTY`. Map CDN
failure → degrade gracefully to the list alone (the list is the source of truth;
the map is an enhancement, never a hard dependency — Rule 9). Tapping a marker
highlights/scrolls to its row.

### 2. Expiry countdown per row

Extend `renderMyPins` so each row's meta line shows expiry. Add a small
`relativeExpiry(expires_at)` next to `relativeTime`:

- `expires_at` null → `permanent` (signed-in pins).
- future → `expires in 6d` / `expires in 5h` / `expires in 12m`.
- past (shouldn't surface — the feed filters expired) → `expired`.

Use the existing `.irl-pin-meta` styling; keep `_pinMetaLine` (`:2454`) as the
composer so distance + age + expiry read as one line.

### 3. "Remove all from this device" bulk purge

A footer button in the sheet (only shown when ≥1 pin and a `_deviceToken` exists).
On tap → a **confirm** step (designed, not `window.confirm`): "Remove all N agents
you placed from this device? This can't be undone." On confirm, delete them all and
re-render to the empty state.

Implement the delete with a new bulk branch on the existing endpoint to avoid N
round-trips:

```
DELETE /api/irl/pins?all=1&deviceToken=<token>
```

In `api/irl/pins.js` DELETE (`:847`): when `req.query.all` is truthy and a
`deviceToken` is present, delete **every** row matching that exact device token
(`device_token = ${deviceToken}` — same strict, null-guarded ownership as the
single delete; never a NULL/empty-token match), returning the deleted count. Keep
the single-`id` path unchanged. Auth users without a device token are out of scope
here (they manage permanent pins from the dashboard) — gate the button on
`_deviceToken`.

### 4. Designed states + a11y

Loading (skeleton rows + map skeleton), empty (`MYPINS_EMPTY`), error (retry),
purge confirm (focus-trapped, `Esc` cancels), and disabled/spinner states on the
buttons during deletion. 320 / 768 / 1440px clean. Buttons have ARIA labels;
destructive purge is clearly styled.

## Data / API changes

- New DELETE branch: `DELETE /api/irl/pins?all=1&deviceToken=` → `{ ok: true, deleted: N }`.
  Strict device-token ownership, null-guarded exactly like `api/irl/pins.js:869`.
- No schema change. `loadMyPins` already returns `lat/lng/expires_at` — no new read.

## Acceptance checklist

- [ ] My-pins sheet shows a Leaflet map of owned pins (fitBounds); CDN failure degrades to the list, never a blank/broken sheet.
- [ ] Each row shows expiry: `permanent` / `expires in 6d` etc., composed into the existing meta line.
- [ ] Marker tap highlights/scrolls to the matching row.
- [ ] "Remove all from this device" appears only with ≥1 pin + a device token, runs a designed confirm, deletes all in one request, lands on the empty state.
- [ ] Bulk DELETE matches **only** the caller's device token (a NULL/empty token deletes nothing); single-`id` delete unchanged.
- [ ] Skeleton/empty/error/confirm states designed; keyboard + ARIA pass; no console errors.
- [ ] `data/changelog.json` entry added (`improvement`); `npm run build:pages` passes.

## Out of scope

Editing a pin's location/caption from the sheet (dashboard remote management owns
relocation). Bulk delete for signed-in/permanent pins (dashboard scope). Map
placement of *new* pins (L2).

## Verify

`npm run dev` → `/irl` (use L1 mock to place a few test pins safely) → open My
pins: map plots them, rows show countdowns, "Remove all" → confirm → Network tab
shows one `DELETE …?all=1` returning the count, sheet shows the empty state, and a
reload confirms they're gone from the nearby feed.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-location-control/L5-my-pins-management-upgrade.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
