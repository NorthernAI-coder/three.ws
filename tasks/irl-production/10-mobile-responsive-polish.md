# Task 10 — Mobile & responsive polish

**Phase:** 2 (UX / polish) · **Effort:** S · **Files:** `pages/irl.html`, `src/irl.js`

## Why
IRL is a phone-first product. It must be flawless at 320px, on notched devices, in
both orientations, and must not trigger iOS's input-zoom. Today there are gaps in
safe-area handling, small-screen layout, and input sizing that would make a senior
designer wince.

## Read first (verify before fixing)
- Viewport meta — `pages/irl.html` `<meta name="viewport">` (must allow safe-area + no forced zoom)
- Joystick CSS + safe-area — `pages/irl.html` `.irl-joystick` / `#irl-joystick` (~216-234)
- Bottom controls + secondary row layout — the control-row CSS
- Caption textarea font-size — `pages/irl.html` (~1673) — iOS zooms inputs < 16px
- Floating agent labels — `.irl-agent-label` (~990-1061) + `updateLabels()`
- Calibrate readouts — `.irl-cal-*`

## Scope — confirm, then fix

1. **Safe-area insets in both orientations.** Every fixed control (joystick, bottom
   controls, topbar, sheets) respects `env(safe-area-inset-*)` in portrait AND
   landscape. Nothing hides under the notch, home indicator, or rounded corners.

2. **320px layout.** At the narrowest common width, the secondary control row must
   not squish illegibly or clip. Allow wrapping or a horizontal scroll affordance;
   ensure all controls remain tappable (min 44×44 target).

3. **iOS input-zoom.** Set the caption textarea (and any input) to `font-size: 16px`
   on mobile to stop Safari auto-zooming on focus; scale down on desktop via media
   query if desired.

4. **Floating labels on small screens.** Ensure `text-overflow: ellipsis` and
   sensible max-width so long agent names don't overflow or overlap neighboring
   labels; keep hit areas from overlapping (coordinate with task 05).

5. **Landscape joystick + gestures.** Joystick reachable and not under UI in
   landscape; confirm two-finger calibrate gesture direction is correct when the
   screen is rotated (coordinate with task 02's `screen.orientation.angle`).

6. **Readout legibility.** Calibrate/height readouts get consistent line-height and
   sizing so they're readable in both orientations.

## Out of scope
Camera-coupled FOV/orientation math (task 02); a11y focus/contrast (task 07).

## Definition of done
- [ ] Verified at 320px, a notched device profile, portrait + landscape (real device
      or device emulation — document widths/devices tested).
- [ ] No control under a safe-area; no input-zoom on iOS; no label overflow at 320px.
- [ ] All tap targets ≥ 44px.
- [ ] esbuild clean; `npm test` green; changelog entry if visibly improved.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-production/10-mobile-responsive-polish.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
