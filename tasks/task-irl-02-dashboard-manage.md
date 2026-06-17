# IRL Task 02 — Dashboard: Manage Your Placed Pins From Anywhere

## Context

The IRL GPS system (`/api/irl/pins`, `src/irl.js`) lets users anchor their 3D agent avatar at a real-world GPS location. After Task 01, authenticated users have permanent pins linked to their `user_id`, deletable by session auth. `GET /api/irl/pins?mine=1` returns all pins for the authenticated user.

**The missing piece:** There is no way to see or manage your placed pins from a non-IRL context. If you're in a different city, you can't see where you're pinned or remove old pins without physically going back.

## What to build

### New dashboard page: `/dashboard/irl-placements`

Create a full dashboard page at `/src/dashboard-next/pages/irl-placements.js` and register it.

**Layout** (follow the patterns in `src/dashboard-next/pages/sniper.js` and `src/dashboard-next/pages/copy.js`):

```
┌─────────────────────────────────────────────────────┐
│  My Placed Avatars                    + Place new ↗  │
├─────────────────────────────────────────────────────┤
│  [Avatar img]  Agent Name                           │
│                📍 New York, NY  ·  2.3km away       │
│                Placed 3 hours ago  ·  Permanent      │
│                [Edit caption]  [Remove pin]          │
├─────────────────────────────────────────────────────┤
│  [Avatar img]  Agent Name                           │
│                📍 37.7749°N, 122.4194°W             │
│                Placed 2 days ago  ·  Expires in 5d   │
│                [Edit caption]  [Remove pin]          │
└─────────────────────────────────────────────────────┘
```

Empty state: "You haven't placed any avatars yet. Open IRL, enable camera, and use the Lock button to pin yourself to a real-world location."  With a CTA button → `/irl`.

### Implementation

**1. Fetch pins**

```js
async function loadMyPins() {
  const r = await fetch('/api/irl/pins?mine=1');
  if (!r.ok) { /* show error state */ return; }
  const { pins } = await r.json();
  render(pins);
}
```

**2. Reverse-geocode display**

For each pin, show human-readable location. Use the browser Nominatim (OpenStreetMap) API — it's free, no key needed:

```js
async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'three.ws/1.0' } }
    );
    const d = await r.json();
    return d.address?.city || d.address?.town || d.address?.village
      || d.address?.county || d.display_name?.split(',')[0] || null;
  } catch { return null; }
}
```

Show the city name if found, otherwise show `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`.

**3. Distance from current location**

If `navigator.geolocation` is available, get the user's current position once and show distance to each pin ("2.3 km away"). Use the haversine formula (copy from `api/irl/pins.js` — it's a one-liner).

**4. Expiry display**

- `expires_at === null` → badge: `Permanent`
- `expires_at` in future → `Expires in Xd Xh`
- `expires_at` in past → `Expired` (show faded, offer cleanup)

**5. Edit caption**

Inline: clicking "Edit caption" shows a text input pre-filled with current caption. On save, PATCH `/api/irl/pins` (see below for API addition).

**6. Remove pin**

```js
async function removePin(id) {
  const r = await fetch(`/api/irl/pins?id=${id}`, { method: 'DELETE' });
  if (r.ok) { /* remove card from DOM */ }
  else { /* show error */ }
}
```

(DELETE by session auth — implemented in Task 01)

**7. "Place new" button**

Top-right link → `/irl` (opens IRL experience). If the user already has a pin, show "Update placement" instead.

**8. "View in IRL" link per pin**

Each card has a link: `/irl?highlight=${pin.id}` — when IRL opens with `?highlight=`, it centers the camera on that pin's GPS location and highlights it. Add this param handling to `src/irl.js`:

```js
const highlightId = params.get('highlight');
// after loadNearbyPins(), if highlightId matches a pin, flash its label
```

### API addition: PATCH for caption edit

In `api/irl/pins.js`, add a PATCH handler:

```js
if (req.method === 'PATCH') {
  const session = await getSessionUser(req).catch(() => null);
  if (!session) return json(res, 401, { error: 'not authenticated' });
  const { id, caption } = req.body ?? {};
  if (!id) return json(res, 400, { error: 'id required' });
  const [row] = await sql`
    UPDATE irl_pins SET caption = ${caption ?? null}
    WHERE id = ${id} AND user_id = ${session.id}
    RETURNING id, caption
  `;
  if (!row) return json(res, 404, { error: 'not found' });
  return json(res, 200, { pin: row });
}
```

### Register in nav + router

In `src/dashboard-next/nav.js`, add to the NAV array (in the "Presence" or "Monetize" group — pick whichever fits):

```js
{ path: '/dashboard/irl-placements', label: 'IRL Placements', icon: 'pin', group: 'Presence', tags: ['irl', 'ar', 'gps', 'pin', 'place', 'avatar', 'location'] },
```

Add the `pin` icon to ICONS:
```js
pin: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2a5 5 0 015 5c0 3.5-5 11-5 11S5 10.5 5 7a5 5 0 015-5z"/><circle cx="10" cy="7" r="1.8"/></svg>',
```

In `src/dashboard-next/router.js` (or wherever pages are registered), add:

```js
'/dashboard/irl-placements': () => import('./pages/irl-placements.js'),
```

In `vercel.json`, add under `functions`:
```json
"api/irl/pins.js": {
  "maxDuration": 15
}
```

(The route `/api/irl/pins` → `/api/irl/pins.js` already exists in vercel.json routes — just add the function config.)

### CSS

Follow the card style from `src/dashboard-next/pages/sniper.js` (`.sn-card` pattern). Create equivalent `.irl-card`, `.irl-card-head`, `.irl-badge` styles. Keep it minimal — 50 lines of CSS max.

## Files to create/edit

- **Create** `src/dashboard-next/pages/irl-placements.js`
- `api/irl/pins.js` — add PATCH handler, add CORS for PATCH
- `src/dashboard-next/nav.js` — add nav entry + pin icon
- `src/dashboard-next/router.js` — register route
- `src/irl.js` — handle `?highlight=` param
- `vercel.json` — add function config for `api/irl/pins.js`
- `data/changelog.json` — add changelog entry (improvement, link: /dashboard/irl-placements)

## Definition of done

- `/dashboard/irl-placements` loads and shows your placed pins (or empty state)
- Each card shows location name (reverse-geocoded), distance from current position, expiry status, caption
- Edit caption works inline with save/cancel
- Remove pin deletes from DB and removes card from DOM
- "Place new" / "Update placement" button navigates to /irl
- `?highlight=` in IRL flashes the matching pin label
- PATCH `/api/irl/pins` updates caption by session auth
- Nav entry visible in dashboard sidebar

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/task-irl-02-dashboard-manage.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
