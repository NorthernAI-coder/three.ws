# L3 — Location Privacy Center + disclosure

> Epic · Size **M** · Touches `src/irl.js`, `pages/irl.html`, `src/irl/onboarding.js`.
> Owns the controls + copy; **L4** implements the approximate-discovery behavior this toggles.

## Goal

One designed, reachable surface in `/irl` — a **"Location & privacy"** sheet —
that tells the user, in plain language, exactly what is shared and gives them the
controls in one place:

1. **What's stored & who sees it** — honest disclosure: a placed pin's coordinates
   reach another person *only* when they're physically within ≤60 m of it, never as
   a map/roster, never with your account id; anonymous pins auto-expire in 7 days.
2. **Discovery precision** — *Precise* (default) vs *Approximate*: when approximate,
   the coordinate sent to the nearby read is coarsened on-device (L4) so browsing
   doesn't hand the server your exact position.
3. **Appear to others** — surface the existing presence opt-in (`getShareGhost`,
   default off) here so every location-sharing control lives together.
4. **Manage placements** — a link straight into the My-pins sheet (L5).

Plus a **first-run disclosure**: the first time location is granted, a short,
designed explainer (not a wall of text) covering the same three facts, wired into
the existing onboarding so it's shown once and never nags again.

## Why it matters

The user's literal worry — "my actual location is going to leak" — is mostly a
*trust* problem, and trust is built with disclosure and control, not silence. The
privacy posture is already strong (tight radius, no roster, owner-id stripped,
7-day expiry) but it's **invisible**: nothing in the UI tells the user any of it,
and the one real lever (don't broadcast exact position while browsing) doesn't
exist yet. A single honest control center turns an anxious tester into a confident
user and is the difference between "felt creepy" and "felt in control."

## Current state (real lines)

- `src/irl.js:1820` `getShareGhost()` / `setShareGhost()` (localStorage `irl_share_ghost`,
  default off), toggle handler `:2578`, `syncGhostToggle` `:2568`, comment at `:1815`
  documenting count-only presence. The presence control exists but lives alone.
- `src/irl.js:2009` `loadNearbyPins()` sends `gpsState.lat/lng` verbatim (`:2016`) — the
  exact-position-while-browsing vector L4 fixes; L3 provides the toggle that drives it.
- `src/irl/onboarding.js:22` `PERMS.location`, persisted outcomes (`SAVE_KEY`), designed
  state cards via state-kit — the place to attach first-run disclosure.
- `src/irl.js:2561` My-pins button + `openMyPinsSheet` (`:2514`) — link target.

## What to build

### 1. "Location & privacy" sheet

A bottom sheet opened from a small shield/location control in the `/irl` topbar.
Sections, each with microcopy:

- **What others can see** — 2–3 plain sentences with the real facts (≤60 m radius,
  no map/roster, no account id, anonymous pins expire in 7 days). No legalese.
- **Discovery precision** — a segmented control: `Precise · exact` / `Approximate ·
  ~city-block`. Persist to localStorage (`irl_discovery_precision`, default `precise`).
  Expose the chosen mode so `loadNearbyPins` (L4) reads it. Copy explains the
  trade-off: approximate keeps your exact position off the server but may surface
  agents a little less precisely.
- **Appear to others** — move the existing ghost toggle here (keep the topbar pill
  too, or make this the canonical home and have both reflect the same state via
  `syncGhostToggle`). Default off; copy matches `:1815`.
- **Your placements** — a row that opens the My-pins sheet ("Manage / remove the
  agents you've placed →").

All four sections use state-kit styling; the sheet is keyboard-navigable, `Esc`
closes, controls have ARIA roles/labels, and it's clean at 320 / 768 / 1440px.

### 2. First-run disclosure (onboarding)

In `src/irl/onboarding.js`, after location is **granted** for the first time, show
a one-screen disclosure card (reuse the module's card renderer) with the same
three facts + a single "Got it" action, then persist a flag (e.g.
`irl_location_disclosed_v1`) so it never shows again. Do **not** block the flow —
it's informational, dismissible, shown once. If location is denied/unsupported,
skip it (onboarding already handles those states).

### 3. Persistence helpers

Add `getDiscoveryPrecision()` / `setDiscoveryPrecision()` next to the ghost helpers
(`src/irl.js:1820`), localStorage-backed, try/catch-guarded like the existing ones.
Export/expose the getter so L4's `loadNearbyPins` can read it without a circular hop.

## Data / API changes

None server-side. Purely client state (localStorage) + UI. L4 consumes
`getDiscoveryPrecision()`; this task ships the control and the default (`precise`),
so behavior is unchanged until L4 lands the coarsening.

## Acceptance checklist

- [ ] A "Location & privacy" control in the `/irl` topbar opens the sheet.
- [ ] Sheet shows honest "what others can see" copy, a precise/approximate toggle (persisted, default precise), the presence opt-in, and a link into My-pins.
- [ ] Ghost toggle state stays in sync wherever it's shown (`syncGhostToggle`).
- [ ] First location grant shows a one-time disclosure card; it never re-shows; denied/unsupported skip it.
- [ ] `getDiscoveryPrecision()` exists, defaults `precise`, persists across reload.
- [ ] Keyboard + ARIA pass; 320 / 768 / 1440px clean; no console errors/warnings.
- [ ] `data/changelog.json` entry added (`feature`/`improvement`); `npm run build:pages` passes.

## Out of scope

The actual coordinate coarsening on the nearby read (**L4** — this task only ships
the toggle + default). The map placement picker (L2). My-pins internals (L5).

## Verify

`npm run dev` → `/irl`: open Location & privacy, flip to Approximate (persists on
reload), confirm the disclosure copy reads honestly against `api/irl/pins.js`
behavior, follow the link into My-pins. Fresh profile (clear localStorage), grant
location → the one-time disclosure card appears once.
