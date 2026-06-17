# IRL nearby-read — threat model (H7)

The `/irl` world lets anyone place a 3D agent at a real GPS spot and lets a passer-by
discover it in AR. The single most sensitive thing the platform does here is reveal
**where an agent is**. This document states, honestly, what the public nearby read
protects against, how it degrades, and the residual exposure we accept by design.

The one read in scope: `GET /api/irl/pins?lat&lng&radius` — the per-viewer proximity
feed. It is the **only** surface that ever returns another user's agent location.
(`/api/irl/pins/mine`, `agent-card`, `agent-summary`, `interactions*`, `report`,
`share-frame` do not — see `reports/irl-location-leak-audit.md`.)

## What the read protects against

| Threat | Control | Where |
|---|---|---|
| **Remote browsing** ("show me agents in Tokyo from my couch") | The caller must send their **own** `lat`/`lng`; results are filtered to `distance_m <= radius`. There is no bbox/window/roster feed and no realtime pin broadcast. | `api/irl/pins.js` nearby branch; `multiplayer/src/rooms/IrlRoom.js` (syncs no pins) |
| **Wide-radius scrape** | `radius` is clamped to `[10, 60]` m server-side; a present-but-non-finite radius is rejected (no NaN box). | `api/irl/pins.js` `Math.min(60, Math.max(10, …))` |
| **Bulk grid harvest** | Per-IP rate limit on every read; **fail-closed** if the limiter can't decide (deny, never an unmetered window). Distinct-cell **sweep detection** fires a deduped, coordinate-free ops alert when one caller reads many geocells in a short window. | `limitFailClosedRead`, `recordCellRead` in `api/irl/pins.js`; `limits.publicIp` in `api/_lib/rate-limit.js` |
| **De-anonymization** (who placed this agent?) | The public projection is an explicit allow-list: `user_id` / `device_token` are never returned; only an `is_mine` boolean computed server-side. | `api/irl/pins.js` nearby projection |
| **Coordinate fingerprinting** | Returned coordinates are coarsened to 5 decimals (~1.1 m, finer than GPS error but stripped of the false-precision tail). The room origin is coarsened too; exact intra-room layout rides relative offsets, not absolute coords. | `roundCoord`, `PUBLIC_COORD_DP` in `api/irl/pins.js` |
| **Credential / position leak via logs** | `req.url` (which carries `lat`/`lng`/`deviceToken`) is redacted before any log/Sentry/Telegram sink. The sweep alert carries only a SHA-256 IP hash + a count — never a coordinate, IP, or geocell. | `redactUrl` in `api/_lib/http.js`; `recordCellRead` alert payload |
| **Stale / abusive pins surfacing** | `hidden_at IS NULL` (community-moderation hide at 3 distinct reporters) and `expires_at` (anon pins 7-day) filter every read path. | `api/irl/pins.js`, `api/irl/report.js` |

## Degradation behaviour (no silent fail-open)

- **Limiter degraded / throws on the read** → **fail closed**: the read returns a
  retryable `rate_limiter_unavailable` (HTTP 429), surfaced to the client as
  "temporarily unavailable, retrying." It never serves an unmetered read. The
  backing bucket (`limits.publicIp`) is an in-memory `local` limiter that never
  touches Redis, so it does not throw in practice; `limitFailClosedRead` makes the
  guarantee explicit and asserted (`tests/api/irl-pins-hardening.test.js`).
- **Write limiter degraded** (place/edit/delete) → **fail open**: the DB density,
  per-owner, and report-dedup caps still bound writes, so an infra hiccup never
  blocks a legitimate placement. This asymmetry is deliberate: a blind limiter on a
  *write* is bounded downstream; a blind limiter on the *location read* is not.
- **Sweep detection / ops alert** is best-effort: it is fire-and-forget, wrapped so
  it can never delay or fail the read, and degrades to "no alert" if the cache or
  Telegram is unavailable. It never widens or narrows what the read returns.

## Accepted residual exposure (by design — this is the product)

- **A person physically standing at a spot can see the handful of pins right where
  they stand.** That is the entire feature: you discover an agent in AR by being
  next to it. Within the ≤60 m radius, a co-located caller learns those pins'
  coarsened coordinates. We do not consider this a leak — it is the product working.
- **A determined attacker who physically walks a grid** can, cell by cell, see each
  cell's pins as they enter it (a real fix per cell, slowly, tripping neither the
  per-minute limit at low rate nor — if patient enough — necessarily the sweep
  threshold). The sweep detector raises the cost and surfaces the pattern to ops, but
  physical presence is, by definition, allowed to see what is physically present.
  We accept this; the data exposed is still coarsened, owner-stripped, and bounded to
  cells the attacker actually visited.
- **Coordinate precision is ~1.1 m, not exact.** This is a deliberate coverage cap:
  the public read intentionally returns less precision than the placement stored.
  Room-anchored agents keep exact intra-room layout via relative offsets, so the cap
  costs render quality nothing while removing the false-precision fingerprint.

## Out of scope here

- Proof-of-presence (H3) — a cell-bound fix token would further bind a read to a
  real, recent fix in that cell, denying a token-per-cell sweep. If/when it lands,
  the cross-cell denial assertion belongs in `tests/api/irl-pins-hardening.test.js`.
- Per-account reputation / banning of repeat sweepers (future).

No limit in this document silently reduces coverage: every cap above is written down.
If a future change tightens the radius, the rate limit, or the coordinate precision
in a way that drops legitimate discovery, update this file in the same change.
