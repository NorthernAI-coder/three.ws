# P3 — Body Studio (avatar, outfits, wearables, animations — live preview)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md` and
`STRUCTURE.md` first. **Prerequisite:** P0 (`01-foundation.md`) is merged. Read the "Integration
notes for P1–P5" at the top of `src/studio/agent-studio-store.js`. Mount into the **Body** tab.
Your edits must reflect on the persistent stage avatar **and** the site-wide `<agent-presence>` instantly.

## The vision you are enabling

The agent has a brain (P1) and a memory (P2) — now give it a **body the user loves to dress and
animate**, all visual, all live. We already have strong primitives: `src/avatar-wardrobe.js`
(outfits/accessories), `src/agent-accessories.js` (bone-attached items), `pages/compose.html`
(forge items from text, attach to bones), the animation system (`src/animation-manager.js`,
`src/animation-presets.js`, `src/runtime/animation-slots.js`, `public/animations/*.glb`), the pose
studio (`pages/pose.html`), `src/idle-animation.js`, and the `Viewer` (`src/viewer.js`). Plus the
M3-org **CharacterStudio** fork (`character-studio/`) and the `@three-ws/avatar` SDK (`avatar-sdk/`).

Your job: bring all of this into the **one central place** as the Body tab, with a wardrobe/animation
experience that feels like Figma-grade direct manipulation — and make every change preview live on
the agent that's standing right there and everywhere else on the site.

## Your mission

### 1. Wardrobe — outfits & wearables
- A visual wardrobe: browse owned/available wearables from `public/accessories/` and the real asset
  catalog, drag onto the avatar, snap to bones (build on `src/agent-accessories.js` /
  `src/avatar-wardrobe.js` — consume them, don't rewrite). Layering, color/material tweaks via the
  existing material traversal in `src/viewer/internal.js`.
- Save outfits as named sets to `meta.studio.body` (P0 contract). Switching outfits updates the live
  avatar + presence with no refresh, via `studio.patch` / `studio.emit('body:change')`.
- **Live preview without commit:** hovering a wearable calls `studio.preview(...)` so the user sees it
  on the real avatar before saving; leaving reverts. No persisted writes on hover.

### 2. Animations & expression
- An animation library panel (build on `src/animation-library.js` / `src/widgets/animation-gallery.js`):
  assign clips to slots (idle/greet/celebrate/think/alert — align names with
  `src/runtime/animation-slots.js`). Preview on the live avatar; crossfade via `animation-manager.js`.
- Let the user set which animation plays on which **event** (e.g. `snipe:filled` → celebrate). These
  event→animation mappings feed P5's presence reactions — define the mapping in `meta.studio.body` and
  emit it through `studio` so the presence layer uses real choices, not hardcoded defaults.

### 3. Standards & interop (research-backed)
- Evaluate adopting **VRM** as the interoperable body format via **@pixiv/three-vrm**
  (https://github.com/pixiv/three-vrm) so avatars/wearables are portable — we already validate
  on-chain avatar manifests (`packages/avatar-schema/`) and fork CharacterStudio (VRM-based). If you
  adopt VRM, do it cleanly through the existing `Viewer`/loader path and keep GLB working; if you
  decide against a full VRM migration now, wire the wearable-interop *concepts* and say why in a comment.
- Sources: CharacterStudio https://github.com/M3-org/CharacterStudio , three-vrm
  https://github.com/pixiv/three-vrm , VerseEngine/three-avatar https://github.com/VerseEngine/three-avatar ,
  M3-org/avatar-interop https://github.com/M3-org/avatar-interop .

## Definition of done
- Wardrobe + animation panels work on the **live** studio avatar with real assets; outfits/anim
  mappings persist to `meta.studio.body` and round-trip; the site-wide presence updates instantly.
- Hover-preview is ephemeral (no DB writes); save is explicit and real.
- Performance holds (lazy-load assets, dispose GLTF properly, no leaks across outfit swaps).
- All states designed (no wearables owned → CTA to forge via `pages/compose.html`; loading skeletons;
  asset load failure → retry). Accessibility: keyboard-selectable wearables, ARIA on controls.
- No console errors; `npm test` passes; network tab shows real asset/API calls. Changelog entry added.

## Operating rules (override defaults)
No mocks/stubs/TODOs/sample asset arrays. $THREE is the only coin. Design tokens only. Stage explicit
paths (never `git add -A`); re-check `git diff --staged` before commit. Own `src/studio/body/**`;
consume (don't rewrite) `src/avatar-wardrobe.js`, `src/agent-accessories.js`, animation modules.
Coordinate event→animation mappings with P5 via the `studio` contract.

## When finished
Self-review (CLAUDE.md's five checks). Then add the share-worthy touch — e.g. a one-click "outfit from
a prompt" using the existing compose/forge pipeline, or an emote wheel that fires animations live, or
seasonal/trophy wearables unlocked by trading milestones (coordinate the unlock signal with P4). Build
it. Then **delete this prompt file** (`prompts/agent-studio/04-wardrobe-studio.md`) and report what
you shipped + the `meta.studio.body` shape and the event→animation mapping P5 should read.
