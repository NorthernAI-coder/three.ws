# IRL Task 01 — Permanent Auth-Linked Pins

## Context

The IRL GPS anchor system (`/api/irl/pins`, `src/irl.js`) already exists and works:
- POST `/api/irl/pins` stores a GPS pin in `irl_pins` table
- GET `/api/irl/pins?lat=&lng=&radius=` returns nearby pins
- DELETE `/api/irl/pins?id=&deviceToken=` removes a pin
- Frontend already calls savePin(), loadNearbyPins(), spawnNearbyPin(), loadPinGLB()
- Table has `user_id`, `agent_id`, `device_token`, `expires_at` columns

**The problem:** Every pin expires in 7 days (`expires_at = NOW() + INTERVAL '7 days'`). Authenticated users should get **permanent** pins (no expiry). Also, the POST endpoint doesn't extract the authenticated user's session — `user_id` is always null. DELETE only works by `device_token`, so you can't delete your own pin from a different device.

## What to build

### 1. Auth linkage in POST `/api/irl/pins.js`

In `api/irl/pins.js`, import `getSessionUser` from `api/_lib/auth.js` (already used in other endpoints — see `api/sniper/strategy.js` for the pattern). In the POST handler:

- Call `getSessionUser(req)` — it returns `{ id, ... }` or null
- If authenticated: set `user_id = session.id`, set `expires_at = NULL` (permanent)
- If anonymous: keep `device_token` from body, keep `expires_at = NOW() + INTERVAL '7 days'`

```js
// pattern to follow from api/sniper/strategy.js
import { getSessionUser } from '../_lib/auth.js';

// in POST handler:
const session = await getSessionUser(req).catch(() => null);
const userId = session?.id ?? null;
const expiresAt = userId ? null : new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
```

Then pass `userId` and `expiresAt` into the INSERT:
```sql
INSERT INTO irl_pins (user_id, ..., expires_at)
VALUES (${userId}, ..., ${expiresAt})
```

The table's `expires_at` default is `NOW() + 7 days` — override it explicitly so NULL = permanent.

### 2. Auth DELETE in `/api/irl/pins.js`

Extend the DELETE handler to also allow deletion by authenticated `user_id`. Currently:
```sql
WHERE id = ${id} AND (device_token = ${deviceToken} OR device_token IS NULL)
```

Change to:
```sql
WHERE id = ${id}
  AND (
    device_token = ${deviceToken ?? ''}
    OR user_id = ${userId}
    OR device_token IS NULL
  )
```

Where `userId` comes from `getSessionUser(req)` (null if not authenticated).

### 3. GET — list my pins endpoint

Add a new query mode: when `req.query.mine === '1'` and the user is authenticated, return all pins belonging to that user (no lat/lng required, no radius filter):

```js
if (req.method === 'GET' && req.query.mine === '1') {
  const session = await getSessionUser(req).catch(() => null);
  if (!session) return json(res, 401, { error: 'not authenticated' });
  const rows = await sql`
    SELECT id, lat, lng, heading, avatar_url, avatar_name, caption, placed_at, expires_at
    FROM irl_pins
    WHERE user_id = ${session.id}
    ORDER BY placed_at DESC
    LIMIT 100
  `;
  return json(res, 200, { pins: rows });
}
```

This is what the dashboard management page (Task 02) calls.

### 4. Frontend: send agentId + userId context when saving

In `src/irl.js`, the `savePin()` function currently sends `{ lat, lng, avatarUrl, avatarName, deviceToken }`. Extend it to also send `agentId` from the URL param (already parsed as `avatarIdParam`):

```js
body: JSON.stringify({
  lat, lng,
  avatarUrl:   resolveAvatarUrl(_currentAvatarId),
  avatarName:  nameEl.textContent,
  deviceToken: _deviceToken,
  agentId:     avatarIdParam || null,   // add this line
}),
```

### 5. Expiry display in status message

In `src/irl.js`, the lock button sets a status message. Extend it to show permanence:

Find the `setLocked` function and the status string. After you get a successful `savePin` response, check if the returned `pin.expires_at` is null:

```js
savePin(gpsPin.lat, gpsPin.lng).then(result => {
  if (result?.id && gpsPin) {
    gpsPin.id = result.id;
    const forever = result.permanent; // we'll add this to API response
    setStatus(forever ? 'Pinned permanently — others nearby can see you' : 'Pinned for 7 days');
  }
});
```

And in the API response from POST, add `permanent: expiresAt === null` to the returned object.

## Files to edit

- `api/irl/pins.js` — auth linkage, permanent expiry, auth DELETE, GET ?mine=1
- `src/irl.js` — send agentId in savePin(), show permanent status

## Definition of done

- Logged-in user POSTs a pin → `user_id` populated, `expires_at` is NULL in DB
- Anonymous user POSTs → `expires_at` is 7 days from now (unchanged)
- Logged-in user can DELETE their pin from a different device (by session, not device_token)
- GET `/api/irl/pins?mine=1` returns all pins for authenticated user
- `savePin()` sends `agentId` in body
- Status message says "Pinned permanently" for auth users
- No regressions to anonymous flow
