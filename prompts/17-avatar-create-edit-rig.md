# 17 · Avatar Pipeline — Create, Edit, Rig, Animate

## Mission
The full avatar lifecycle — generate (text/selfie/photo), customize (wardrobe/sculpt/accessories),
rig, animate, save, and use everywhere — must be seamless, owned-by-you, and never produce a broken
or T-posed model.

## Context
- Create flows: `/create`, `/create/selfie`, `/create/prompt`, `/avatar-studio` (full editor),
  `character-studio/` (forked builder). Edit: `src/avatar-edit.js` + `pages/avatar-edit.html`
  (`/avatars/:id/edit`); sculpt `src/avatar-sculpt.js`; accessories `src/agent-accessories.js`.
- Canonicalize/retarget: `src/glb-canonicalize.js`, `src/animation-retarget.js`,
  `AnimationManager.supportsCanonicalClips()`. Snapshot: `src/voice/avatar-snapshot.js`.
- MCP avatar tools: `forge_avatar`, `text_to_avatar`, `mesh_forge`, `rig_mesh`.

## Tasks
1. **Create → own:** each create path produces a real, owned, riggable GLB; ownership checks
   (`owner_id`) enforced on read/edit (no IDOR). Empty/loading/error states designed.
2. **Edit:** wardrobe, hats, glasses, earrings, sculpt morphs, animate tab all apply live and persist;
   "no GLB / not owner / no avatar specified" states are graceful (not 404s — see prompt 02/05).
3. **Rig + animate:** every saved avatar drives the shared clip library; rig fallback for
   non-humanoid; add skeleton mappings + tests for any rig that T-poses.
4. **Snapshot/thumbnail:** save generates a correct thumbnail used across gallery/marketplace/dashboard.
5. **Cross-surface use:** the saved avatar appears as the walk companion, tour guide, dashboard topbar
   avatar, and is selectable in pickers (shared storage key).
6. **MCP parity:** `forge_avatar`/`rig_mesh` produce results consistent with the web pipeline.

## Acceptance
- Create→edit→save→use round-trips for text, selfie, and photo inputs with persistence.
- No T-pose anywhere; ownership enforced; all edit states designed.
- Thumbnails generate and propagate; MCP avatar tools match web output.
- E2E (prompt 07) green; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/17-avatar-create-edit-rig.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
