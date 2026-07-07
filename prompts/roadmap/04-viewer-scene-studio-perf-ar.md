# Prompt 04 — Viewer + Scene Studio: performance, mobile, AR (additive)

> Paste into a fresh Claude Code chat. Follow CLAUDE.md + `prompts/roadmap/00-README.md`. Run `npm run gate` before and after.

## Context
Viewer surfaces: `avatar-sdk/` → `@three-ws/avatar` (`<agent-3d>` web component), `walk-sdk/`, `page-agent-sdk/`. Scene Studio: `src/scene-studio/` → `/scene` (vendored three.js r184 editor — do NOT fork the vendor; layer on top). These are published/depended-on; **API stability is critical.**

## Objective
Make every viewer faster, smoother on mobile, accessible, and AR-capable — without changing public component APIs.

## Tasks (additive / back-compatible)
1. **Asset performance.** Add Draco/meshopt decompression support to the viewer and an optional `npm run optimize:glb`/`compress:glbs`-backed serving path so large GLBs load fast. Cap pixel ratio, frustum-cull, lazy-load heavy modules, reuse loaders. Measure load time + FPS before/after on a heavy model.
2. **Mobile + responsive.** Verify and fix touch controls, viewport sizing, and performance at 320/768/1440px. Add quality auto-degrade on low-end devices (lower DPR, simpler lighting). Default desktop behavior unchanged.
3. **Accessibility.** Semantic markup around canvases, ARIA labels on controls, keyboard orbit/zoom, focus indicators, reduced-motion support, sufficient contrast in UI chrome.
4. **AR / USDZ Quick Look (new, opt-in).** Add a "View in AR" affordance: generate/serve a USDZ alongside GLB for iOS Quick Look and use `<model-viewer>`-style or WebXR AR on Android. Reuse existing export (`src/avatar-export.js`); add USDZ conversion in the build/serve path. Opt-in attribute on the component; absent by default.
5. **Scene Studio UX (layered).** Add quality-of-life on top of the vendored editor without modifying vendor files: import-from-Forge button (pull a generated GLB straight in), one-click export presets, and a share/embed action. Keep the vendor upgrade-clean.
6. **Embeddable share.** Improve `src/avatar-embed.js` so any model/scene yields a copy-paste `<agent-3d>` embed snippet + share URL.

## Non-negotiables
- `@three-ws/avatar` and other published component APIs unchanged (golden/snapshot tests stay green). New behavior via new opt-in attributes/params only.
- Do not edit `src/scene-studio/vendor/**`; add sibling modules.

## Verification
- Heavy-model load-time + FPS before/after captured to `prompts/roadmap/_generated/04/perf.md` (show improvement).
- AR launches on a real iOS (USDZ Quick Look) and Android (WebXR) path, or document the served USDZ + the exact client trigger if no device available.
- Keyboard-only operation works; no console errors. `npm run gate` green. Changelog + `npm run build:pages`.

## Definition of done
- Faster, mobile-solid, accessible, AR-capable viewers + a friendlier Scene Studio — all backward compatible.

## Hand-off
Report perf deltas, the AR path, and new opt-in attributes. Commit/push only if asked; both remotes.
