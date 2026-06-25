# Task: One-tap AR "view in your space" for any avatar or asset

You are a senior 3D/mobile engineer on three.ws. Follow `CLAUDE.md` (auto-loaded).
Non-negotiables: $THREE is the only coin; no mocks/placeholders; real device APIs;
every state designed; add tests; changelog for user-visible changes; don't break
the architecture.

## Why this matters

Seeing a generated avatar standing on your own desk, at scale, in AR is a magic,
shareable moment — and we already have AR primitives. Making "view in your space" a
consistent one-tap action on every generated model and agent turns a flat preview
into something people show their friends.

## What exists today — read these first

- AR primitives: [src/ar/](../../src/ar) — `quick-look.js`, `scene-viewer.js`,
  `webxr.js`, `placement-capability.js`, `anchor-lifecycle.js`, `depth-occlusion.js`.
- Forge AR entry: [src/forge-studio/forge-ar.js](../../src/forge-studio/forge-ar.js).
- AR page: [src/ar-page.js](../../src/ar-page.js).
- Viewer/web component: [avatar-sdk/](../../avatar-sdk) (`<agent-3d>`).

## Goal

A single, reusable "View in AR" affordance that works across the platform: iOS
(Quick Look / USDZ), Android (Scene Viewer / glTF), and WebXR where available, with
an honest fallback on unsupported devices. Available on forge results, agent
profiles, and the gallery — driven by one component, not copy-pasted per surface.

## Scope

1. **Capability detection.** Use `placement-capability.js` to detect the best AR path
   for the device and pick Quick Look / Scene Viewer / WebXR accordingly. One entry
   point; the surfaces just pass a model URL.
2. **USDZ for iOS.** iOS Quick Look needs USDZ. Wire a real GLB→USDZ conversion (a
   worker or a real conversion service) and cache the result per model — no
   placeholder file. If conversion isn't configured on a deployment, degrade to the
   WebXR/in-page 3D viewer with a clear message, never a broken AR button.
3. **Reusable affordance.** A single "View in AR" button/component used by forge
   results, agent profiles, and the gallery. Same code path everywhere.
4. **States.** Supported → launches AR. Converting (iOS, first time) → real progress.
   Unsupported device → graceful in-page 3D viewer with explanation. Error → retry.
5. **Scale + placement sanity.** Models place at a sensible real-world scale (an avatar
   ~human height), not 1cm or 50m. Respect the existing anchor/placement lifecycle.

## Guardrails

- Reuse `src/ar/*` primitives; do not introduce a second AR stack.
- The AR button must never be a dead end — always resolve to AR or a designed fallback.
- USDZ conversion must be real and cached; no fake/placeholder asset.
- Mobile-first; test the actual launch handoff on a real iOS and Android device.

## Definition of done

- [ ] One reusable "View in AR" component used by ≥3 surfaces.
- [ ] iOS Quick Look (real USDZ, cached) + Android Scene Viewer + WebXR paths work.
- [ ] Unsupported devices fall back to the in-page viewer with a clear message.
- [ ] Sensible real-world scale on placement.
- [ ] Verified on real iOS + Android hardware; no console errors.
- [ ] `npm test` green; tests cover capability selection + fallback logic.
- [ ] Changelog entry; `npm run build:pages` passes.
