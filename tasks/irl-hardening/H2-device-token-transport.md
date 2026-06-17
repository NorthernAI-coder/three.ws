# H2 — Move the device-token credential out of URLs

> Epic IRL-Hardening · Size **M** · Touches `api/irl/pins.js`, `api/irl/interactions.js`,
> `api/irl/interactions-stream.js`, `src/irl.js`, `src/dashboard-next/pages/irl-*.js`.

## Goal

Stop sending the anonymous **device token** in URL query strings. It is a bearer
credential: presenting it reads a device's full pin **location history** and
interaction inbox. Today it rides as `?deviceToken=…` on `GET /api/irl/pins/mine`,
`GET /api/irl/interactions?mine=1`, the SSE stream, and `DELETE`. Query strings
land in platform access logs, browser history, and (for any cross-origin
sub-resource) the `Referer` header. Move the credential to a request **header**
(`x-irl-device`) — or the POST/DELETE body — so it never sits in a URL.

## Why it matters

If that token leaks from a log or history entry, an attacker replays it to
`/mine` and gets the exact GPS of every spot the user dropped a pin — i.e. where
the user physically was. For a solo tester that is their home and movements. The
in-app error-log path is already scrubbed (`redactUrl`, shipped), but the
platform's own access logs and the browser are outside that scrub. The only
durable fix is to keep the credential out of the URL entirely.

## Current state (verified)

- `api/irl/pins.js`: `/mine` branch reads `req.query.deviceToken`; the nearby read
  reads `req.query.deviceToken` (only to compute `is_mine`); `DELETE` reads
  `req.query.id` + `req.query.deviceToken ?? req.body?.deviceToken`.
- `api/irl/interactions.js`: `?mine=1` and `PATCH` read `req.query.deviceToken` /
  `req.body.deviceToken`.
- `api/irl/interactions-stream.js`: reads `req.query.deviceToken` on connect.
- `api/_lib/http.js` `cors()` already allow-lists custom request headers in
  `access-control-allow-headers` — **add `x-irl-device` to that list**.
- Client device token is generated/stored client-side and appended to these URLs
  in `src/irl.js` and the dashboard pages.

## What to build

### 1. Server — accept the token from a header first, body second, query last

Add one helper (e.g. in `api/_lib/irl-auth.js` or inline) and use it everywhere a
device token is read:

```js
// Header is preferred (never logged in the URL); body for POST/DELETE; query is
// a DEPRECATED fallback kept for one release so in-flight clients don't break.
export function readDeviceToken(req) {
  const h = req.headers['x-irl-device'];
  const fromHeader = Array.isArray(h) ? h[0] : h;
  const tok = fromHeader || req.body?.deviceToken || req.query?.deviceToken || '';
  return (typeof tok === 'string' && tok.length) ? tok : null;
}
```

Replace every `req.query.deviceToken` / `req.body?.deviceToken` read in the four
files with `readDeviceToken(req)`. Add `x-irl-device` to
`access-control-allow-headers` in `cors()`. **SSE caveat:** `EventSource` cannot
set headers — for `interactions-stream.js` keep accepting the token via the body
of a companion POST handshake, or document that the stream stays on the query
param but the token in it is short-lived/rotatable (decide and write it down; do
not leave it ambiguous).

### 2. Client — send the header, drop the query param

In `src/irl.js` and `src/dashboard-next/pages/irl-*.js`, change the `fetch` calls
for `/mine`, `interactions?mine=1`, `PATCH`, and `DELETE` to send
`headers: { 'x-irl-device': token }` (and move DELETE's token into the body)
instead of appending `?deviceToken=`. Keep the nearby read's `is_mine` working by
sending the header there too.

### 3. Deprecation window

Leave the query fallback in for exactly one release, logging a one-line
`console.warn('[irl] deprecated deviceToken query param')` (no token value) when
it's hit, then remove it in a follow-up. Note the removal date in the task's
out-of-scope follow-up so it isn't forgotten.

## Data / API changes

- No DB change. Request-transport change only.
- `cors()` `access-control-allow-headers` gains `x-irl-device`.

## Acceptance checklist

- [ ] All four endpoints read the token via `readDeviceToken(req)`; header wins.
- [ ] Client sends `x-irl-device` (and body for DELETE); no endpoint receives the
      token as a query param in the Network tab.
- [ ] `cors()` advertises `x-irl-device`; preflight passes cross-origin.
- [ ] Query fallback still works (one-release window) and warns without logging the value.
- [ ] H1 suite extended: a `/mine` request with the token in a header returns the
      device's pins; with no token returns 400; the token never appears in any
      logged/echoed string.
- [ ] `npm test` + `npm run typecheck` green; no console errors in the app.

## Out of scope

Rotating/expiring device tokens (future), and the proof-of-presence binding on the
public read (**H3**). Follow-up: remove the deprecated query fallback next release.

## Verify

`npm run dev`, place a pin anonymously, open `/dashboard/irl-placements`: the
Network tab shows the `x-irl-device` header on `/mine` and **no `deviceToken=` in
any URL**. Delete a pin — succeeds via body token. Confirm the device's pins load.
