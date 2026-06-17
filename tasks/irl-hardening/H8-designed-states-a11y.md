# H8 — Designed states, permission onboarding & accessibility

> Epic IRL-Hardening · Size **M** · Touches `src/irl.js`, `pages/irl.html`,
> `src/irl/onboarding.js`, and `src/shared/state-kit.js` usage across IRL surfaces.

## Goal

Every IRL state — especially the privacy- and sensor-related ones — is **designed,
helpful, and accessible.** No blank screens, no dead ends, no mystery permission
prompts. The user always knows what's happening, why a permission is needed, what
their privacy posture is, and how to move forward. This is the polish layer that
makes `/irl` feel like a flagship product instead of a demo.

## Why it matters

A phone-camera AR product lives or dies on its first 30 seconds: camera, motion,
and location permissions, often on iOS Safari (which needs an explicit user
gesture for motion and has no WebXR). Get the onboarding wrong and the user sees a
frozen black screen and leaves. Get the privacy states wrong and they don't trust
it. Best-possible UX means every one of these moments is intentional.

## Current state (verified)

- `src/irl/onboarding.js` exists (permission flow scaffolding); `src/shared/state-kit.js`
  provides skeleton/empty/error/retry shells used elsewhere in the app.
- `src/irl.js` watches GPS, runs the camera passthrough + gyro look, has an
  avatar-load error overlay (`showAvatarLoadError`), and a poll/WS fallback for
  presence (`src/irl-net.js` `unavailable`/`failed` statuses).
- Coverage is uneven: not every sensor-denied / no-fix / offline / privacy state is
  a first-class designed state, and the new privacy surfaces (H3 `fix_required`, H4
  consent, H5 controls) need states too.

## What to build

### 1. The full state matrix — each one designed

For `/irl`, ensure a designed, actionable state for **every** case:

| State | What the user sees / can do |
|---|---|
| Camera permission needed / denied | Why it's needed + how to re-enable (with iOS Safari path), Retry |
| Motion permission (iOS gesture) | A tappable "Enable motion" affordance (iOS requires the gesture) |
| Location permission needed / denied | Why + re-enable steps; degrades gracefully (no crash) |
| Acquiring GPS fix (no fix yet) | A calm "Getting your location…" with a skeleton, not a freeze |
| `fix_required` from the read (H3) | "We need your location to show nearby agents" + enable CTA |
| No nearby agents (empty) | "No agents here yet — be the first" + Place CTA, not a void |
| Offline / realtime unavailable | Presence hidden, discovery still polling; honest pill, not a spinner loop |
| Unsupported device / no WebGL | Clear fallback message; never a blank canvas |
| Privacy posture (always visible) | A small, persistent indicator: "Discovery is local-only · presence is anonymous" linking to H5's privacy center |

Reuse `state-kit.js`; do not hand-roll one-off markup. Loading uses skeletons, not
bare spinners.

### 2. Permission onboarding flow

Harden `src/irl/onboarding.js` into a guided, resumable sequence (camera → motion
→ location), each step explaining *why* before the native prompt, each handling
deny without trapping the user, and the iOS motion step gated behind a real tap.
Re-entrant: a user who denied then changed OS settings can retry without reload.

### 3. Accessibility pass (the whole surface)

- Semantic landmarks; every control has an accessible name (ARIA where needed).
- Full keyboard path: open/close sheets, place, tap a pin, navigate cards, reach
  the privacy center — all without a pointer; visible focus rings.
- Respect `prefers-reduced-motion` (the ghost pulse, transitions, any camera
  easing) — provide a calm static alternative.
- Color contrast ≥ WCAG AA on every chip/badge/state, including over the camera
  feed (use scrims/backplates so text stays legible on any background).
- Screen-reader announces state changes (placed, error, permission needed) via a
  polite live region.

### 4. Microinteraction polish

Hover/active/focus on every interactive element; intentional enter/exit on sheets
and pins (opacity/transform, GPU-friendly); no jarring pops. The privacy indicator
and consent affordances feel native, not bolted on.

## Acceptance checklist

- [ ] Every state in the matrix is a designed `state-kit` state with a working action.
- [ ] iOS Safari: motion permission gated behind a gesture; camera/location denies
      degrade gracefully; tested on a real device or accurate emulation.
- [ ] Persistent, legible privacy indicator linking to the privacy center.
- [ ] Full keyboard operability + visible focus; `prefers-reduced-motion` honored;
      AA contrast over the camera feed; live-region announcements.
- [ ] 320 / 768 / 1440 px clean; no console errors or warnings from our code.
- [ ] `npm test` + `npm run typecheck` green.

## Out of scope

The privacy *backend* (H3/H5) and consent *logic* (H4) — H8 designs and wires their
**states and accessibility**, not their server behavior.

## Verify

`npm run dev` → `/irl` on a throttled mobile profile: deny each permission in turn
and confirm a designed, recoverable state every time; tab through the entire
surface with no mouse; toggle reduced-motion; confirm the privacy indicator is
always visible and links to the privacy center.
