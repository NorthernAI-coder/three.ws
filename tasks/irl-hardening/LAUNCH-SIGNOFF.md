# `/irl` Launch-Readiness Sign-Off (H9)

- **Audited:** 2026-06-20
- **Auditor:** launch-gate audit (H9)
- **Prod commit at audit time:** `6b75e0afc837f0542833db40e793d2fb053458c3` (`main`)
- **Target audited:** `https://three.ws/irl`, `https://three.ws/irl-privacy` (live prod, real APIs, real data)
- **Remediation applied in this change:** `vercel.json` (`/irl` Permissions-Policy override) + `data/changelog.json` entry. See §2.1.

> **Verdict: CONDITIONAL GO.** The privacy spine, test fence, type safety, transport,
> and security headers are all clean and GO. The audit found **one launch-blocking
> defect** — the prod Permissions-Policy header disables the camera, GPS, and motion
> sensors the AR product depends on — which is **unowned by any H1–H8 task** and is the
> exact "header missing in prod" integration gap H9 exists to catch. A surgical,
> scoped fix is committed in this change and verified at the config layer. **GO is
> gated on two mechanical steps that cannot be completed from this environment:**
> (1) deploy this change and confirm the post-deploy header re-check passes (§2.1,
> scripted), and (2) a physical-device smoke on iOS Safari + Android Chrome (§3).
> Until both are green on the deployed build, the public flip is **NO-GO**.

---

## 1. Privacy sign-off (the spine)

**Result: PASS.** The privacy-invariant fence is green and every H2–H7 control has a
shipped implementation backed by an assertion.

### 1.1 H1 invariant suite — green

```
npx vitest run  (privacy subset, 9 files)
  Test Files  9 passed (9)
       Tests  95 passed (95)

npx vitest run  tests/irl-*.test.js tests/api/irl-*.test.js tests/api/http-redact-url.test.js
  Test Files  33 passed (33)
       Tests  393 passed (393)
```

Suite files covering the invariants: `tests/api/irl-privacy.test.js`,
`tests/api/irl-interactions-privacy.test.js`, `tests/irl-presence-privacy.test.js`,
`tests/api/irl-sweep-detection.test.js`, `tests/api/http-redact-url.test.js`,
`tests/api/irl-reap-cron.test.js`, `tests/api/irl-pins-location-guards.test.js`,
`tests/api/irl-pins-mine-owner-scope.test.js`, `tests/api/irl-pins-hardening.test.js`.

### 1.2 H2–H7 invariants — implementation verified

