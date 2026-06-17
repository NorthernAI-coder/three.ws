# H5 — Privacy center: visibility, export, delete / forget device

> Epic IRL-Hardening · Size **L** · New `api/irl/privacy.js`, a privacy panel in
> `src/dashboard-next/pages/irl-placements.js` (or a new `irl-privacy.js`), and an
> anonymous-device entry point on `/irl`.

## Goal

Give every user — signed-in **and** anonymous — full control and full visibility
over the location data `/irl` holds about them: see exactly what's stored,
temporarily **unpublish** a pin without deleting it, **delete** individual pins,
**remove everything**, and **"forget this device"** (purge all rows tied to the
anonymous device token). This is right-to-be-forgotten as a polished product
surface, not a support-ticket.

## Why it matters

Trust requires an exit. A location product that can collect but can't forget is a
liability. Anonymous testers (the common case early on) have no account to manage —
yet their device token ties together a history of real places they stood. They
must be able to wipe it themselves, instantly, with one tap. A great privacy
center is also a *feature*: it signals that the platform takes this seriously,
which is exactly the bar the founder set.

## Current state (verified)

- Pins carry `user_id` (signed) **or** `device_token` (anonymous). `hidden_at`
  already exists on `irl_pins` (moderation column) — reuse it for owner-initiated
  **unpublish** (a hidden pin is filtered out of every nearby/mine read already).
- `DELETE /api/irl/pins?id=` exists, owner/device-gated. There is no bulk delete,
  no "forget device," no data-summary read, and no unpublish/republish for owners.
- `irl_interactions` rows store `viewer_device` + the pin's `lat`/`lng`; deleting a
  pin today leaves its interactions behind (retention gap — see **H6**, which this
  task's deletes must also trigger).
- `src/dashboard-next/pages/irl-placements.js` lists owned pins with remove wired.

## What to build

### 1. `api/irl/privacy.js` — the control endpoint (auth OR device-token via H2 header)

- `GET  /api/irl/privacy` → a plain-language **data summary**: pin count, oldest/
  newest placement, how many are precise vs approximate, interaction count,
  retention/expiry, and the literal list of what's stored ("approximate or exact
  coordinates you placed; an anonymous device id; messages visitors left"). No raw
  coordinates of other people; only the caller's own.
- `PATCH /api/irl/privacy { pinId, action: 'unpublish' | 'republish' }` → set/clear
  `hidden_at` on a pin the caller owns. Unpublished = invisible to everyone,
  recoverable by the owner.
- `DELETE /api/irl/privacy { scope: 'pin' | 'all' | 'device' }` →
  - `pin`: delete one owned pin (+ its interactions).
  - `all`: delete every pin owned by this user/device (+ their interactions).
  - `device`: `all` **plus** purge every `irl_interactions` row authored by this
    `viewer_device` (taps/messages this device left on *others'* pins), so the
    device id is fully forgotten. Owner-gated and null-guarded exactly like the
    existing DELETE (an empty token must match nothing).

Every delete path also removes dependent `irl_interactions` (the cascade H6
formalizes). Return counts so the UI can confirm ("Deleted 4 pins and 12
interactions").

### 2. Privacy panel UI

A clear panel (in the dashboard for signed-in users; reachable from `/irl` via a
"Privacy & my data" affordance for anonymous devices). Render the data summary,
a per-pin **Unpublish / Republish** toggle, **Delete pin**, and two destructive
actions behind a typed/explicit confirm: **Remove all my pins** and **Forget this
device**. Use the existing confirm/sheet components; destructive buttons styled as
destructive; success + error states designed.

### 3. Export

A "Download my data" action that streams the caller's own pins + interactions as
JSON (the same data the summary describes, in full). Honest and complete.

## Data / API changes

- New `api/irl/privacy.js` (GET/PATCH/DELETE). Register in `vercel.json`.
- No new columns (reuses `hidden_at`). Deletes cascade to `irl_interactions`.
- Uses the `x-irl-device` header from **H2** for anonymous auth.

## Acceptance checklist

- [ ] `GET /api/irl/privacy` returns an accurate, plain-language summary of only
      the caller's own data; never another user's coordinates.
- [ ] Unpublish hides a pin from all reads and is reversible; republish restores it.
- [ ] `scope: pin | all | device` delete works, owner/device null-guarded, cascades
      to `irl_interactions`, returns deleted counts.
- [ ] "Forget this device" leaves zero rows referencing that `device_token` or
      `viewer_device` — verify with a follow-up `GET` returning empty.
- [ ] Export downloads complete, correct JSON of the caller's own data.
- [ ] Destructive actions require explicit confirm; all states designed; a11y clean.
- [ ] H1 suite extended for the ownership/null-guard paths; changelog entry (`security`).
- [ ] `npm test` + `npm run typecheck` green; no console errors.

## Out of scope

Retention *automation* (the reaper changes live in **H6**; this task triggers
cascading deletes on demand). Placement-time consent + fuzz is **H4**.

## Verify

`npm run dev`: as an anonymous device place 2 pins + tap someone's pin, open
"Privacy & my data", confirm the summary matches, unpublish one (it vanishes from
nearby), then "Forget this device" and confirm a subsequent summary is empty and
the Network calls carry the `x-irl-device` header (no token in any URL).
