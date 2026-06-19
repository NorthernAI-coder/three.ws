# H1 — Privacy-invariant test suite + build gate

> Epic IRL-Hardening · Size **M** · New `tests/api/irl-privacy.test.js` (+ siblings).
> The regression fence. Build this FIRST — every other task lands against it.

## Goal

A single, fast, offline test suite that asserts every location-privacy invariant
of `/irl` and **fails the build** the moment one regresses. Today the guarantees
exist in code and comments but are only partially pinned by tests; a future edit
could silently re-leak coordinates, an owner id, or a device token. After this
task, that edit goes red in CI instead of shipping.

## Why it matters

The founder's bar is "nobody's location ever leaks." A guarantee with no test is
a guarantee with a shelf life. This suite is the contract: it encodes the privacy
model so precisely that the safest way to change `/irl` is to keep it green.

## Current state (verified)

- `tests/api/irl-pins-room.test.js` already mocks `db.js`/`auth.js`/`rate-limit.js`/
  `granite-guardian.js` and drives the real `api/irl/pins.js` handler with a
  content-addressed `sqlMock`. **Reuse this harness pattern verbatim.**
- `tests/api/http-redact-url.test.js` already covers `redactUrl()` (shipped this pass).
- Invariants currently true in code but **not** all asserted:
  - Nearby projection omits `user_id` + `device_token`, exposes only `is_mine`.
  - `roundCoord()` coarsens `lat`/`lng`/`origin_lat`/`origin_lng` to `PUBLIC_COORD_DP=5`.
  - Radius is clamped to `[10, 60]`, default 40; missing lat/lng → 400.
  - `handleCalibrate` / outfit / PATCH / DELETE reject a non-owner (403/404).
  - `interactions.js` `pay` requires a valid signature + a `$THREE`/USDC mint.
  - `interactions.js` never stores the **viewer's** GPS — only the pin's `lat`/`lng`.
  - `IrlRoom._coarseViewerPos` returns a cell-centre±jitter point, never the input.

## What to build

### 1. `tests/api/irl-privacy.test.js` — the read/write feed invariants

Drive the real `pins.js` handler (copy the `irl-pins-room.test.js` mock setup):

```js
it('nearby feed never leaks an owner identifier', async () => {
  nearbyRow = { /* …with user_id + device_token set… */ };
  const { body } = await getNearby({ lat, lng });
  for (const p of body.pins) {
    expect(p).not.toHaveProperty('user_id');
    expect(p).not.toHaveProperty('device_token');
    expect(p).toHaveProperty('is_mine');
  }
});

it('nearby feed coarsens every outbound coordinate to ≤ 5 decimals', async () => {
  // assert lat/lng/origin_lat/origin_lng have ≤ PUBLIC_COORD_DP fractional digits
});

it('clamps radius to 60 m and rejects a missing fix', async () => { /* 400 path */ });
```

Add ownership-gate tests: a PATCH `calibrate`, an outfit change, a field PATCH,
and a DELETE from a non-owner (wrong `deviceToken`, wrong/absent session) each
return 403/404 and mutate nothing.

### 2. `tests/api/irl-interactions-privacy.test.js`

Drive `api/irl/interactions.js`: assert a `pay` without a valid signature or with
a non-`$THREE`/USDC mint is rejected; assert the inserted row carries the **pin's**
`lat`/`lng` (snapshotted from the pin), never a caller-supplied coordinate; assert
the `?mine=1` owner feed is null-guarded so an empty device token matches nothing.

### 3. `tests/irl-presence-privacy.test.js`

Unit-test `IrlRoom._coarseViewerPos(lat, lng)` (or extract the pure helper if it
isn't already importable): for a known precise input, the output must be inside
the geocell-6 cell but **not equal** to the input, proving raw GPS never survives.
Assert the room's `pins` MapSchema stays empty after a join (no roster broadcast).

### 4. Wire into the gate

These run under the existing `npm test` (vitest). Confirm they're picked up by the
default glob and that the Vercel build runs `npm test` (or add them to whatever
pre-deploy check exists). Keep the whole suite **offline** (all I/O mocked) and
under a few seconds so it's a cheap, always-on fence.

## Acceptance checklist

- [ ] `irl-privacy.test.js`, `irl-interactions-privacy.test.js`, `irl-presence-privacy.test.js` exist and pass.
- [ ] A deliberately reverted guarantee (e.g. temporarily return `user_id`, or drop `roundCoord`) turns the suite RED — verified by trying it.
- [ ] No real DB/RPC/network — fully mocked, runs in the existing vitest config.
- [ ] Suite added to the run that gates deploys; total added runtime < 5 s.
- [ ] `npm test` + `npm run typecheck` green.

## Out of scope

New product behavior — H1 only *locks in* existing + subsequently-built behavior.
The new invariants from H2/H3/H6 get their assertions added in those tasks.

## Verify

`npm test` green. Then locally revert one guarantee in `pins.js`, re-run, watch
the specific assertion fail with a clear message, restore it, confirm green again.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-hardening/H1-privacy-invariant-test-suite.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
