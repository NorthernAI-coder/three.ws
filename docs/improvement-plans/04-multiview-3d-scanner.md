# Task: Turn a phone/webcam into a multi-view 3D scanner

You are a senior product engineer on three.ws. Follow `CLAUDE.md` (auto-loaded).
Non-negotiables: $THREE is the only coin; no mocks/placeholders; real APIs/cameras;
every state designed; add tests; changelog for user-visible changes; don't break
the architecture.

## Why this matters

We already support multi-view → 3D reconstruction (front/back/left/right fuse into a
higher-fidelity mesh with no hallucinated back). Today users mostly type a prompt or
upload one image. A guided **capture** experience — point your camera, take a few
framed shots, get a real 3D model of a real object/person — is a new, shareable way
to create that nothing in the funnel currently does. It directly exercises the
strongest path in the pipeline.

## What exists today — read these first

- Multi-view reconstruction is live: the forge accepts 1–4 reference views and fuses
  them. See [api/_lib/forge-tiers.js](../../api/_lib/forge-tiers.js) (`path: 'image'`,
  multi-view), the `mesh_forge` / `forge_avatar` tools (`image_urls` 1–4), and
  providers in [api/_providers/](../../api/_providers). The free image lanes:
  `trellis_selfhost`, `huggingface`.
- Forge UI + dropzone: [src/forge-studio/](../../src/forge-studio) (`forge-dropzone.js`).
- Image upload/host path that turns a captured frame into an `image_url` the pipeline
  can read — reuse the existing upload route; don't invent a new storage system.

## Goal

A guided multi-view capture flow: the user captures (or uploads) up to 4 framed
angles of one subject, the frames upload to the existing image host, and the
multi-view reconstruction returns a textured GLB the user can view, pose, and embed.

## Scope

1. **Capture UI.** `getUserMedia` camera capture with on-screen framing guides for
   front/back/left/right (and a fallback to file upload per slot for desktop without
   a good camera). Show a live thumbnail per captured angle; allow re-take per slot.
2. **Real upload.** Each captured frame uploads via the existing image-host endpoint
   to produce a durable `image_url`. No data-URI hacks passed as the reconstruction
   input if the pipeline expects hosted URLs — match what the providers accept.
3. **Reconstruct.** Submit the 1–4 `image_urls` to the multi-view path on a free lane
   by default; poll real status; render the resulting GLB in the viewer.
4. **States + guidance.** Permission-denied state (camera blocked → explain + offer
   upload), too-few-angles guidance, blurry/low-light hint, reconstruct progress
   (real poll), failure with retry. Empty state explains how to get the best scan.
5. **Hand-off.** From the result, link straight into pose/rig/AR/embed so a scan flows
   into the rest of the platform.

## Guardrails

- Reuse the existing upload + reconstruction endpoints; do not add a parallel pipeline.
- Default to a free self-host/HF lane; keep paid lanes opt-in.
- Handle camera/permission/network errors at the boundary; no unhandled rejections.
- Mobile-first: this is primarily a phone experience. Test at 320px.

## Definition of done

- [ ] Camera capture with framing guides + per-slot re-take + desktop upload fallback.
- [ ] Frames upload to the real image host; multi-view reconstruct returns a real GLB.
- [ ] Permission/empty/blur/progress/error states all designed.
- [ ] Result links into pose/rig/AR/embed.
- [ ] `npm run dev` exercised on a real device or emulator; no console errors.
- [ ] `npm test` green; tests cover the capture→upload→submit state machine.
- [ ] Changelog entry; `npm run build:pages` passes; new page's `added` date if it's a route.
