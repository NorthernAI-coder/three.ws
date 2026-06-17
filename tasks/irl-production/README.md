# IRL — Production Hardening Program

Goal: take `three.ws/irl` from "works in a demo" to **100% production-ready, zero
error, shipped complete and professional, with the best possible UX** on real
iOS Safari and Android Chrome devices.

This is a **hardening and polish** program, not a rebuild. The four IRL epics
(`tasks/irl-live` A–E) are built and shipped: world-anchoring (GPS + gyro + WebXR),
camera-aware agents, tap-to-inspect cards, x402 pay, owner dashboard, coarse
anonymous realtime presence + ambient reactions, the perf/LOD system, and the
location-privacy lockdown. This program closes the gap between *shipped* and
*flawless*.

---

## Hard constraints — respect prior product decisions

These were deliberate. **Do not regress them.**

- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never reference any other token anywhere — code, copy, tests, fixtures, commits.
- **Location privacy is locked down.** There is no map, list, or feed of agent
  locations. The nearby read is radius-capped and rate-limited so it cannot be
  swept to rebuild a map. Do **not** add a location feed, bulk endpoint, or widen
  the nearby radius.
- **The realtime PIN-broadcast channel was removed** (commit `75f2a6ce`). Pins ride
  a REST proximity read + a shared room-anchor. The realtime room carries only
  coarse, anonymous presence + ambient reactions. Do **not** re-add pin broadcast.
- **No mocks, no placeholders, no fake data.** Real APIs, real RPC, real wallet,
  real DB. Errors handled at boundaries; never a blank screen or silent no-op.

## Ground rules for every task

1. **Verify before you fix.** Each task lists findings with `file:line` refs drawn
   from an audit that read code excerpts. Open the cited code first. If a finding
   is already handled correctly, note that in your summary and move on — do not
   "fix" working code. If the real issue differs from the description, fix the real
   issue.
2. **Self-contained.** Each task file can be handed to a fresh agent and executed
   without reading the others. Some scope overlaps at the edges; stage explicit
   paths and re-check `git status` before committing (concurrent agents share this
   worktree).
3. **Every state designed** — loading / empty / error / permission-denied /
   unsupported-device — via `src/shared/state-kit.js`. No bare toasts for terminal
   states, no infinite "Loading…".
4. **Real-device verification is part of done.** The 3D/AR/sensor paths cannot be
   fully exercised in headless Chromium. Extract pure logic into testable helpers
   and unit-test it; for the rest, document the manual device-test steps you ran or
   that remain (iOS Safari + Android Chrome). Be honest about what you could not verify.
5. **Changelog.** Every user-visible fix gets an entry in `data/changelog.json`
   (tags from: feature, improvement, fix, sdk, infra, docs, security), then
   `npm run build:pages` to validate. Internal-only hardening with no visible
   effect does not.
6. **Keep `npm test` green** and add/extend tests for every fix that has pure logic.

---

## Task index

### Phase 1 — AR correctness (the core experience must never break)
| # | File | Focus | Effort |
|---|------|-------|--------|
| 01 | [01-sensor-robustness.md](01-sensor-robustness.md) | NaN/uncalibrated compass, finite guards, compass-loss detection, 0°/360° + yaw smoothing | M |
| 02 | [02-orientation-resize-fov.md](02-orientation-resize-fov.md) | Landscape / screen-orientation, FOV re-derive on rotate, safe-area, portrait-only math | M |
| 03 | [03-gps-lifecycle-lock-transitions.md](03-gps-lifecycle-lock-transitions.md) | GPS watch retry/zombie, deferred-lock caption race, GPS↔gyro transition smoothing | M |
| 04 | [04-webxr-session-lifecycle.md](04-webxr-session-lifecycle.md) | AR/XR/camera contention guard, overlay tap absorption, clean session teardown | M |
| 05 | [05-tap-raycast-accuracy.md](05-tap-raycast-accuracy.md) | Near-plane clipping, gyro-lock frame, edge taps, nearest-agent focus | S |
| 06 | [06-memory-gpu-hygiene.md](06-memory-gpu-hygiene.md) | Mixer/GLB leaks on swap, impostor RT disposal, load cancel on teleport, WebGL context-loss recovery | M |

### Phase 2 — UX, accessibility, polish (screenshot-worthy)
| # | File | Focus | Effort |
|---|------|-------|--------|
| 07 | [07-accessibility-pass.md](07-accessibility-pass.md) | focus-visible on every control, Escape/keyboard dismiss, ARIA, reduced-motion, contrast | M |
| 08 | [08-designed-states.md](08-designed-states.md) | My Pins / agent-card / radar / nearby-badge loading-empty-error states; no infinite spinners | M |
| 09 | [09-onboarding-copy.md](09-onboarding-copy.md) | First-run guidance (Camera → Pin), caption autofocus, professional/literal copy rewrite | S |
| 10 | [10-mobile-responsive-polish.md](10-mobile-responsive-polish.md) | 320px, notch/safe-area insets, iOS input-zoom, landscape joystick/labels | S |

### Phase 3 — Backend hardening (zero 500s, full observability)
| # | File | Focus | Effort |
|---|------|-------|--------|
| 11 | [11-api-error-boundaries.md](11-api-error-boundaries.md) | null-row checks, JSON-safety, SSE send errors, graceful schema degrade | M |
| 12 | [12-resilience-fail-open.md](12-resilience-fail-open.md) | rate-limiter try-catch, SSE breaker on persistent failure, Guardian degraded-cache, dedupe pruning | M |
| 13 | [13-security-validation.md](13-security-validation.md) | error-message disclosure, report sanitize, id/radius/allow-list validation, expiry + per-pin report caps | M |
| 14 | [14-observability.md](14-observability.md) | moderation/ops alerts, SSE metrics, structured error logging into the client-error/ops pipeline | S |

### Phase 4 — Launch gate
| # | File | Focus | Effort |
|---|------|-------|--------|
| 15 | [15-deploy-verify-and-qa.md](15-deploy-verify-and-qa.md) | Prove all endpoints live in prod (stale-deploy risk), real-device test matrix, end-to-end flow, console-clean audit | M |

---

## Recommended run order

Phase 1 and Phase 3 are independent and can run in parallel. Phase 2 can start
anytime. **Phase 4 (task 15) runs last** — it is the gate that proves the whole
program landed in production.

```
Phase 1 (AR):      01 → 02 → 03 → 04 → 05 → 06
Phase 3 (backend): 11 → 12 → 13 → 14            (parallel with Phase 1)
Phase 2 (UX):      07, 08, 09, 10               (any time; 08 pairs well after 11)
Phase 4 (gate):    15                            (after all above)
```

Each task ends with a Definition of Done. The program is complete only when
task 15 passes on real devices with a clean console and all `npm test` green.
