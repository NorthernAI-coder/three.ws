# 15 — Forge / Text→3D / Avatar generation pipeline (production-grade, end-to-end)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

The Forge is the platform's front door: "describe it → get a 3D thing" is the demo
that makes people screenshot and share. If text→3D, selfie→avatar, or prompt→avatar
ever shows a spinner that never resolves, a raw vendor error, or a T-posed mesh, the
core promise breaks and acquisition dies at the first touch. This surface must feel
instant, never dead-end, and never leak provider internals.

## Mission

Make every generation path — text→3D object, text→avatar, selfie→avatar, image→3D —
correct, resilient, and beautifully stated in every phase, with the **free NVIDIA NIM
lane primary** and paid lanes as silent backstops the user never sees billing for.

## Map (trust but verify — files move)

- **Forge UI** — [src/forge.js](../../src/forge.js), [pages/forge.html](../../pages/forge.html),
  [src/forge-showcase.js](../../src/forge-showcase.js), [src/home-forge.js](../../src/home-forge.js).
- **Prompt→avatar UI** — [src/create-prompt.js](../../src/create-prompt.js),
  [pages/create-prompt.html](../../pages/create-prompt.html). Selfie flow:
  `/create/selfie`.
- **Text→image (provider chain)** — [api/_mcp3d/text-to-image.js](../../api/_mcp3d/text-to-image.js).
  Free-first cascade: **NVIDIA NIM FLUX → Vertex Imagen → Replicate (paid backstop)**.
- **Reconstruct + auto-rig** — [api/avatars/_actions.js](../../api/avatars/_actions.js)
  (`handleReconstruct`), [api/_lib/reconstruct-finalize.js](../../api/_lib/reconstruct-finalize.js),
  [api/_lib/regen-provider.js](../../api/_lib/regen-provider.js), [api/_lib/auto-rig.js](../../api/_lib/auto-rig.js).
- **Backends & tiers** — [api/_lib/forge-tiers.js](../../api/_lib/forge-tiers.js),
  [api/_lib/forge-health.js](../../api/_lib/forge-health.js) (`GET /api/forge?health`),
  [api/forge.js](../../api/forge.js). Model workers in [workers/](../../workers):
  `model-trellis`, `model-hunyuan3d`, `unirig`, `longcat`.
- **Tests** — [tests/api/text-to-image.test.js](../../tests/api/text-to-image.test.js),
  `tests/api/forge-free-first.test.js`, `tests/api/forge-fallback.test.js`,
  `tests/api/forge-health.test.js`, `tests/api/reconstruct-finalize.test.js`,
  `tests/forge-avatar-humanoid.test.js`.

## Do this

1. **Exercise every lane in a real browser** (`npm run dev`): text→3D object, prompt→avatar,
   selfie→avatar. Watch the Network tab and console. Confirm the free NIM lane serves
   first (`/api/forge?health` shows `nvidia: ok`).
2. **No provider internals ever reach the user.** Audit every error path in the chain
   above: billing/credit/quota messages, raw stack traces, and vendor URLs must be
   masked to neutral, actionable copy. Keep raw detail in server logs only.
3. **Every phase is designed:** reference-image render, reconstruct, rig — each with a
   live label, real elapsed time, and a skeleton/progress affordance (not a fake
   `setTimeout` bar). Empty state tells the user what to type; error state says what
   to do next.
4. **Resilience:** a hung or throttled free lane must hand off to the next lane within
   a tight timeout, never stall the pipeline. Verify the cascade with the existing
   fallback tests; add cover for any uncovered failure mode (timeout, 402, 429, NSFW,
   no-face, OOM).
5. **Right page for the input:** plain objects belong on Text→3D; humanoid prompts on
   the avatar flow. Make the routing/affordances obvious so users don't land a "box"
   on the face pipeline.
6. **Rig quality:** confirm generated humanoids drive the canonical clip library (no
   T-pose fallback unless genuinely non-humanoid, per the `/CLAUDE.md` avatar rule).
7. **Result handling:** every finished model has a working viewer, a real thumbnail
   (not a 1px snapshot), correct "rigged/static" tagging, and natural next steps
   (open in editor, make another, launch, walk).
8. Run `npx vitest run tests/api/text-to-image.test.js tests/api/forge-*.test.js
   tests/api/reconstruct-finalize.test.js` and the avatar humanoid test. Add a
   changelog entry for any user-visible change; `npm run build:pages`.

## Must-not

- Do not surface any third party's billing page, credit balance, or raw error to a buyer.
- Do not add a hardcoded rig allowlist — extend `glb-canonicalize.js` bone maps instead.
- Do not ship a fake progress bar or a spinner with no timeout.
- Do not reference any coin other than `$THREE`.

## Acceptance (all true before claiming done)

- [ ] Text→3D, prompt→avatar, and selfie→avatar all complete successfully in a real
      browser with the free NIM lane primary; no console errors/warnings.
- [ ] Every failure mode (402/429/timeout/NSFW/no-face/OOM/unconfigured) yields a
      neutral, actionable message — no vendor internals, verified by tests.
- [ ] Loading/empty/error/done states are all designed; elapsed time is real.
- [ ] Generated humanoids are rigged and animate (no unjustified T-pose); thumbnails render.
- [ ] All forge/text-to-image/reconstruct tests pass; new failure modes covered.
- [ ] Changelog updated and `npm run build:pages` is clean.
