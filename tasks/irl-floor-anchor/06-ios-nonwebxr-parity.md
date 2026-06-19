# 06 — iOS / non-WebXR parity (AR placement everywhere)

> Epic IRL/floor-anchor · Size **L** · Depends on 01/02/05 being stable.
> The biggest reach gap: today half of mobile (iOS Safari) has no AR placement.

## Goal

Give iOS Safari and other non-WebXR devices the best floor-placement experience
their platform allows — not just the compass+GPS fallback — so "Place on floor"
isn't an Android-only feature. The end state: every modern phone can place an agent
on a real floor surface, and any device that truly can't gets a polished, honest,
non-dead-end alternative.

## Why it matters

iOS Safari has no `immersive-ar`, so `detectFloorAnchorSupport`
([src/irl.js:1542-1550](../../src/irl.js#L1542-L1550)) hides the button entirely
and iPhone users fall back to the gyro+GPS "Pin here" path with no real surface
detection. That's the majority of premium mobile users getting the lesser
experience. Snapchat's equivalent works on iOS via ARKit; our parity story is the
difference between "works on my phone" and "works."

## Current state (real lines)

- Support gate: [src/irl.js:1542-1550](../../src/irl.js#L1542-L1550) — `isSupported()`
  false on iOS ⇒ button stays `hidden`; only the gyro+GPS Pin path remains.
- `WebXRSession.isSupported` probes `navigator.xr.isSessionSupported('immersive-ar')`
  ([src/ar/webxr.js:77-83](../../src/ar/webxr.js#L77-L83)) — always false in iOS Safari.
- The persistence layer is transport-agnostic: any path that yields
  `{ position, quaternion }` can reuse `onFloorAnchored` / `persistFloorAnchor`
  ([src/irl.js:1640-1686](../../src/irl.js#L1640-L1686)) and task 01's module — so a
  new AR backend only needs to produce a floor pose.

## Decision (evaluate, then commit in the task)

Pick the iOS surface-placement backend. Options, with the honest trade-offs:

1. **`<model-viewer>` AR / AR Quick Look (USDZ)** — *free, native, zero-key.* iOS
   ARKit Quick Look places a model on a detected plane. Limitation: it's a separate
   system AR viewer, not our live canvas — it can *place and view* but doesn't feed a
   pose back for our GPS-pin persistence. Best as a "view your agent in your room"
   path; weaker for our shareable-pin model. **Recommended first ship** because it's
   free and genuinely useful on iOS today.
2. **WebXR Viewer app / WebXR polyfill** — only works for users who install Mozilla's
   WebXR Viewer; not a mainstream answer. Skip as a primary.
3. **8th Wall / commercial WebAR SLAM** — *true in-canvas surface placement on iOS
   Safari with pose callbacks*, fully matches our persistence model and UX. Cost: a
   paid SDK + API key + attribution. This is the only option that achieves full
   feature parity (live placement → shareable GPS pin) on iOS. **Recommended target**
   if the product wants real parity and the budget exists — flag the key/cost as a
   decision for the user, do not hardcode a placeholder.

Default plan: ship (1) now for an honest iOS AR experience, and scope (3) behind a
config flag + key so it lights up the moment the credential exists — never a
half-wired stub in between.

## What to build

1. **Capability detection.** Replace the binary WebXR gate with a small resolver
   `src/ar/placement-capability.js` → `'webxr' | 'quicklook' | 'pin'`, choosing the
   richest path the device supports. `detectFloorAnchorSupport` consumes it and shows
   the button (relabeled appropriately) for *both* webxr and quicklook, not just webxr.

2. **iOS path (model-viewer / Quick Look).** Generate/serve a USDZ (or reuse an
   existing GLB→USDZ path if one exists in the repo — search before adding) and wire
   an AR Quick Look launch from the same button. Clearly framed: on iOS the button
   places-and-views in your room; persistence falls back to the gyro+GPS pin with the
   user's confirmed spot. No silent feature gap — the copy states what each platform does.

3. **(Flagged) 8th Wall path.** If pursuing parity: behind `IRL_WEBAR_PROVIDER` +
   key, mount the SLAM session, surface a hit-test reticle matching task 04, and on
   tap emit `{ position, quaternion }` into the *existing* `onFloorAnchored` so
   persistence, occlusion, and UX are shared with the WebXR path. Zero duplicated
   persistence logic.

4. **Unified copy + states.** One mental model across platforms: "Place on floor"
   everywhere, with per-capability hint text. The unsupported-everywhere case keeps
   the existing Pin path with a clear "AR placement isn't available on this
   device — pin with compass + GPS instead."

## Acceptance checklist

- [ ] iOS Safari shows a working AR placement entry (not a hidden button).
- [ ] Capability resolver picks the richest path per device; Android WebXR
      unchanged; true-legacy devices keep the Pin path with honest copy.
- [ ] Any in-canvas backend reuses `onFloorAnchored`/`persistFloorAnchor` — no
      second persistence path.
- [ ] Commercial-SDK path (if built) is fully behind a key/flag — no stub, no dead
      UI when the key is absent; surface the key need to the user as a decision.
- [ ] Copy makes each platform's behavior clear; no console errors on any path.

## Out of scope

Re-implementing SLAM ourselves. The pin-persistence schema (unchanged). Occlusion
on the iOS path beyond what the chosen backend provides natively.

## Verify

Real iPhone (Safari): tap Place on floor → ARKit places the agent on a real plane.
Android (WebXR): unchanged full path. A device with neither: Pin path with the
honest fallback copy. Confirm no path throws and the button is never a dead end.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-floor-anchor/06-ios-nonwebxr-parity.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
