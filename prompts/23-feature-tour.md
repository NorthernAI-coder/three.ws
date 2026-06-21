# 23 · Feature Tour — Guided Product Walkthrough

## Mission
Polish the 3D guided tour into a signature, screenshot-worthy onboarding experience that teaches the
whole product, works across routes, and never glitches.

## Context
- `src/feature-tour/*`: `director.js` (orchestration), `guide-avatar.js` (3D guide + gravity),
  `controls.js`, `chapters.js` (map + settings + avatar picker), `narrator.js` (TTS),
  `spotlight.js`, `free-roam.js` (WASD/click/drag walking), `curriculum.js`. Curriculum built by
  `scripts/build-tour.mjs` → `/tour/curriculum.json`. Entry: `src/feature-tour.js`.
- Recent: guide defaults to "Ava", obeys gravity, avatar picker, keyboard free-roam.

## Tasks
1. **Curriculum coverage:** every major surface has a correct, current tour stop with a real on-page
   target; fix stale selectors/targets; Quick + Full tracks both coherent.
2. **Cross-route continuity:** navigating between stops on different pages re-hydrates correctly and
   never strands the guide off-route; off-route recovery is graceful.
3. **Guide quality:** walk/approach/point/gravity smooth; speech bubble + spotlight + beam aligned;
   reduced-motion honored; no WebGL leak on exit.
4. **Controls + chapters:** play/pause/seek/speed/mute/roam/exit all work; chapter jump; avatar picker
   swaps the guide; voice selection drives real TTS.
5. **Free-roam:** WASD/arrows (+Shift run), click-to-walk, drag, edge-scroll across the page; doesn't
   hijack typing or page clicks.
6. **TTS:** narration plays on the free lane with backstop; mute/speed respected; no audio overlap.
7. **States:** loading/empty/error designed; tour degrades to captions if WebGL/TTS unavailable.

## Acceptance
- Full tour runs across all routes without stranding/glitching; Quick + Full both correct.
- Controls/chapters/picker/voice/free-roam all functional; reduced-motion honored; no leaks.
- Degrades gracefully without WebGL/TTS; clean console; responsive; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
