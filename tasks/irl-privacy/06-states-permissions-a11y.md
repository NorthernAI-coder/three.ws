# 06 — Every state, permission, and accessibility pass

> Size **M** · `src/irl.js` (`updateNearbyBadge`, `setNetPill`, `updatePresence`,
> rate-limit handling in `loadNearbyPins`), `src/irl/onboarding.js`, `src/irl.css`,
> `pages/irl.html`. The CLAUDE.md "every state is designed" bar, applied to /irl.

## Goal

Make every state a user can reach on /irl deliberate, polished, accessible, and
honest: loading, permission-prompt, permission-denied (camera / motion / location,
each independently), GPS-acquiring, empty, populated, rate-limited, offline/poll,
and error. No raw strings, no dead ends, no jank.

## Why it matters

/irl asks for the three scariest permissions a web app can (camera, motion,
location) and then renders a live AR scene. The difference between a product people
trust and one they close in the first 10 seconds is entirely in how these states
feel. Today several are bare badge text or a generic message. "Best possible UX"
means each state tells the user exactly what's happening and what to do next.

## Current state (real lines)

- `src/irl/onboarding.js` returns per-sensor denial copy (camera / motion / location)
  with "Try again." Good base; needs a designed surface + recovery per browser.
- `src/irl.js` `setNetPill('live'|'connecting'|'idle')` → `#irl-net-pill` (presence
  socket status). `updatePresence` → `#irl-presence-chip` ("N viewing nearby", shown
  only when `_streamOnline && count > 1`). `updateNearbyBadge` → `#irl-nearby-badge`.
- `loadNearbyPins()` sets `_nearbyError = true` on a failed fetch and surfaces it on
  the badge, but a **429 rate-limit** response is not distinguished from a generic
  failure — the user gets no actionable message if they somehow trip the limiter.

## What to build

1. **Permission states** — a designed panel for each of: prompt (why we need it,
   before the browser asks), denied (per-sensor recovery steps, reusing
   `onboarding.js` copy), and unsupported (no camera → "3D scene still works"
   fallback, the existing graceful path). Camera-denied must still allow the
   compass/GPS placement path.
2. **GPS-acquiring** — a distinct "finding your location…" state (skeleton, not a
   spinner) so the gap before the first fix isn't mistaken for "empty."
3. **Rate-limited** — detect `429` in `loadNearbyPins` and show a calm, specific
   message ("Refreshing too fast — catching up…") with auto-recovery on the next
   cycle; never a scary error. Distinct from the generic offline/error badge.
4. **Net pill + presence chip** — final copy + visual states; the pill reflects only
   the presence socket (pins always poll), so its "offline" state must NOT imply
   discovery is broken. Reduced-motion for the connecting pulse.
5. **Accessibility** — semantic roles, `aria-live="polite"` on the state region
   (announce on transition only, not every poll), visible focus rings on all
   controls, ≥4.5:1 contrast over the camera feed (scrim where needed), full keyboard
   path for the Place / mute / share / "?" controls, and `prefers-reduced-motion`
   across all transitions.
6. **Responsive** — verify 320 / 768 / 1440 and notched/safe-area insets on mobile.

## Acceptance checklist

- [ ] Each of camera/motion/location has a designed prompt + denied + recovery state;
      camera-denied still permits compass/GPS placement.
- [ ] GPS-acquiring state is visually distinct from empty.
- [ ] `429` from the nearby read → calm, specific, auto-recovering message.
- [ ] Net pill never implies discovery is down when only presence dropped.
- [ ] aria-live announces transitions once; focus rings + keyboard nav on every
      control; contrast ≥4.5:1 over the camera; reduced-motion honored.
- [ ] Clean at 320/768/1440 with safe-area insets; zero console errors/warnings.
- [ ] Holder changelog entry (improvement) + `build:pages`.

## Out of scope

The empty-state explainer content (task 02) and the arrival cue (task 03) — this
task makes the *surrounding* states match that bar and adds the missing ones.

## Verify

`npm run dev` → /irl: deny each permission in turn (browser site settings) and
confirm each designed state + recovery; throttle the network / force a `429`
(temporarily lower the limiter) and confirm the rate-limited state; run an
accessibility audit (axe or Lighthouse) with zero serious violations.
