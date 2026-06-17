# Task 06 — Accessibility pass (WCAG 2.1 AA)

## Context

three.ws workspace at `/workspaces/three.ws`. Deliverable + verified facts:
[00-PLAN.md](00-PLAN.md). The page is [`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html).
Run **after** task 04/05 so you're auditing the final markup. An IBM-hosted page must meet
IBM's own accessibility bar — target **WCAG 2.1 AA**.

## Do this

1. **Semantics & landmarks.** Wrap content in real landmarks (`header`/`main`/`footer`),
   single logical `h1`, correct heading order (no skipped levels). The "how it works" steps
   should be a list; the receipt should be readable as labelled pairs.
2. **The live regions.** The 402 preview and the result panel update asynchronously — they must
   announce. Confirm the preview is `aria-live="polite"` and the result is `role="status"` /
   `aria-live="polite"` (started). Make sure the success and each error state produce a sensible
   spoken announcement (not a wall of mono text).
3. **Form labelling.** The ticker `<input>` has a visible `<label>` and an
   `aria-describedby` hint (started) — verify, and ensure the inline validation error is
   associated (`aria-invalid` + `aria-describedby`) and announced.
4. **Keyboard.** Everything operable without a mouse: Tab order is logical, the pay button and
   retry are reachable and activate on Enter/Space, Enter in the ticker field runs the call
   (started), the `<details>` raw-JSON disclosure toggles via keyboard, the copy button works.
5. **Focus management across the modal.** The widget opens a modal via `window.X402.pay()`. Verify
   focus moves into the modal on open and **returns to `#payBtn` on close/cancel**. If the widget
   doesn't restore focus, compensate on the page (capture the trigger, restore focus when the
   `pay()` promise settles). Ensure no focus is lost to `document.body`.
6. **Visible focus.** Every interactive element needs a clear `:focus-visible` ring that meets
   contrast — don't rely on the browser default being removed by the reset.
7. **Contrast.** Check all text against its background in **both light and dark** themes: the
   muted/subtle greys, the blue links/buttons, the pills (ok/warn/bad), the dark code block, and
   the price tag. All ≥ 4.5:1 for body text, ≥ 3:1 for large text/UI. Fix any that fail —
   Carbon's tokens are AA-safe; custom greys may not be.
8. **Non-color signals.** The availability pill (available/close/taken) must not rely on color
   alone — keep the text label (it does) and ensure the status dot has a text equivalent.
9. **Reduced motion** (from task 04) respected. **Zoom** to 200% without loss of content/function.

## Method

- Run an automated pass (axe DevTools or `npx @axe-core/cli http://localhost:8088/x402-demo.html`)
  — zero serious/critical violations.
- Then a manual keyboard-only walkthrough and a screen-reader pass (VoiceOver or NVDA): load →
  hear the price → run → hear the result; trigger an error → hear it.

## Definition of done

- Zero serious/critical axe violations in light and dark.
- Full keyboard operability; focus enters the modal and returns to the trigger on close.
- All contrast ratios pass AA in both themes; status is never color-only.
- Live regions announce price, success, and errors. 200% zoom is usable. No console errors.
  Run the **completionist** subagent.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/ibm-x402-demo/06-accessibility-pass.md"
```

Stage the deletion in the same commit as the implementation. A file that still exists is
unfinished work; a file that is gone has shipped. Do not delete early.
