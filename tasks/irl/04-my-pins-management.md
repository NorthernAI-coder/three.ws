# Task: IRL — "My pins" management UI

## What to build

A user who has placed pins should be able to see them and remove them from any device (or even after reloading the page), as long as they're on the same device with the same `localStorage` device token. Add a "My pins" section that appears in the bottom sheet when the user has active pins they placed.

## Current state

- Anonymous ownership uses `localStorage.getItem('irl_device_token')` — a UUID generated on first visit and sent as `deviceToken` in POST / DELETE calls.
- The API at `GET /api/irl/pins` returns all nearby pins but doesn't filter by owner.
- The API at `DELETE /api/irl/pins?id=<id>&deviceToken=<token>` removes pins where `device_token` matches.
- There is no way for the user to browse their own remote pins (the in-memory `gpsPin` is lost on page reload).

## New API endpoint needed

Add `GET /api/irl/pins/mine?deviceToken=<token>` to `api/irl/pins.js` (or create `api/irl/my-pins.js`):

```sql
SELECT id, lat, lng, avatar_name, caption, placed_at, expires_at
FROM irl_pins
WHERE device_token = $1
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY placed_at DESC
LIMIT 20
```

Returns `{ pins: [...] }`.

## UI changes in `pages/irl.html`

Add a "My pins" pill button next to the existing avatar and pin buttons in `.irl-secondary-row`:

```html
<button class="irl-pill-btn" id="irl-mypins-btn" type="button" hidden aria-label="My active pins">
  <svg ...><!-- list icon --></svg>
  My pins
</button>
```

Show this button only when GPS is ready and the device has a stored token (checked in `initGPS()`).

When tapped, slide up a bottom sheet (`#irl-mypins-sheet`) listing the user's active pins. Each row shows:
- Agent name
- Caption (if any), truncated to one line
- Distance in metres (compute from current GPS position using haversine)
- Placed time (e.g. "2h ago")
- A red trash icon button to delete that pin

The sheet style should match `#irl-sheet` (same glass blur, same slide-up animation).

## JS changes in `src/irl.js`

```js
async function loadMyPins() {
    if (!_deviceToken) return [];
    const r = await fetch(`/api/irl/pins/mine?deviceToken=${_deviceToken}`);
    if (!r.ok) return [];
    return (await r.json()).pins ?? [];
}

async function openMyPinsSheet() {
    const pins = await loadMyPins();
    // render rows into #irl-mypins-list
    // show #irl-mypins-sheet
}

async function deleteMyPin(id) {
    await fetch(`/api/irl/pins?id=${id}&deviceToken=${_deviceToken}`, { method: 'DELETE' });
    // re-render the list
    // if id === gpsPin?.id, call setLocked(false) to clear local state
}
```

## API changes in `api/irl/pins.js`

Add a branch for `GET /api/irl/pins/mine` **before** the existing GET handler:

```js
if (req.method === 'GET' && req.url?.includes('/mine')) {
    const deviceToken = req.query.deviceToken;
    if (!deviceToken) return json(res, 400, { error: 'deviceToken required' });
    const rows = await sql`
        SELECT id, lat, lng, avatar_name, caption, placed_at, expires_at
        FROM irl_pins
        WHERE device_token = ${deviceToken}
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY placed_at DESC
        LIMIT 20
    `;
    return json(res, 200, { pins: rows });
}
```

Also add a route in `vercel.json`:
```json
{ "src": "/api/irl/pins/mine", "dest": "/api/irl/pins.js" }
```

## Checklist

- [ ] `GET /api/irl/pins/mine?deviceToken=` endpoint works
- [ ] Route registered in `vercel.json`
- [ ] "My pins" button visible only after GPS initialises
- [ ] Sheet shows all active pins with name, caption, distance, time
- [ ] Trash button deletes pin from DB and removes from list
- [ ] Deleting the currently-pinned avatar also clears local `gpsPin` state (calls `setLocked(false)`)
- [ ] Empty state: "No active pins" message
- [ ] No console errors

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl/04-my-pins-management.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
