# 03 — Real-world occlusion (WebXR depth-sensing)

> Epic IRL/floor-anchor · Size **M** · Depends on 01/02; parallel with 04.
> The single biggest "is this real AR?" perception upgrade.

## Goal

Make the placed agent hide behind real-world geometry — a couch, a doorway, a
person walking in front — instead of always painting on top of the camera feed.
This is what separates a sticker pasted on video from an object that lives in the
room. Snapchat gets this via World Mesh; WebXR exposes the equivalent through the
`depth-sensing` feature, and it must degrade silently where unsupported.

## Why it matters

Our agent currently draws over everything (`depthTest:false` reticle aside, the
avatar has no occluder). The instant a real object should be in front of it, the
illusion breaks and the agent looks like a floating overlay. Occlusion is the
highest-leverage realism fix available to a browser AR app and it is the feature
users instinctively test by walking behind something.

## Current state (real lines)

- Session requests no depth: [src/ar/webxr.js:95-98](../../src/ar/webxr.js#L95-L98)
  `requiredFeatures:['hit-test']`, `optionalFeatures:['anchors','local-floor']`.
- The agent content is rendered normally against the transparent passthrough
  background ([src/ar/webxr.js:120-123](../../src/ar/webxr.js#L120-L123),
  render at [199](../../src/ar/webxr.js#L199)); nothing writes real-world depth.
- Three.js `WebGLRenderer.xr` is already in use (`renderer.xr.setSession`,
  `renderer.xr.getCamera`) — the integration point exists.

## What to build

1. **Request depth, optionally.** Add `'depth-sensing'` to `optionalFeatures` with
   the required descriptor:
   ```js
   optionalFeatures: ['anchors', 'local-floor', 'depth-sensing'],
   depthSensing: { usagePreference: ['gpu-optimized', 'cpu-optimized'],
                   dataFormatPreference: ['luminance-alpha', 'float32'] },
   ```
   Feature-detect after start: `session.enabledFeatures?.includes('depth-sensing')`
   (guard — not all UAs populate it) and only enable the occlusion path when present.

2. **Occluder pass.** Use Three's WebXR depth path: set
   `renderer.xr.setSession(...)` (already done) and, where supported, build a depth
   occlusion using the per-frame `XRWebGLDepthInformation` from
   `frame.getDepthInformation(view)`. Prefer wiring through Three's built-in
   `WebXRDepthSensing` support if the installed three version exposes it (check
   `three/examples` / renderer flags for the version in `package.json`); otherwise
   implement a minimal occluder material that samples the depth texture and discards
   agent fragments behind real depth. Keep it in a new helper
   `src/ar/depth-occlusion.js` so `webxr.js` stays readable; dispose it in `_handleEnd`.

3. **Quality + perf.** Occlusion runs every frame — keep allocations out of the
   tick (reuse buffers, mirror the scratch-vector discipline in
   [src/ar/webxr.js:255-261](../../src/ar/webxr.js#L255-L261)). Target no measurable
   FPS regression on the tier budgets noted in the IRL perf system.

4. **Graceful degradation.** No `depth-sensing` → today's exact behavior, no error,
   no console noise. Optionally surface a one-time subtle hint
   ("Your device supports occlusion" is *not* needed — silence is the bar).

## Acceptance checklist

- [ ] On a depth-capable device (recent Android Chrome) the agent is correctly
      hidden when a real object/person is between it and the camera.
- [ ] On a non-depth device the session runs exactly as before — no thrown errors,
      no console warnings, button still works.
- [ ] No per-frame allocations added to the XR tick; FPS within perf budget.
- [ ] Depth resources disposed on exit ([src/ar/webxr.js:277-314](../../src/ar/webxr.js#L277-L314)).
- [ ] Reticle/anchor placement behavior unchanged.

## Out of scope

Using the depth texture for *placement* (depth-based instant hit-test) — that is a
nice follow-up but hit-test already places fine; this task is occlusion only.

## Verify

WebXR device: place the agent, walk a chair or your hand between phone and agent —
the agent is occluded. Toggle a non-depth UA (or simulate by removing the feature)
and confirm identical pre-occlusion behavior with a clean console.
