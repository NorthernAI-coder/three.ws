# C04 — Galleries (avatars, animations, agent discovery) production pass

> Phase C · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Discovery surfaces — the agent directory, avatar gallery, animation gallery — are how users
find what to use, fork, and buy. Rich, fast, filterable galleries with great 3D previews
turn browsing into creating and buying.

## Where this lives (real files)
- `src/agents-directory.js` (~619 lines) — agent discovery with on-chain identity badges.
- Avatar gallery + animation library (`src/animation-library.js` ~745 lines) and their pages in `data/pages.json`.
- `avatar-sdk/` viewer for 3D previews.

## Current state & gaps
- Badges load async (placeholder flash); search/sort state not URL-encoded (back button loses filters); pagination for large sets; mobile grid performance; avatar download permissions unclear; animation compatibility (humanoid-only) not enforced; preview load times for large assets.

## Build this
1. **Fast 3D previews:** lazy-load and virtualize grids; thumbnail/poster first, full 3D on interaction; skeletons; never block scroll on model loads.
2. **Filter/sort/search in the URL:** shareable, back-button-safe; designed empty state for no results.
3. **Identity badges:** resolve without layout shift; skeleton instead of placeholder flash.
4. **Permissions & compatibility:** clarify + enforce avatar download permissions; warn/guard when applying a non-humanoid-compatible animation (ties to the universal rig rules in CLAUDE.md).
5. **Apply/use loop:** "apply animation to my avatar" with an avatar picker; "use this avatar" handoff to studio/create.
6. **A11y + mobile + perf:** keyboard-navigable cards, contrast, 320px, smooth at 1000+ items.

## Out of scope
- The avatar generation/rig pipeline (**D01**) — link to it.

## Definition of done
- [ ] Grids are fast + virtualized with skeletons; filter/search/sort live in the URL; empty state designed.
- [ ] Badges resolve without flash; download permissions + animation compatibility enforced.
- [ ] Apply/use handoffs work; mobile + a11y verified; smooth at 1000+ items.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Filter a gallery, copy the URL, reopen → same filters; apply an animation to an avatar; scroll 1000+ items without jank.
