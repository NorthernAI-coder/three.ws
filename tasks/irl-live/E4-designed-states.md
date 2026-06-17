# E4 — Designed states across every IRL surface

## Goal

A systematic pass so **every** IRL surface — the AR view, the radar, the inspect
card, the My-pins sheet, and the owner dashboard pages — has a designed
**empty / loading / error / permission / unsupported-device** state, built on
`src/shared/state-kit.js` and consistent with the platform's just-completed
network/input error-boundary audit. No surface ever renders a blank container, a
bare spinner, or an unhandled rejection.

## Why it matters

The rest of the codebase now fails into designed states via `state-kit` +
`async-state` (`loadInto`/`renderError`). IRL is the loudest exception: it leans on
a 3-second `setStatus()` toast (`src/irl.js:92`) for *everything* — camera failure,
avatar failure, GPS-not-ready, empty pins. A toast that vanishes is not a designed
state. This task brings IRL up to the same bar surface by surface, so the product
feels finished from the first empty location to a mid-session network drop.

## Current state (real lines)

- **Single toast for all states:** `setStatus()` `src/irl.js:92` (auto-hides at 3 s,
  `:99`). Used for avatar-load errors (`:634`, `:1420`), camera errors (`:204`),
  payment errors (`:1213`), delete errors (`:1103`). Transient, not designed.
- **My-pins:** has a real empty state string (`src/irl.js:1072`) and a "Loading…"
  string (`:1090`) but hand-rolled, not state-kit; no error state (a failed
  `loadMyPins()` returns `[]` `:1063` → shows the *empty* copy, masking the error).
- **Nearby pins:** `loadNearbyPins()` swallows failures (`catch {}` `:947`); a busy
  spot that fails to load looks identical to an empty one.
- **Inspect card / sheet:** `openPinSheet()` `:1135` assumes fields exist; no
  loading/error state when richer card data (Epic B2) is fetched.
- **Dashboard:** `src/dashboard-next/pages/irl-placements.js` (~274 lines) lists
  placements — must use `loadInto()` from `async-state.js` for its four states.
- **Toolkit available:** `emptyStateHTML` / `errorStateHTML` / `skeletonHTML` /
  `ensureStateKitStyles` / `attachRetry` (`src/shared/state-kit.js`), and
  `loadInto` / `renderError` (`src/shared/async-state.js`).

## What to build

A surface-by-surface audit. For each surface below, wire the listed states with
state-kit (and `loadInto`/`renderError` where there's a fetch). Add a small
`#irl-overlay` host for full-screen IRL states (camera/GPS/unsupported) so the AR
view has a designed canvas-level state, not just toasts.

### Surface → required states (the checklist)

| Surface | Loading | Empty | Error | Permission | Unsupported |
|---|---|---|---|---|---|
| **AR view** (scene boot, camera) | avatar skeleton / "Loading agent…" overlay | n/a (scene always present) | avatar-load error card w/ **Retry** (replaces toast at `:1420`) | camera/motion/location denied → recovery card (defer to **E1**, but the overlay host lives here) | no-WebGL / no-getUserMedia → "This device can't run IRL AR" + what still works |
| **Radar** (`#irl-radar`) | — (derives from pins) | "No agents in range" hint when GPS-ready but `nearbyPins` empty | pin-fetch failed → small error dot/tooltip + retry on next interval | hidden until GPS granted (handled by gps-mode class) | hidden if no geolocation |
| **Inspect card** (`#irl-sheet`) | skeleton rows while card data (B2) loads | "No services yet" when agent has no skills/x402 | `renderError` w/ Retry if card fetch fails | wallet-not-connected state on Pay (exists at `:1175`) — formalize w/ state-kit | Pay hidden if no `x402_endpoint` (exists at `:1145`) |
| **My-pins sheet** (`#irl-mypins-list`) | `skeletonHTML(3,'row')` (replace "Loading…" `:1090`) | keep current empty copy, via `emptyStateHTML` | **new** error state when `loadMyPins()` fails — stop masking it as empty (`:1063`) | "Enable location to manage pins" when GPS denied | — |
| **Nearby pins** (load loop) | first-load skeleton in radar/badge | nearby badge hidden + "Be the first to pin here" hint | surface `loadNearbyPins` failure (`:947`) → retry indicator, not silent | — | — |
| **Dashboard placements** (`irl-placements.js`) | `loadInto` skeleton (`variant:'row'`) | "No pins placed yet" + CTA to `/irl` | `loadInto` error w/ Retry | signed-out → sign-in CTA | — |

### Implementation notes

- **AR-view overlay host:** add `<div id="irl-overlay" hidden>` to `pages/irl.html`
  (full-screen, above canvas). Render `errorStateHTML`/`emptyStateHTML` into it for
  avatar-load failure (wire `attachRetry` → re-run `loadAvatar`) and
  unsupported-device. This replaces the sticky error toast as the *primary* surface;
  keep `setStatus` only for ephemeral progress ("Camera on", "Pin removed").
- **My-pins:** route through `loadInto(list, { load: loadMyPins, render, empty, skeleton:{count:3,variant:'row'} })`
  so the error case stops collapsing into empty.
- **Nearby fetch:** on `loadNearbyPins` catch, set a transient "couldn't refresh
  nearby" indicator on the badge and retry on the next 15 s interval — visible, not silent.
- **Dashboard:** replace bespoke list rendering with `loadInto`.
- **Copy is plain + actionable** (matches the platform's error-message audit): say
  what happened and the next step; tuck technical detail behind `emptyStateHTML`'s
  `tip` where useful. Respect `prefers-reduced-motion` (state-kit already does).

## Data / API changes

None. This is a presentation/error-boundary pass over existing fetches
(`loadMyPins`, `loadNearbyPins`, placements list, avatar load) and the inspect-card
fetch introduced by B2.

## Acceptance checklist

- [ ] Every row of the surface→states table is implemented with `state-kit` / `async-state`.
- [ ] `#irl-overlay` host added; avatar-load failure shows a designed **Retry** card (not a vanishing toast).
- [ ] Unsupported-device state (no WebGL / no `getUserMedia`) renders designed copy explaining what still works.
- [ ] My-pins uses `loadInto`; a failed `loadMyPins()` shows an **error** state, no longer masquerading as empty.
- [ ] `loadNearbyPins` failures surface a visible retry indicator instead of `catch {}` silence.
- [ ] Inspect card has loading skeleton + error/empty for service data; wallet-not-connected formalized via state-kit.
- [ ] Dashboard `irl-placements.js` renders all four states through `loadInto`.
- [ ] `setStatus` is reserved for ephemeral progress only; no permanent state depends on a toast.
- [ ] Copy is plain, actionable, platform-consistent; reduced-motion respected; no console errors.

## Out of scope

- The permission *prompt/onboarding flow* itself (E1) — E4 only provides the AR-view
  overlay host and the denied-state copy that E1 fills.
- The inspect-card *content* and card API (Epic B2/B3) — E4 designs its loading/empty/error shells.

## Verify

`npm run dev`, `/irl`. Force each state: deny GPS (My-pins → location-needed; radar
hidden), break the avatar URL (overlay error + Retry), throttle network offline then
open My-pins (error state, not empty), open a fresh location (nearby empty hint).
Visit the dashboard placements page signed-out (sign-in CTA) and with zero pins
(empty CTA). Confirm no surface ever shows a blank container or a lone spinner.
`npm test` green; `git diff` reviewed.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/E4-designed-states.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
