# H9 — Launch-readiness audit & sign-off

> Epic IRL-Hardening · Size **M** · Cross-cutting. Produces a sign-off report;
> the gate for flipping `/irl` to a public launch. Run **LAST**.

## Goal

A single, repeatable audit that proves `/irl` is 100% production-ready —
zero-error, privacy-safe, accessible, and polished — on **real devices**, and
produces a written sign-off. This is the "would I demo this to a room of senior
engineers and stake my name on it?" gate, made concrete and checkable.

## Why it matters

Everything before this hardens a piece. This task proves the whole is ready and
catches the integration gaps no single task owns: a state that regressed, a header
missing in prod, a console error only on iOS, a slow first paint on a real phone
on cellular. A launch gate that's a checklist someone actually runs is the
difference between "we think it's ready" and "it's ready."

## Current state (verified)

- The hardening pass already shipped: `redactUrl()` log scrubbing
  (`api/_lib/http.js`), coordinate coarsening (`api/irl/pins.js` `roundCoord`), and
  the privacy invariant suite (**H1**). H2–H8 layer credential transport,
  proof-of-presence, consent, the privacy center, retention, anti-scrape, and the
  states/a11y pass.
- Tooling exists: `scripts/page-audit.mjs` (BASE_URL + reports/), the
  `console-audit-baseline` (known non-bug noise to filter), `npm run typecheck`,
  `npm test`, and `npm run build:pages` (changelog validation).

## What to build / run

### 1. Privacy sign-off (the spine)

- Run the full H1 suite green; confirm every H2–H7 invariant has an assertion.
- Manually attempt each leak the epic closes and confirm it's blocked: a 5xx
  doesn't log coordinates/tokens (force one, inspect the log); the nearby feed
  returns no `user_id`/`device_token` and coarse coords; a forged/foreign fix token
  is rejected (H3); a device token never appears in any URL (H2, Network tab); a
  "forget device" leaves zero rows (H5); orphaned interactions are reaped (H6).
- Confirm `THREAT-MODEL.md` (H7) exists and matches shipped behavior.

### 2. Zero-error sweep

- `npm test` + `npm run typecheck` green.
- `scripts/page-audit.mjs` against a real dev/preview build for `/irl` and the
  dashboard IRL pages — **zero console errors/warnings from our code** (filter the
  documented `console-audit-baseline` noise only; investigate anything new).
- Network tab on every IRL flow: real API calls, real data, expected status codes,
  correct security headers (`no-store`, `referrer-policy`, `x-irl-device` /
  `x-irl-fix` where applicable), no coordinate/token in any URL.

### 3. Real-device matrix

Exercise the full flow (onboard → place exact + approximate → discover nearby →
tap card → pay → privacy center → forget device) on:
- **iOS Safari** (motion gesture, no WebXR path),
- **Android Chrome** (WebXR path),
- a desktop browser (graceful no-AR fallback).
Record pass/fail per surface; file any defect, don't hand-wave it.

### 4. Performance & polish

- First-meaningful paint + interaction latency on a throttled mobile profile within
  the IRL perf budget (per the `irl-perf-e2` system); no jank panning the camera.
- Every state designed (H8); a11y spot-check (keyboard, contrast over camera,
  reduced-motion).
- Responsive at 320 / 768 / 1440.

### 5. The report

Write `tasks/irl-hardening/LAUNCH-SIGNOFF.md`: each section above with
pass/fail/notes, the commit audited, the device matrix table, any accepted
residual risk (with rationale), and a final **GO / NO-GO**. Add the changelog entry
for the launch if it's user-visible. Honest by construction: a failed check is
written as failed with the evidence, never glossed.

## Acceptance checklist

- [ ] H1 suite green; every H2–H7 invariant asserted; manual leak attempts all blocked.
- [ ] `npm test` + `npm run typecheck` green; page-audit shows zero new console noise.
- [ ] Security headers + transport verified in the Network tab; no coord/token in URLs.
- [ ] Real-device matrix (iOS Safari / Android Chrome / desktop) exercised and recorded.
- [ ] Perf within budget; states + a11y verified; responsive at 3 widths.
- [ ] `LAUNCH-SIGNOFF.md` written with evidence and a clear GO / NO-GO.

## Out of scope

Building features — H9 only audits and signs off what H1–H8 shipped. A NO-GO
returns specific defects to the owning task; it does not fix them here.

## Verify

The deliverable *is* the verification: a complete `LAUNCH-SIGNOFF.md` whose every
checkbox is backed by evidence (log excerpt, Network screenshot path, device note),
ending in a defensible GO/NO-GO an engineer could stake their name on.
