# Prompt 06 — Material, restyle & variant tools — report

Date: 2026-07-08

## What shipped

A PBR **material preset library** (reusable SDK) plus a user-reachable **Restyle
Studio** web tool that re-skins any GLB without regenerating it — non-destructively.

### 1. PBR preset library — `@three-ws/viewer-presets` (task 4)

New `packages/viewer-presets/src/materials.js` (exported from the package index and
the `./materials` subpath), extending the existing frozen-data + factory pattern the
package already used for lights/floor/bloom. Framework-agnostic (THREE passed in),
so it's unit-testable without WebGL.

- `MATERIAL_PRESETS` / `MATERIAL_PRESET_NAMES` — 14 curated looks: chrome, gold,
  copper, brushedSteel, gunmetal, matte, glossy, rubber, ceramic, glass, wood,
  stone, neon, holographic.
- `materialPreset(idOrConfig, overrides?)` — resolve + merge (throws on unknown id).
- `applyMaterialPreset(THREE, root, preset, opts?)` — apply onto every standard-like
  material under a loaded glTF; **non-destructive** (captures originals, returns
  `restore()`); skips MeshBasic/sprite/line materials untouched. **Preserves mesh +
  UVs** (only material parameters change — geometry is never touched).
- `materialVariants(base, { seed, count, hueSpread, jitter })` — **seeded,
  reproducible** colorway variants (mulberry32); same seed → identical set, aligning
  with Forge's `seed` semantics (task 3).
- Types in `index.d.ts`; **12 new unit tests** (18 total) all green; README section +
  version bump `0.2.0 → 0.3.0`.

### 2. Restyle Studio — `/restyle` (tasks 1, 3, 5)

New `pages/restyle.html` + `src/restyle.js`. Reuses the material library above, the
platform's `RoomEnvironment` PBR reflections, and Avatar Studio's
`optimizeAndValidateGlb` for a compressed, glTF-validated export.

- Load a GLB via `?url=`, file upload, drag-and-drop, or the default sample avatar.
- One-click **material presets** (task 1) with live metalness/roughness/emissive
  sliders + base/glow color pickers.
- **Seeded variants** strip (task 3) — Generate N, click a swatch to apply.
- **Non-destructive** with a history strip and **Reset to original** (task 5).
- **Export** a validated, optimized GLB.
- Designed loading / error states; all interactive elements have hover/active/focus.

### AI re-texture (task 2)

The UV-preserving AI re-texture backend already ships as the `retexture_model` MCP
tool (workers/texture `/texture`, `createRegenProvider('retex')`). Restyle Studio
links to it rather than duplicating a second, credential-gated web gateway. No dead
paths were shipped.

## Verification (real, in-browser)

Driven headless (Playwright) against `npm run dev`, viewport 1280×860:

- 14 preset buttons render; applying **chrome** → history `Original → Chrome`,
  active state set; applying **gold** renders with genuine metallic PBR reflections
  (screenshot `restyle-gold.png`).
- **Seeded variants**: Generate produced 6 distinct swatches; applying one works.
- **Export**: produced `restyled.glb` — `865 KB · optimized · valid glTF ✓`
  (real download, 885,948 bytes; validated via `optimizeAndValidateGlb`, 0 errors).
- **Reset** returns history to `Original`.
- No console errors from page code (only the dev-server HMR websocket noise in the
  codespace proxy).

Evidence: `restyle-chrome.png`, `restyle-gold.png` in this directory.

## Gate

`prompts/roadmap/_generated/06/gate-after.txt`. This prompt's own surfaces are green:
`audit:routes` ✓ (after adding the `/restyle` rewrite to `vercel.json`),
`audit:pages` ✓, `audit:tokens` ✓, viewer-presets tests 18/18 ✓. The remaining
`audit:mcp-golden` drift in the shared worktree is from other concurrent agents'
in-flight MCP tool additions (embed/AR/persona/spatial/naming) — not this prompt —
and this prompt adds zero golden drift, so the gate is no worse than gate-before.

## Files

- `packages/viewer-presets/src/materials.js` (new), `index.js`, `index.d.ts`,
  `test/presets.test.js`, `README.md`, `package.json` (0.3.0)
- `pages/restyle.html` (new), `src/restyle.js` (new)
- `vite.config.js` (input), `data/pages.json` (`/restyle`), `vercel.json` (rewrite)
- `data/changelog.json` entry (feature, sdk)

## Hand-off

Lineage in the page is a linear original→step history with Reset; the durable
branch/revert lineage core (`mcp-server/src/tools/_lineage.js`) remains the record
format for prompt 09 remixing. Variants are seed-addressable, so a marketplace (09)
can reference a look by `{ preset, seed, index }`.
