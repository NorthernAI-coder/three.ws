# 19 — Walk companion & feature tour

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 2 — Product surface completeness
**Owns:** `walk-sdk/`, `src/walk-companion.js`, `src/walk-playground.js`, `src/feature-tour/`, `tour-sdk/`, `page-agent-sdk/`.
**Depends on:** `09`, `11`, `12`. Pairs with `30` (onboarding).

## Why this matters for $1B
The walking 3D guide that strolls the live site and narrates features is a signature,
screenshot-worthy differentiator and a powerful onboarding device. Recent git history
shows both the tour and walk companion were broken on phones and only just fixed —
this surface needs to be bulletproof and genuinely delightful.

## Mission
Make the walk companion and feature tour flawless and delightful across all devices:
reliable narration, smooth avatar locomotion, accessible controls, and a tour that
actually teaches the product.

## Map
- Walk companion (corner mascot + full-page playground + avatar picker): `walk-sdk/`,
  `src/walk-companion.js`, `src/walk-playground.js`. Published as `@three-ws/walk`.
- Feature tour (avatar walks the live site narrating features):
  `src/feature-tour/{director,controls,free-roam,guide-avatar,narrator}.js`,
  `tour-sdk/`. Page-agent drop-in: `page-agent-sdk/` (`<page-agent>`).
- Mobile audio gotcha (already solved — preserve): browsers block audio until a tap,
  permission resets per page; tour unlocks on first tap and shows a "tap for voice"
  cue, then re-speaks the current stop. Launchable from home via "Take the tour".

## Do this
1. **Tour content & flow:** the script visits real, current features in a logical
   order and explains *why each matters to the user* — not just "this is X." Re-audit
   stops against the live site so nothing points to a moved/removed feature.
2. **Narration:** per-page audio unlock works on iOS/Android; clear waiting cue;
   re-speaks current stop; captions/transcript for accessibility and muted contexts
   (prompt `09`). Voice off/on persists.
3. **Locomotion:** the guide avatar walks (legs animated via the canonical clip
   library, per `/CLAUDE.md`), pathing is smooth, and free-roam doesn't clip through
   layout or wander off-screen. Honor reduced-motion.
4. **Controls:** play/pause/next/prev/skip/close with phone-sized tap targets,
   keyboard operable, focus-managed (prompts `09`, `11`).
5. **Walk companion:** corner mascot summonable on desktop **and** mobile (the mobile
   "Walk with me" switch must stay reachable — this exact reachability bug already
   bit it). Idle wander without a mouse; tap opens the full playground.
6. **Avatar picker:** diverse, real avatars; user can choose; choice persists.
7. **SDK quality:** `walk-sdk`, `tour-sdk`, `page-agent-sdk` build, are documented,
   and have working embed examples (`examples/`). Publish-ready (prompt `24`).
8. **Performance:** lazy-load the 3D/companion so it never blocks first paint (prompt
   `10`); throttle on low-end devices.
9. Tests: tour stop integrity, audio-unlock logic, mobile reachability, SDK build.

## Must-not
- Do not regress the per-page audio-unlock or the mobile summon switch.
- Do not let the guide T-pose or clip through the page.
- Do not block first paint loading the companion.

## Acceptance
- [ ] Tour visits current features, explains user value, with captions/transcript.
- [ ] Narration unlocks per page on iOS/Android; controls accessible + phone-sized.
- [ ] Guide walks with animated legs, smooth pathing, reduced-motion respected.
- [ ] Walk companion summonable on desktop + mobile; avatar picker works and persists.
- [ ] walk/tour/page-agent SDKs build, documented, with working examples.
- [ ] Companion lazy-loaded; tests green.
