# Task 03 — Error states + resilience (every failure mode designed)

## Context

three.ws workspace at `/workspaces/three.ws`. Deliverable + verified facts:
[00-PLAN.md](00-PLAN.md). The page is [`pages/ibm/x402-demo.html`](../../pages/ibm/x402-demo.html).

A demo on an IBM property must never show a broken or dead UI. The widget
([`public/x402.js`](../../public/x402.js)) handles in-modal wallet errors (reject, wrong chain,
verify/settle failure) with its own retry UI. This task hardens the **page-level** surface
around it so every failure resolves to a designed, actionable state — not a stuck spinner, a
silent no-op, or a raw exception.

## Enumerate and design every failure mode

Walk each, force it, and confirm the resulting state is clear and recoverable:

1. **402 preview fetch fails** (endpoint 5xx, DNS, offline) — the preview already shows an error
   label; confirm it's friendly, doesn't block the pay button, and auto-retries or offers retry.
2. **Widget script not yet loaded** when the button is clicked — currently guarded with a
   message; confirm it's graceful and that a late-loading `x402.js` recovers (retry succeeds).
3. **Empty / invalid ticker** — sanitizes to A–Z0–9; empty input shows an inline error, never
   fires a payment.
4. **User cancels in wallet** (`code === 'cancelled'`) — return to idle quietly, no error banner.
5. **Payment fails after signing** — facilitator verify/settle error, endpoint 5xx *after*
   payment, network drop mid-flight. Surface the widget's error message in the page's error
   state with a working **Try again**.
6. **Insufficient USDC balance** — confirm the message the visitor sees (from the wallet or
   facilitator) is comprehensible; if it's cryptic, add page-level guidance ("top up USDC on
   <network> and retry").
7. **Wrong network in wallet** — the widget asks to switch chains; confirm the page doesn't
   double-fire and the modal handles it.
8. **Double-click / rapid re-click** on the pay button — disable it (and show an in-flight
   state) while a `pay()` promise is pending; re-enable on resolve/reject.
9. **Offline** — detect `navigator.onLine === false` (and `offline`/`online` events); show a
   non-broken state and re-enable when back online.
10. **Malformed / partial result body** — the result renderer must be defensive: missing
    `recommendation`, empty `exact_matches`/`similar`, missing `payment.transaction` or
    `payment.network` must all render cleanly (no `undefined`, no thrown error).
11. **Clipboard unavailable** (the embed snippet copy) — already has a catch; confirm the
    fallback message shows.
12. **Global safety net** — add `window.addEventListener('error', …)` and
    `'unhandledrejection'` handlers so an unexpected throw shows a graceful inline notice and is
    (optionally, task 09) reported, rather than leaving a half-rendered panel.

## Method

- `npx http-server pages/ibm -p 8088` and force each case: block the endpoint in DevTools
  (request blocking / offline), point `ENDPOINT` at a 500/404 URL temporarily, throttle the
  network, decline in the wallet, etc. Revert any temporary `ENDPOINT` change before finishing.
- Every error state must: name what went wrong in plain language, offer the next action (retry /
  top up / reconnect), and keep the rest of the page usable.

## Definition of done

- Every failure mode above produces a **designed, on-brand, actionable** state — no stuck
  spinners, silent failures, raw stack traces, or `undefined` in the UI.
- Pay button is disabled while a payment is in flight; cancel returns to idle cleanly.
- Defensive result rendering proven against missing/partial fields.
- Global error/unhandledrejection net in place.
- Zero console errors in the happy path; forced errors log nothing alarming. Run the
  **completionist** subagent.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/ibm-x402-demo/03-error-states-and-resilience.md"
```

Stage the deletion in the same commit as the implementation. A file that still exists is
unfinished work; a file that is gone has shipped. Do not delete early.
