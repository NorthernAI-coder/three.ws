# 24 · Scene Studio — 3D Scene Editor

## Mission
Make the in-browser 3D scene editor (import GLBs, compose scenes, edit materials/lights, export) a
reliable, professional tool that never loses work and exports correctly.

## Context
- `src/scene-studio/` (`→ /scene`), vendored three.js r184 editor (MIT). Imports GLBs, composes,
  edits materials/lights, exports.

## Tasks
1. **Import/export integrity:** GLB/GLTF import preserves materials/animations; export round-trips
   without corruption; supported formats documented; large-file handling with progress + error states.
2. **Editing UX:** transform gizmos, hierarchy, material/light editing all functional and discoverable;
   undo/redo reliable; keyboard shortcuts documented.
3. **Persistence:** autosave / no silent work loss; warn before navigation with unsaved changes;
   restore on reload.
4. **Performance:** handle reasonably complex scenes without jank; dispose resources; cap pixel ratio.
5. **States:** empty (start a scene / import), loading, error (bad file → actionable message), populated.
6. **Vendor hygiene:** keep the vendored editor cleanly separated (see `vendor/README.md`); our
   customizations isolated so upstream updates remain possible.

## Acceptance
- Import → edit → export round-trips correctly on real GLBs incl. animations.
- Undo/redo + autosave reliable; no silent work loss; large-file + bad-file states designed.
- No leaks; clean console; responsive; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Keep vendored code isolated. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/24-scene-studio.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
