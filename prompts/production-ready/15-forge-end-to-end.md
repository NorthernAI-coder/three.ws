# 15 — Forge, end-to-end

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 2 — Product surface completeness
**Owns:** `pages/forge.html`, the forge API lane (`api/forge.js`, `api/forge-*.js`, `api/_mcp3d/*`), `forge_free`/`mesh_forge`/`rig_mesh`/`forge_avatar` MCP tools, viewer (`avatar-sdk/`).
**Depends on:** `06`, `08`, `12`. Pairs with `21`, `23`.

## Why this matters for $1B
Forge is the product's "wow" — text/photos → a textured 3D model in the browser. It's
the top-of-funnel magic that makes people screenshot and share. It must feel
instant, reliable, and delightful, with zero dead ends.

## Mission
Make the full forge flow production-grade: input → generation → preview → rig →
download/AR/share, every mode, every state, on every device.

## Map
- UI: `pages/forge.html` (full-width layout; modes: Describe it / From photos /
  sketch-when-live). Stage uses `<model-viewer>`; idle teaser shows a live community
  model.
- Backend: `api/forge.js` (lane-aware, rate-limited), plus `api/forge-poster.js`,
  `forge-og.js`, `forge-gameready.js`, `forge-rembg.js`, `forge-gallery.js`,
  `forge-enhance.js`, `forge-categorize.js`; image gen in `api/_mcp3d/`. Health:
  `api/_lib/forge-health.js`.
- Engines: free NVIDIA NIM / TRELLIS lane (`forge_free`), `mesh_forge` chain,
  auto-rig (`rig_mesh`, `forge_avatar`). Catalog gating hides engines with no live
  worker (note the hidden sketch tab).
- Auto-rig universality rules: `/CLAUDE.md` "Avatar animation is universal" +
  `src/glb-canonicalize.js`, `src/animation-retarget.js`.

## Do this
1. Exercise every mode end-to-end with real generations: text→3D, photos→3D, and
   sketch (only if a live worker exists — otherwise keep it correctly hidden, no dead
   tab). Confirm real API calls succeed with real data.
2. **Generation lifecycle:** real progress tied to the actual job (no fake bars), with
   honest stages (queued → generating → texturing → rigging → ready). Handle slow
   jobs, timeouts, and partial failures with retry (prompt `06`) — never a hung spinner.
3. **Preview:** orbit, zoom, AR, and lighting all work; mobile touch-orbit smooth;
   poster/skeleton until model loads (prompt `10`, `api/forge-poster.js`); model framed
   nicely by default.
4. **Auto-rig:** generated humanoids drive the canonical clip library (idle/walk,
   legs included) per the universality rule; non-humanoid props fall back cleanly to
   the default rig — never a bind-pose T-pose. Verify with a couple of distinct rigs.
5. **Output actions:** download GLB, view in AR, open in viewer, save to account, and
   share (with a real OG image of the model via `api/forge-og.js`) — every button does
   real work.
6. **States:** designed loading/empty/error (prompt `12`); rate-limit + upgrade path
   for the free lane (prompt `08`); clear messaging when an engine is down
   (`forge-health.js`).
7. **Cross-wiring:** a forged model links into the rest of the platform — save to
   profile, list on marketplace, use as an agent avatar, launch flow. Wire those
   connections (`/CLAUDE.md`: "A marketplace that doesn't link to agent profiles is
   half-built").
8. Add tests for the prepare/generate/rig API paths and a Playwright happy-path.

## Must-not
- Do not show fake progress or fake "done" on failure.
- Do not leave a generated model with no next action.
- Do not hardcode a curated rig allowlist — extend `glb-canonicalize.js` for new skeletons.

## Acceptance
- [ ] Every visible mode produces a real model end-to-end; hidden modes stay hidden until live.
- [ ] Honest progress lifecycle; timeouts/partial failures recover with retry.
- [ ] Preview (orbit/zoom/AR) works desktop + mobile with poster/skeleton.
- [ ] Auto-rig drives canonical clips on humanoids; clean fallback for props.
- [ ] Download / AR / save / share / list-on-marketplace all work and cross-link.
- [ ] Designed states + free-lane rate limiting; API + Playwright tests green.
