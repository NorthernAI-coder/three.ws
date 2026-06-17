# IRL Hardening — Location Privacy & Launch Readiness

The program that takes `three.ws/irl` from "works and is already well-built" to
**100% production-ready: zero-error, privacy-safe by construction, and the best
phone-camera UX we can ship.** The spine is the founder's non-negotiable: a
user's real-world location must never leak — not to another user, not to a log,
not to a third party, not by accident, not ever.

`/irl` lets anyone drop a 3D AI agent at a real GPS spot; anyone who physically
walks up sees it in AR, taps it for a profile + services card, and pays it via
x402. That product *is* location data. This epic makes handling that data
bulletproof and makes the privacy posture legible to the user.

---

## What is ALREADY shipped (do NOT rebuild — these are the baseline)

The discovery model and realtime layer are already privacy-hardened. Verify, build
on, and lock these in with tests (H1) — do not re-implement them.

| Guarantee | Where | State |
|---|---|---|
| Nearby feed never returns `user_id` / `device_token` | `api/irl/pins.js` allow-list projection | shipped — only `is_mine` boolean leaves |
| Tight proximity gate (10–60 m, default 40) + IP rate-limit on every read | `api/irl/pins.js` (`limits.publicIp`) | shipped — no bbox/window feed, no roster |
| Realtime presence is coarse by construction | `multiplayer/src/rooms/IrlRoom.js` `_coarseViewerPos` | shipped — geocell-6 centre + jitter; raw GPS discarded server-side |
| Realtime room never broadcasts a pin roster | `IrlRoom.js` (pins map never populated) | shipped — pins travel only via the per-viewer proximity read |
| Ghost presence is opt-in, default OFF | `src/irl-net.js` (`ghost` flag) | shipped — a viewer is counted, never positioned, unless they opt in |
| **Coordinates / device tokens scrubbed from error logs** | `api/_lib/http.js` `redactUrl()` | **shipped this pass** — 5xx never spills position/credential to console/Sentry/Telegram |
| **Public feed coordinates coarsened to ~1.1 m** | `api/irl/pins.js` `roundCoord()` (`PUBLIC_COORD_DP=5`) | **shipped this pass** — strips false precision / fingerprint tail |
| Responses are `no-store` + `referrer-policy` set | `api/_lib/http.js` `json()` | shipped — coordinate-bearing URLs aren't cached or sent in cross-origin Referer |
| Share composite carries no EXIF GPS | `src/irl/share-frame.js` | shipped — canvas PNG; URL fallback shares only the `avatar` param |

---

## The residual gaps this epic closes

After the audit, these are the real, grounded gaps between "well-built" and
"100% production-ready, zero-leak, best-UX":

1. **The device token is a bearer credential that still travels in URL query
   strings** (`?deviceToken=` on `/mine`, interactions, the SSE stream, DELETE).
   It unlocks a device's full pin **location history** — so it must leave URLs
   (which land in platform access logs, browser history, Referer). → **H2**
2. **The nearby read trusts caller-supplied coordinates** — a caller can query
   *any* lat/lng they aren't standing at. Rate-limit + radius cap blunt a sweep
   but don't bind the read to a genuine fix. → **H3**
3. **No user-facing privacy posture.** Placement gives no disclosure, no
   "approximate placement" option, no visible public/precise indicator. → **H4**
4. **No privacy center / right-to-be-forgotten.** No unpublish, no "remove all my
   pins," no "forget this device," no plain-language data summary. → **H5**
5. **Retention gap:** the reaper purges expired pins + orphaned reports but
   **never `irl_interactions`** — which store `viewer_device` and the pin's
   `lat`/`lng`. PII outlives the pin. → **H6**
6. **Anti-scrape posture is undocumented and may fail open.** The sweep threat
   model isn't pinned by tests, and limiter-degradation behavior for the read
   path isn't verified to fail closed. → **H7**
7. **Designed-state + accessibility coverage is uneven** across the permission,
   no-fix, location-off, offline, and privacy-disclosure states. → **H8**
8. **No single launch gate** that proves zero-error on real devices before the
   public flip. → **H9**
9. **No regression fence** around any of the privacy invariants above. → **H1**

---

## Task index

| # | File | Title | Size |
|---|---|---|---|
| **H1** | `H1-privacy-invariant-test-suite.md` | Privacy-invariant test suite + build gate | **M** |
| **H2** | `H2-device-token-transport.md` | Move the device-token credential out of URLs | **M** |
| **H3** | `H3-proof-of-presence-read.md` | Bind the nearby read to a genuine location fix | **L** |
| **H4** | `H4-placement-consent-approximate.md` | Placement consent + approximate-placement control | **M** |
| **H5** | `H5-privacy-center-forget-me.md` | Privacy center: visibility, export, delete / forget device | **L** |
| **H6** | `H6-retention-data-minimization.md` | Retention + data-minimization (reaper + interactions) | **S** |
| **H7** | `H7-anti-scrape-resilience.md` | Anti-scrape resilience, fail-closed reads, anomaly alerting | **M** |
| **H8** | `H8-designed-states-a11y.md` | Designed states, permission onboarding & accessibility | **M** |
| **H9** | `H9-launch-readiness-audit.md` | Launch-readiness audit & sign-off | **M** |

---

## Recommended run order

**Fence first, then harden, then expose, then polish, then ship:**

```
H1 (test fence) ──> everything else lands against a green privacy suite
H6 (retention)   ── independent, small, do early
H2 (token transport) ─> H3 (proof-of-presence) ─> H7 (anti-scrape)
H4 (consent UX) ─> H5 (privacy center)        ── user-facing privacy
H8 (states + a11y) ── alongside H4/H5
H9 (launch audit) ── LAST; gates the public flip
```

1. **Phase 1 — Fence & minimize:** H1, H6.
2. **Phase 2 — Close the credential + sweep holes:** H2, H3, H7.
3. **Phase 3 — Make privacy a feature the user can see and control:** H4, H5.
4. **Phase 4 — Polish & ship:** H8, H9.

---

## Ground rules for every task

- **Location is sacred.** No precise coordinate, device token, or owner identifier
  may ever reach another user, a log line, a third party, or a cached/shared
  surface. When in doubt, expose less. Every change is judged against H1's suite.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never reference any other token anywhere — code, copy, tests, fixtures.
- **No mocks, no placeholders, no fake data.** Real Neon, real RPC, real wallet,
  real sensors. Errors handled at the boundary into a retryable designed state.
- **Best-UX bar.** Match Linear/Stripe/Vercel polish: every state designed,
  microinteractions present, mobile-first (this is a phone-camera product — mind
  iOS Safari's motion-permission gesture and no-WebXR path), accessible
  (keyboard, ARIA, focus, reduced-motion, contrast).
- **Zero-error definition of done.** No console errors/warnings from your code,
  Network tab shows real calls succeeding, `npm test` + `npm run typecheck` green,
  `git diff` self-reviewed, demoable to senior engineers.
- **Each task file is self-contained** — a fresh agent can execute it without this
  README. Update `data/changelog.json` for every user-visible change (tag
  `security` for privacy work) per CLAUDE.md.
