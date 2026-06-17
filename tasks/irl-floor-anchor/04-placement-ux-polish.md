# 04 — Placement UX polish (reticle, shadow, confirm, haptics)

> Epic IRL/floor-anchor · Size **M** · Depends on 01/02; parallel with 03.
> Turns a functional placement into one people screenshot and share.

## Goal

Raise the moment-to-moment feel of placing an agent to the bar of the best mobile
AR apps: a reticle that reads as "searching" vs "locked," a grounded preview that
casts a contact shadow (so the agent sits *on* the floor, not floats), a crisp
confirm beat with haptics when the anchor takes, and copy/motion that respects
accessibility. Everything here is feel — but feel is the product.

## Why it matters

Right now placement is: a static purple ring appears, you tap, text changes. It
works, but nothing signals "found it," nothing grounds the avatar, and the commit
moment is silent. These micro-interactions are precisely what make AR feel solid
versus janky. This is the screenshot-and-share task.

## Current state (real lines)

- Reticle is a single static ring, visible/invisible only:
  [src/ar/webxr.js:225-236](../../src/ar/webxr.js#L225-L236) (`_buildReticle`,
  color `0x9b8cff`), toggled at [171-184](../../src/ar/webxr.js#L171-L184).
- Hit transitions already fire a host callback on change only:
  [src/ar/webxr.js:246-251](../../src/ar/webxr.js#L246-L251) `_setHit` → `onHit`.
- Host hint copy: [src/irl.js:1596-1603](../../src/irl.js#L1596-L1603) and the
  `setXrHint` states through [src/irl.js:1668-1684](../../src/irl.js#L1668-L1684).
- The previewed avatar follows the reticle but has no shadow:
  [src/ar/webxr.js:176-178](../../src/ar/webxr.js#L176-L178).
- Overlay + hint styles: [pages/irl.html:448-511](../../pages/irl.html#L448-L511).

## What to build

1. **Reticle states.**
   - *Searching* (no hit): dimmer, slow breathing scale/opacity pulse.
   - *Locked* (hit found): brighter, snaps to full size with a quick scale-in,
     subtle continuous rotation or inner-dot fill so "ready to place" is obvious.
   Drive purely off the existing `_setHit` transition — no new per-frame branching
   beyond a lerp. Respect `prefers-reduced-motion`: no pulse/spin, just a static
   color/opacity swap.

2. **Contact shadow.** Add a soft radial shadow quad (or `ShadowMaterial` plane)
   under the previewed avatar and the placed agent so it reads as grounded. Lives
   in the XR scene, follows the reticle pre-tap and the anchor post-tap; disposed in
   `_handleEnd`. Keep it cheap (single transparent plane, no real shadow map).

3. **Confirm beat.** On successful `_handleSelect` anchor:
   - a one-shot reticle "pulse-out" ring animation,
   - `navigator.vibrate?.(15)` (guarded; iOS ignores it harmlessly),
   - the hint transitions to the existing "Anchored…" copy with a brief check/✓
     affordance in `.irl-xr-hint`.

4. **Copy pass.** Tighten the four hint states for clarity and warmth without
   jargon (searching → aiming → placed → saved). Keep `aria-live="polite"` on
   `#irl-xr-hint` ([pages/irl.html:1660](../../pages/irl.html#L1660)) so each state
   is announced. Ensure the exit affordance keeps its focus ring
   ([pages/irl.html:500](../../pages/irl.html#L500)).

5. **Reduced-motion + contrast.** Gate every animation behind
   `prefers-reduced-motion: reduce`. Verify reticle/hint contrast against bright and
   dark real-world backgrounds (the overlay sits over live camera) — add a subtle
   scrim behind the hint text if it fails on a white floor.

## Acceptance checklist

- [ ] Reticle visibly distinguishes searching vs locked; reduced-motion path is
      static and calm.
- [ ] Avatar shows a contact shadow both as preview and once anchored; no float.
- [ ] Anchor commit gives a visual pulse + haptic (where supported) + ✓ copy.
- [ ] All four hint states are clear, announced via `aria-live`, readable over both
      light and dark camera backgrounds.
- [ ] No per-frame allocations added; disposed cleanly on exit; no console noise.

## Out of scope

Occlusion (03), iOS parity (06). Don't change the anchoring math or persistence.

## Verify

WebXR device: sweep the phone across floor and away — watch searching↔locked;
confirm the shadow grounds the avatar; tap and feel the haptic + see the pulse +
✓. Re-run with reduced-motion enabled in OS settings and confirm calm static
states. Check the hint over a white floor and a dark rug.
