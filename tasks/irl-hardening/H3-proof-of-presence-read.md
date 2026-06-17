# H3 — Bind the nearby read to a genuine location fix

> Epic IRL-Hardening · Size **L** · Touches `api/irl/pins.js`, a new
> `api/irl/fix-token.js` (or `api/_lib/irl-presence.js`), and `src/irl.js`.

## Goal

Close the one structural hole left in the discovery model: the nearby read trusts
**caller-supplied** coordinates. Anyone can query `GET /api/irl/pins?lat=&lng=`
for *any* point on earth they aren't standing at, and (within the radius cap +
rate limit) harvest the pins there. Bind the read to a short-lived, server-issued
**proof-of-presence token** minted from a real geolocation fix, so the feed only
answers for where the caller actually is — making a remote sweep of a specific
person's pins, or a city-wide grid scrape, structurally hard rather than just
rate-limited.

## Why it matters

The product promise is "you stumble on an agent by walking up to it." That only
holds if you can't *browse* locations from your couch. Today the radius cap (60 m)
and IP rate-limit (60/min) slow a sweep but don't stop a patient one, and they do
nothing against someone who knows roughly where the victim tested and reads that
exact 60 m circle. Proof-of-presence turns "query anywhere" into "query where you
are," which is the actual product contract.

## Current state (verified)

- `api/irl/pins.js` nearby branch: parses `lat`/`lng` from the query, clamps
  `radius` to `[10,60]`, IP rate-limits via `limits.publicIp`, returns the coarse
  allow-list projection. No binding between the caller and the coordinates.
- The client already holds a real fix (`gpsState` in `src/irl.js`,
  `navigator.geolocation.watchPosition`) — so minting a token from a fresh fix is
  cheap and invisible to a legitimate user.
- `api/_lib/crypto.js` exists (used by the cron for `constantTimeEquals`); reuse
  it / `node:crypto` HMAC for signing. No new third-party dependency.

## What to build

### 1. Mint endpoint — `POST /api/irl/fix-token`

Input: the client's current `{ lat, lng, accuracy }`. Output: a compact signed
token bound to a **coarse cell** (e.g. geocell-7, ~150 m) + an issue timestamp,
HMAC-signed with a server secret (`IRL_FIX_SECRET`), TTL ~2–5 min:

```js
// token = base64url(payload) + '.' + base64url(hmacSHA256(payload, IRL_FIX_SECRET))
// payload = { cell7: encodeGeohash(lat,lng,7), iat: nowSec }
```

Rate-limit minting per IP/device. The token authorizes reads whose caller-claimed
point falls inside (or adjacent to) `cell7`, for its TTL — enough to keep polling
as you walk, not enough to bank tokens for a sweep.

### 2. Enforce on the nearby read

`GET /api/irl/pins` requires a valid, unexpired fix token (header `x-irl-fix`,
pairs with H2's `x-irl-device`). Verify the signature, check TTL, and check the
requested `lat`/`lng` resolve to the token's `cell7` (or an immediate neighbor, so
a viewer near a cell edge still works). On failure → `401 fix_required` with a
designed body the client turns into "Getting your location…/Location needed".

### 3. Graceful degrade (don't break the product)

- A user with location **denied** can't mint a token → the read returns
  `fix_required`; the client shows the existing location-permission designed state
  (coordinate with **H8**), never a blank screen.
- Keep a clearly-scoped **dev/preview bypass** (`IRL_FIX_SECRET` unset → skip
  enforcement) so local/sandbox testing isn't gated, but ensure production sets
  the secret and enforces. Log which mode is active once at cold start.
- Tighten the IP rate-limit on the read now that every legit caller mints first;
  a token-less or bad-token flood is cheap to reject.

### 4. Client

In `src/irl.js`, mint a fix token whenever a fresh GPS fix lands (debounced), cache
it, attach `x-irl-fix` to every `loadNearbyPins` fetch, and re-mint on 401 or when
the cell changes. This is invisible to the user — they already granted location.

## Data / API changes

- New `POST /api/irl/fix-token` → `{ token, expires_in }`. Register in `vercel.json`.
- New env `IRL_FIX_SECRET` (set in Vercel prod + preview). Unset → enforcement off
  (dev). Document in the deploy notes.
- `GET /api/irl/pins` now requires `x-irl-fix` in production.

## Acceptance checklist

- [ ] `POST /api/irl/fix-token` mints a TTL-bounded, HMAC-signed, cell-bound token.
- [ ] Nearby read rejects a missing/expired/forged token, or one whose claimed
      point is outside the token cell (+neighbors), with `401 fix_required`.
- [ ] A legitimate walking user polls seamlessly (token re-mints on cell change).
- [ ] Location-denied users hit the designed permission state, not an error.
- [ ] Dev bypass works with `IRL_FIX_SECRET` unset; prod enforces; mode logged once.
- [ ] H1 suite extended: forged token rejected; valid token for cell A can't read cell Z.
- [ ] `npm test` + `npm run typecheck` green.

## Out of scope

Per-account abuse scoring + anomaly alerting on sweep-shaped traffic (**H7**), and
device-token transport (**H2**, a prerequisite for the shared header pattern).

## Verify

`npm run dev` with `IRL_FIX_SECRET` set locally: confirm the read 401s without a
token, mints a token from your fix, then returns pins; spoofing a far-away lat/lng
with a local-cell token is rejected. With the secret unset, the read works
unchanged (dev bypass).
