# Task: Composable, shareable 3D worlds populated with agents

You are a senior 3D engineer on three.ws. Follow `CLAUDE.md` (auto-loaded).
Non-negotiables: $THREE is the only coin; no mocks/placeholders; real assets/APIs;
every state designed; add tests; changelog for user-visible changes; don't break
the architecture.

## Why this matters

We have a Scene Studio (a vendored three.js editor) and a pipeline that produces
rigged avatars. The missing connective tissue is letting a user **compose a small
world** — drop in generated assets and live agents, arrange them, then share a link
others can open and walk. That turns isolated models into spaces, which is the kind
of thing people screenshot and share.

## What exists today — read these first

- Scene Studio: [src/scene-studio/](../../src/scene-studio) (vendored three.js r184
  editor, route `/scene`), plus [src/scene-compose.js](../../src/scene-compose.js).
- Diorama surface: [src/diorama/](../../src/diorama), [api/diorama.js](../../api/diorama.js),
  and the `scene-mcp` package (text→3D diorama scenes).
- Avatars/agents to populate with: forge output GLBs; agent profiles in `src/agents/`,
  `src/agent-home.js`; walk companion in [walk-sdk/](../../walk-sdk).
- Viewer/web component: [avatar-sdk/](../../avatar-sdk) (`<agent-3d>`).

## Goal

Let a user assemble a scene from generated assets + live agents, persist it, and
share a URL that renders the composed world for visitors (view, orbit, and ideally
walk an avatar through it).

## Scope

1. **Compose.** In the scene surface, allow adding: a generated GLB (by forge result
   URL or upload) and an agent avatar (by agent id). Position/rotate/scale with the
   existing editor controls. Reuse `scene-compose.js`; don't rebuild transforms.
2. **Persist.** Save the composition as a real record (reuse the existing scene/diorama
   storage — inspect `api/diorama.js` and the scene-mcp data model before adding any
   new table/route). Generate a shareable id/URL.
3. **Share view.** A public, lightweight viewer route that loads the saved world and
   renders it (orbit at minimum; walk-through if the walk SDK can be embedded cleanly).
   Designed loading skeleton while assets stream in; empty world state; broken-asset
   fallback (a missing GLB shouldn't blank the scene).
4. **Cross-links.** From an agent profile, "place in a scene"; from a forge result,
   "add to a scene". Wire the connections both ways.

## Guardrails

- Reuse the vendored editor and existing scene/diorama persistence — do not fork a
  second scene format. Confirm the data model before extending it.
- Keep heavy modules lazy-loaded; large scenes must paginate/stream assets, not block.
- Public share view must not require auth to *view*.

## Definition of done

- [ ] Add generated GLBs + agent avatars to a scene and arrange them.
- [ ] Save → real persisted record → shareable URL.
- [ ] Public viewer renders the saved world; loading/empty/broken-asset states designed.
- [ ] Two-way cross-links: agent ↔ scene, forge result ↔ scene.
- [ ] `npm run dev` exercised in a browser; no console errors; real network calls.
- [ ] `npm test` green; tests cover the save/load scene serialization.
- [ ] Changelog entry; `npm run build:pages` passes.
