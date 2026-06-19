# Task 07 — Accessibility pass

**Phase:** 2 (UX / polish) · **Effort:** M · **Files:** `pages/irl.html`, `src/irl.js`

## Why
Accessibility is not optional (CLAUDE.md). The IRL controls today have hover/active
states but inconsistent keyboard focus, no Escape-to-dismiss on sheets, and a few
ARIA/contrast/reduced-motion gaps. A production launch must be keyboard- and
screen-reader-navigable and respect motion preferences.

## Read first (verify before fixing)
- Hero camera button — `pages/irl.html` `#irl-camera-btn` (~1558) + its CSS (~310-351)
- Pill buttons — `.irl-pill-btn` CSS + the secondary control row markup
- Object picker buttons — `.irl-obj-btn` (~539-570)
- Sheets: inspect card, caption panel, My Pins, report — their markup + open/close in `src/irl.js`
- Lock-icon gyro pulse animation — `pages/irl.html` `#irl-lock-icon` `@keyframes irl-gyro-pulse` (~513)
- Radar markup + `aria-hidden` — `pages/irl.html` `.irl-radar` (~1704)

## Scope — confirm, then fix

1. **`:focus-visible` on every interactive control.** Hero Camera AR button, all
   `.irl-pill-btn`, `.irl-obj-btn`, report reasons, sheet close buttons, topbar
   Back/Share. Use a consistent ring (`outline: 2px solid …; outline-offset: 2px`)
   matching existing focused elements. No control may be reachable by keyboard
   without a visible focus indicator.

2. **Keyboard dismiss for every sheet/overlay.** Escape closes the inspect card,
   caption panel, My Pins, report sheet, and the full-screen overlay. Trap focus
   within an open modal sheet and restore focus to the trigger on close.

3. **Reduced-motion.** Wrap the lock gyro-pulse and any continuous/decorative
   animation in `@media (prefers-reduced-motion: reduce)` to pause it. Avatar
   movement is content, not decoration — leave it, but kill ambient UI motion.

4. **ARIA correctness.** Buttons that toggle (Pin here, Add object, Appear nearby)
   expose accurate `aria-pressed`. Status toasts use `aria-live` (verify polite vs
   assertive). The radar: either expose its compass labels meaningfully or keep it
   `aria-hidden` but ensure the same info exists in text (nearby count). Sheets use
   `role="dialog"`/`aria-modal` + labelledby.

5. **Color contrast.** Audit muted-grey text (status toasts, pin captions, "polling"
   pill, service descriptions) against WCAG AA on the dark/AR background. Lift any
   that fail. The degraded "polling" state should read as amber (degraded), not grey
   (disabled).

## Implementation guidance
- Prefer a shared focus-ring utility class over per-element rules.
- A reusable `openSheet(el, { onClose })`/`closeSheet()` that wires Escape + focus
  trap + restore would dedupe the four sheets — but match existing patterns; don't
  over-refactor.

## Out of scope
Empty/error state content (task 08); copy rewrites (task 09); responsive layout (task 10).

## Definition of done
- [ ] Full keyboard walkthrough: every control reachable + visibly focused; every
      sheet dismissible with Escape; focus restored to trigger.
- [ ] `prefers-reduced-motion` stops all decorative UI animation.
- [ ] Contrast checked (note tool/values) — no AA failures on key text.
- [ ] VoiceOver/TalkBack spot check on the main controls (document what you tested).
- [ ] esbuild clean; `npm test` green; changelog entry ("IRL is fully keyboard- and
      screen-reader-accessible").

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-production/07-accessibility-pass.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