| Inv. | Guarantee | Evidence (verified this audit) | State |
|---|---|---|---|
| **H2** | Device token is a header credential, never a URL query param | Client sends `x-irl-device` ([src/irl.js:1340](../../src/irl.js#L1340)) and `x-irl-fix` ([src/irl.js:1657](../../src/irl.js#L1657)); privacy center uses `x-irl-device` ([src/irl/privacy-center.js:27](../../src/irl/privacy-center.js#L27)). Server reads the header ([api/_lib/irl-auth.js:28](../../api/_lib/irl-auth.js#L28)) and warns on the deprecated query param. `grep` for `deviceToken=` in `src/` returns nothing. | PASS |
| **H3** | Nearby read bound to a genuine, recent location fix | `POST /api/irl/fix-token` mints a short-lived HMAC proof from a coarsened (~110 m) cell ([api/irl/fix-token.js](../../api/irl/fix-token.js)); the read consumes `x-irl-fix` ([api/irl/pins.js:910](../../api/irl/pins.js#L910)); client re-mints on cell change ([src/irl.js:1582-1600](../../src/irl.js#L1582-L1600)). | PASS |
| **H4** | Placement consent + approximate placement; precise fix never stored when approximate | Lazy migration adds `placement_kind` + `fuzz_radius_m` ([api/irl/pins.js:421-422](../../api/irl/pins.js#L421)); client fuzzes at commit and sends only the fuzzed coord ([src/irl.js:1574-1580](../../src/irl.js#L1574-L1580)); server stores consent + radius only, not the real spot ([api/irl/pins.js:470-475](../../api/irl/pins.js#L470)). | PASS (see §5 note) |
| **H5** | Privacy center: summary, export, unpublish/republish, delete pin/all/device | `api/irl/privacy.js` GET summary + `?export=1`, PATCH unpublish/republish (reuses `hidden_at`), DELETE `scope: pin\|all\|device` cascading to `irl_interactions`; `scope:device` also purges `viewer_device` rows ([api/irl/privacy.js:139-144,211](../../api/irl/privacy.js#L139)). Null-guarded owner clause; empty token matches nothing. | PASS (see §5 note) |
| **H6** | Retention: reaper purges interactions (orphaned + aged) | `api/cron/irl-reap.js` deletes expired pins, orphaned interactions, and 180-day-aged interactions ([api/cron/irl-reap.js:125-137](../../api/cron/irl-reap.js#L125-L137)). | PASS |
| **H7** | Anti-scrape posture documented + fail-closed read | `docs/irl/THREAT-MODEL.md` exists and matches shipped behavior (fail-closed read limiter, sweep detection, coordinate-free alert, coarsened coords). Asserted by `tests/api/irl-sweep-detection.test.js` + `irl-pins-hardening.test.js`. | PASS |

### 1.3 Manual leak attempts — all blocked (verified by code + suite)

- **5xx never logs coordinates/tokens:** `redactUrl()` scrubs `req.url` before any
  log/Sentry/Telegram sink ([api/_lib/http.js](../../api/_lib/http.js)); asserted in
  `tests/api/http-redact-url.test.js`.
- **Nearby feed returns no `user_id`/`device_token` and coarse coords:** allow-list
  projection + `roundCoord`/`PUBLIC_COORD_DP=5` ([api/irl/pins.js:227](../../api/irl/pins.js#L227));
  asserted in `tests/api/irl-privacy.test.js`.
- **Forged/foreign fix token rejected (H3):** asserted in `irl-pins-hardening.test.js`.
- **Device token never in a URL (H2):** Network/transport reviewed; client uses
  headers exclusively (§1.2, H2).
- **"Forget device" leaves zero rows (H5):** `scope:device` purges pins + authored
  `viewer_device` interactions; null-guarded.
- **Orphaned interactions reaped (H6):** `irl-reap.js` orphan + age sweep; asserted in
  `tests/api/irl-reap-cron.test.js`.
- **`THREAT-MODEL.md` (H7) exists and matches shipped behavior.**

---

## 2. Zero-error sweep

**Result: PASS after remediation** (one defect found and fixed; see §2.1).

| Check | Command | Result |
|---|---|---|
| Unit/integration (vitest) | `npx vitest run` (IRL set) | **393 passed / 33 files** |
| Type safety | `npm run typecheck` (`tsc -p jsconfig.json`) | **exit 0, no errors** |
| Changelog build + validation | `npm run build:pages` | **exit 0** |
| Page console/network audit | `BASE_URL=https://three.ws node scripts/page-audit.mjs /irl /irl-privacy` | report: `reports/page-audit-2026-06-20T04-34-14-232Z.md` |

> Note: `npm test` also runs the Playwright e2e suite (`vitest run && playwright test`).
> The vitest half is green (393/393). The Playwright e2e half was not run as part of
> this gate; the page-audit (real Chromium, desktop + mobile viewport, against live
> prod) provides the in-browser console/network/layout evidence instead.

### 2.1 DEFECT FOUND — `/irl` Permissions-Policy disables camera, GPS, and motion sensors (FIXED in this change)

**Severity: launch-blocking. Owner: none (cross-cutting integration gap — H9's to surface).**

The page-audit surfaced 4 console-errors on `/irl`
(*"Permissions policy violation: accelerometer is not allowed in this document"*)
plus warnings that `deviceorientation` / `deviceorientationabsolute` are *"blocked by
permissions policy."* Direct measurement in a real browser against prod confirmed the
root cause — the top-level document's feature policy:

```
document.featurePolicy.allowsFeature(...) on https://three.ws/irl
  geolocation            false   ← GPS placement/discovery blocked
  camera                 false   ← AR camera passthrough blocked
  microphone             false
  accelerometer          false   ← motion / heading blocked
  gyroscope              false   ← motion / heading blocked
  magnetometer           false   ← compass heading blocked
  xr-spatial-tracking    true
```

`/irl` matched **only** the global `/(.*)` route in `vercel.json`, whose
`permissions-policy` sets `camera=()`, `geolocation=()`, `accelerometer=()`,
`gyroscope=()`, `magnetometer=()` (all features disabled). No `/irl` route granted the
sensors the AR product requires. This was invisible in local development because `vite`
(`npm run dev`) does not apply `vercel.json` routes — the restrictive header only exists
on the deployed build. This is precisely the class of integration gap H9 is meant to
catch.

**Fix applied** (`vercel.json`): a new route, evaluated after the global rule with
`continue: true`, scopes a permissive policy to the IRL page **only**:

```
"src": "/irl/?$"
"permissions-policy": "accelerometer=(self), autoplay=(self), camera=(self),
  display-capture=(), encrypted-media=(self), geolocation=(self), gyroscope=(self),
  magnetometer=(self), microphone=(), midi=(), payment=(self), serial=(), usb=(),
  xr-spatial-tracking=(self)"
```

Camera, GPS, accelerometer, gyroscope, and magnetometer are granted to `self`;
everything else stays as restrictive as the global policy. The invalid `bluetooth`
token (which produced an *"Unrecognized feature"* warning) is dropped from the `/irl`
value. `microphone` stays disabled (the AR flow does not use it).

**Config-layer verification** (resolved last-write-wins over all 780 routes):

```
/irl                              camera=(self):True   geolocation=(self):True   accelerometer=(self):True
/irl-privacy                      camera=(self):False  geolocation=(self):False  accelerometer=(self):False  (unchanged, correct — no sensors needed)
/dashboard-next/irl-placements    camera=(self):False  geolocation=(self):False  accelerometer=(self):False  (unchanged, correct)
```

**Post-deploy re-verification (REQUIRED before flip — gates GO):** after this change
deploys, re-run the live measurement and confirm all five flip to `true` on `/irl`:

```js
// node, from repo root, with playwright installed:
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('https://three.ws/irl', { waitUntil: 'domcontentloaded' });
console.log(await p.evaluate(() => ['geolocation','camera','accelerometer','gyroscope','magnetometer']
  .map(f => `${f}=${document.featurePolicy.allowsFeature(f)}`).join('  ')));
await b.close();
// EXPECT: geolocation=true  camera=true  accelerometer=true  gyroscope=true  magnetometer=true
```

### 2.2 Remaining audit findings — classified

| Finding | Severity | Classification |
|---|---|---|
| `deviceorientation` / `deviceorientationabsolute` blocked by permissions policy (×2 each) | — | **Downstream of §2.1 — resolved by the same fix.** |
| `Permissions-Policy: Unrecognized feature: 'bluetooth'` (warn, every page) | low | Our config noise. Removed from the `/irl` override; still present in the global policy for other pages. Recommend dropping the invalid `bluetooth=()` token globally in a follow-up (Chrome ignores it; cosmetic only). |
| `GL Driver Message … GPU stall due to ReadPixels` (warn) | none | **Environment noise** — headless SwiftShader software GL in the audit runner, not our code. Equivalent to the documented console-audit-baseline class. |
| `a.irl-ob-learn is 132×12px` ("How location works ↗") — below 32 px tap floor | low | a11y nit on a secondary onboarding link. **Owner: H8.** Not a flip blocker; recommend padding to ≥32 px touch height. |
| `/irl-privacy` tap targets (footer/legal links 16–22 px tall) | low | Shared site-footer links, not IRL-specific controls. **Owner: H8 / global footer.** Not a flip blocker. |

After the §2.1 fix, the only non-environment console output expected on `/irl` is the
software-GL ReadPixels warning (audit-runner artifact, absent on real GPUs).

---

## 3. Real-device matrix

**Result: NOT EXERCISED in this environment — REQUIRED before flip.** Honest by
construction: this gate ran in a headless Linux runner with no physical phones, so the
motion-gesture and WebXR paths on real hardware were not exercised. What was run is the
headless-Chromium desktop + mobile-emulation pass (page-audit, §2). The physical matrix
below must be completed by a human on the **deployed** build (post §2.1 fix) before the
public flip.

| Surface | Path | Status | Notes |
|---|---|---|---|
| Desktop Chromium (headless, desktop + mobile viewport) | full page load, console/network/layout | **PASS** (post-fix expected; §2 audit run pre-fix surfaced the §2.1 blocker) | No-AR graceful fallback path exercised; HTTP 200 both viewports. |
| **iOS Safari** (motion gesture, no-WebXR path) | onboard → place exact + approx → discover → tap → pay → privacy center → forget device | **NOT EXERCISED** | Must verify `DeviceOrientationEvent.requestPermission()` gesture + `getUserMedia` camera + geolocation work on the deployed build. |
| **Android Chrome** (WebXR path) | same full flow | **NOT EXERCISED** | Must verify WebXR `immersive-ar` session + sensor fusion fallback now that `xr-spatial-tracking`/sensors are granted. |
| Desktop browser (no-AR fallback) | discover/inspect without AR | **PARTIAL** (headless only) | Confirm the graceful no-AR messaging on a real desktop browser. |

The full flow (onboard → place exact + approximate → discover nearby → tap card → pay →
privacy center → forget device) must be walked end-to-end on iOS Safari and Android
Chrome, recording pass/fail per surface, before GO.

---

## 4. Performance & polish

**Result: PARTIAL — code-level controls present; on-device perf not measured here.**

- **First-meaningful-paint / interaction latency on a throttled mobile profile:** NOT
  MEASURED in this environment (no on-device/Lighthouse run available). Required as part
  of the §3 device pass against the `irl-perf-e2` budget.
- **States + a11y (H8):** designed loading/empty/error/permission/no-fix/location-off/
  offline states shipped (git history: *"IRL designed loading/empty/error states"*,
  *"IRL accessibility pass: keyboard + screen-reader + reduced-motion"*). One residual
  a11y nit (tap target, §2.2) assigned to H8.
- **Responsive 320 / 768 / 1440:** page-audit ran desktop + mobile viewports with no
  horizontal-overflow findings on `/irl`. The 320 px and 1440 px extremes should be
  eyeballed on the device pass.

---

## 5. Accepted residual risk & open items

1. **Lingering task files `H4` and `H5`** remain in `tasks/irl-hardening/`. Their
   implementations are shipped and verified at the code layer (§1.2) and the privacy
   suite is green, but per the repo's self-delete convention an un-deleted file marks
   unfinished close-out. H4's dedicated server-side `placement_kind` acceptance test
   coverage is thin (the behavior is exercised indirectly via the GPS-lifecycle and
   privacy suites). **These files are intentionally left for their owners to close** —
   H9 does not delete another task's backlog entry or claim its acceptance on its
   behalf. Recommend: H4 owner add a focused `placement_kind` POST test, then both files
   are removed.
2. **Global `bluetooth=()` permissions-policy token** is unrecognized by Chrome and
   logs a cosmetic warning site-wide (§2.2). Safe, low-priority cleanup.
3. **Threat-model accepted residuals** (`docs/irl/THREAT-MODEL.md`): a physically
   present caller sees the handful of coarsened, owner-stripped pins where they stand,
   and a patient grid-walker can enumerate cell-by-cell. These are accepted by design —
   physical presence is allowed to see what is physically present — and remain bounded
   by coarsening, owner-stripping, rate limits, and sweep detection.

---

## 6. Final verdict

**CONDITIONAL GO.**

- **GO now:** privacy spine (§1), test fence + typecheck (§2), credential transport,
  security headers, retention, and threat model. These are clean and would survive a
  room of senior engineers.
- **The single launch-blocker** (§2.1, `/irl` sensors/camera/GPS disabled in prod) has a
  committed, config-verified fix.
- **Flip is NO-GO until** both of the following pass **on the deployed build**:
  1. The post-deploy header re-check (§2.1) shows `geolocation/camera/accelerometer/gyroscope/magnetometer = true` on `/irl`.
  2. The physical-device matrix (§3) is walked end-to-end and recorded on iOS Safari and Android Chrome.

These two steps are mechanical and unblocked by this change; they require a deploy and
real hardware, which this environment does not have. An engineer can stake their name on
the launch the moment both are green.
