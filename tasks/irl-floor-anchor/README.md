# IRL "Place on floor" — production-hardening epic

Make the WebXR floor-anchor feature (`/irl` → **Place on floor**) genuinely
production-ready: zero error paths, every state designed, parity across devices,
and the best AR placement UX on the web. Run each task in a fresh Claude Code
chat. Every task is grounded in real lines — read the cited code before writing.

## What the feature is today (verified ground truth)

On WebXR-capable devices (Android Chrome) the user taps **Place on floor**
([pages/irl.html:1602](../../pages/irl.html#L1602)), enters `immersive-ar` with a
hit-test reticle, points at the floor, and taps to bind the agent to a real
`XRAnchor`. The anchored pose is converted to a GPS pin and persisted so it
reloads near the same spot and nearby users see it.

- Session controller: [src/ar/webxr.js](../../src/ar/webxr.js) — `WebXRSession`
  (reticle, hit-test follow, `XRAnchor` on tap, content glue, restore-on-exit).
- Host wiring: [src/irl.js:1500-1689](../../src/irl.js#L1500-L1689) —
  `detectFloorAnchorSupport` (1542), `enterFloorAnchor` (1587),
  `onFloorAnchored` (1640), `persistFloorAnchor` (1658), `yawFromQuat` (1631).
- Persistence: [api/irl/pins.js](../../api/irl/pins.js) — `anchor_height_m`,
  `anchor_yaw_deg`, `anchor_quat`, `anchor_source` columns (209-214).
- Pure math the client should reuse: [src/irl/room-anchor.js](../../src/irl/room-anchor.js).
- Overlay markup: `#irl-xr-overlay` / `.irl-xr-hint` / `#irl-xr-error`
  ([pages/irl.html:1658-1666](../../pages/irl.html#L1658-L1666)).
- Server tests exist ([tests/api/irl-pins-anchor-pose.test.js](../../tests/api/irl-pins-anchor-pose.test.js));
  the **client** pose math is untested.

## Real gaps this epic closes

1. **No client-math tests** and duplicated metre-per-degree constants — fragile,
   unverifiable. → **01**
2. **`anchor_quat` is dead on render-back** — stored + returned, never applied;
   tilt/orientation is silently lost. → **02**
3. **No real-world occlusion** — agent always draws over furniture/people. → **03**
4. **Placement UX is minimal** — one static ring, no contact shadow, no confirm
   feedback, no haptics, no reduced-motion. → **04**
5. **No session-lifecycle hardening** — backgrounding, tracking loss, camera
   contention, anchor-reject, and the pre-GPS replay path are unguarded. → **05**
6. **iOS / non-WebXR users have no AR path** — button hidden, no parity. → **06**
7. **Not verifiable without a phone**, and no final DoD/changelog. → **07**

## Tasks

| # | File | Summary | Size |
|---|------|---------|------|
| 01 | [01-pure-anchor-math-and-tests.md](01-pure-anchor-math-and-tests.md) | Extract client pose→GPS math into a pure, unit-tested module reusing `room-anchor.js` | S |
| 02 | [02-orientation-replay-and-tilt.md](02-orientation-replay-and-tilt.md) | Wire (or retire) `anchor_quat`; precise yaw + surface-tilt decision on render-back | M |
| 03 | [03-realworld-occlusion-depth.md](03-realworld-occlusion-depth.md) | `depth-sensing` optional feature + occlusion so the agent hides behind real objects | M |
| 04 | [04-placement-ux-polish.md](04-placement-ux-polish.md) | Reticle states, contact shadow, confirm pulse, haptics, reduced-motion, copy pass | M |
| 05 | [05-session-lifecycle-hardening.md](05-session-lifecycle-hardening.md) | Visibility/tracking-loss/interruption/anchor-reject/pre-GPS-replay; zero console noise | M |
| 06 | [06-ios-nonwebxr-parity.md](06-ios-nonwebxr-parity.md) | Best-available AR placement on iOS + a polished, honest fallback everywhere else | L |
| 07 | [07-verification-harness-and-signoff.md](07-verification-harness-and-signoff.md) | Fake-XRFrame test harness, full-flow verify without a phone, DoD sweep + changelog | M |

## Run order

`01 → 02 → 05 → 03 → 04 → 06 → 07`

01 is the zero-risk foundation (pure math + tests). 02 and 05 are correctness and
must land before the polish (03/04). 06 is the largest and depends on the others
being stable. 07 closes the epic. 03/04 can run in parallel after 02/05.

## Standing rules for every task

- No mocks, no stubs, no TODOs — finish what you touch (CLAUDE.md hard rules).
- Every state designed: searching, found, anchored, denied, unsupported, error.
- Real device verification where possible; otherwise the 07 harness + a written
  note of what was and wasn't exercised on hardware. Never claim done unverified.
- Every user-visible change gets a `data/changelog.json` entry (tag `feature` or
  `improvement`); run `npm run build:pages` to validate it.
- $THREE is the only coin. Stage explicit paths; re-check `git status` before commit.
