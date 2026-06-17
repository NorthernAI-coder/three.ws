# H4 — Placement consent + approximate-placement control

> Epic IRL-Hardening · Size **M** · Touches `src/irl.js` (placement flow),
> `pages/irl.html`, `api/irl/pins.js` (POST), and `data/changelog.json`.

## Goal

Make the privacy consequence of placing an agent **legible and controllable at
the moment of placement.** Today a tap-to-place drops the agent at the user's
exact spot with no disclosure and no option to fuzz it. Add: (1) a clear,
friendly disclosure of what placing means, (2) an **"approximate placement"**
option that stores a deliberately fuzzed coordinate for users who want plausible
deniability, and (3) a visible indicator of whether a pin is precise or
approximate. Privacy becomes a designed, first-class part of the UX — not a thing
the user has to infer.

## Why it matters

The single most dangerous moment in `/irl` is placement: that coordinate *is* the
user's real location, and it persists (7 days anon, forever signed-in) for anyone
nearby to read. A great product tells the user exactly what's about to happen and
gives them a safer default if they want it. "Approximate placement" lets someone
drop an agent "around here" — on a block, in a park — without publishing their
doorstep. This is the difference between a tool people trust and one they don't.

## Current state (verified)

- `src/irl.js` captures the fix (`gpsState.lat/lng/accuracy`) and `savePin()`
  POSTs `{ lat, lng, heading, … }` to `api/irl/pins.js`.
- `api/irl/pins.js` POST validates coords, runs content/coin/URL gates, density +
  per-owner caps, then inserts. It already stores `gps_accuracy_m`. The public
  read now coarsens output to ~1.1 m (`roundCoord`, shipped) — but the **stored**
  coordinate is still the precise fix.
- No disclosure UI, no approximate option, no precise/approximate flag exists.

## What to build

### 1. Placement consent sheet (designed, one-time + re-openable)

Before the first placement (and available behind an "i" affordance after), show a
short sheet via the existing sheet/state-kit components:

> **Heads up — this is a real-world spot.** Your agent will be visible to anyone
> who physically walks within ~40 m of here. We never show a list or map of
> locations, and we never reveal who placed it — but the spot itself is public.
> Want to place it exactly here, or approximately?
> `[ Place exactly here ]  [ Place approximately ▾ ]`

Persist "don't show every time" but keep the choice (exact vs approximate)
explicit per placement. No dark patterns — both options are equally prominent.

### 2. Approximate placement (client + server)

When the user picks approximate, offer a small radius choice (e.g. ~30 m / ~100 m /
~250 m). The client fuzzes the coordinate by a uniform random offset within the
chosen radius **before** POSTing, and sends `placement: 'approximate'` +
`fuzz_radius_m`. The server (`api/irl/pins.js` POST) validates `fuzz_radius_m`
against an allow-list, stores a new `placement_kind` column (`'precise'` |
`'approximate'`) and `fuzz_radius_m`, and — importantly — **never stores the
original precise fix** for an approximate placement. The agent renders at the
fuzzed spot for everyone, including the owner, so the true location is never
persisted at all.

### 3. Visible indicator

On the owner's pin cards (`irl-placements.js`) and in the pin inspect sheet, show a
small badge: `📍 Exact` / `≈ Approximate (~100 m)`. The owner always knows how
exposed each pin is. Re-placing/relocating (C5) preserves the chosen kind.

### 4. Copy + changelog

Plain, calm, non-alarmist language (see `public-copy-tone` memory: literal, no
sci-fi). Add a `data/changelog.json` entry (tag `security`, `improvement`).

## Data / API changes

- `irl_pins`: `ALTER TABLE ADD COLUMN IF NOT EXISTS placement_kind TEXT DEFAULT 'precise'`
  and `fuzz_radius_m DOUBLE PRECISION`. Lazy-migrate in `ensureTable()` (same
  pattern as the existing `ALTER … ADD COLUMN IF NOT EXISTS` block).
- POST accepts `placement` + `fuzz_radius_m` (validated against an allow-list).
- Nearby projection surfaces `placement_kind` so viewers/owners can show the badge.

## Acceptance checklist

- [ ] Consent sheet appears before first placement, re-openable via an "i" control,
      both options equally weighted, "don't show again" respected.
- [ ] Approximate placement fuzzes client-side; server stores only the fuzzed
      coordinate + `placement_kind='approximate'` + `fuzz_radius_m`; the precise
      fix is never persisted.
- [ ] Exact/Approximate badge shows on owner cards + inspect sheet.
- [ ] `placement_kind` migrates lazily; old pins read as `'precise'`; no 500.
- [ ] Designed states; 320/768/1440; keyboard + screen-reader labels; no console errors.
- [ ] Changelog entry added; `npm test` + `npm run typecheck` green.

## Out of scope

The privacy center (unpublish/delete/forget — **H5**) and proof-of-presence on the
read (**H3**). This task is the *placement-time* consent + fuzz only.

## Verify

`npm run dev` → `/irl`: first placement shows the consent sheet; choosing
approximate (~100 m) drops the agent visibly offset; the Network tab POST body
carries the fuzzed coord + `placement: 'approximate'`; the owner card shows the
`≈ Approximate` badge.
