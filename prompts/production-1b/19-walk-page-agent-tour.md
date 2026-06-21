# 19 — Walk companion, Page-Agent & Feature Tour

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

These three surfaces are how three.ws makes a 3D agent *show up* on any page — the
corner mascot that strolls a site, the drop-in narrator that explains a product, and
the guided tour that walks a first-time visitor through the platform. They are the
embeddable, shareable, screenshot-worthy front of the funnel and the reason a
developer installs `@three-ws/walk` or `@three-ws/page-agent` instead of building
their own. If the companion janks, the narrator picks a T-posed avatar, or the tour
dead-ends, the "living 3D web" promise dies on first contact and so does virality.

## Mission

Take the Walk companion (mascot + full-page playground + diverse avatar picker), the
`<page-agent>` narrator, and the 3D Feature Tour to end-to-end production polish:
every state designed, every avatar rigged and animating, smooth at 60fps, and never a
broken hand-off between modes.

## Map (trust but verify — files move)

- **Walk SDK (`@three-ws/walk`)** — [walk-sdk/src/index.js](../../walk-sdk/src/index.js)
  (public API), [walk-sdk/src/companion.js](../../walk-sdk/src/companion.js) (corner
  mascot), [walk-sdk/src/playground.js](../../walk-sdk/src/playground.js) (full-page
  stroll/platformer), [walk-sdk/src/picker.js](../../walk-sdk/src/picker.js) +
  [walk-sdk/src/roster.js](../../walk-sdk/src/roster.js) (diverse avatar picker +
  `WALK_AVATARS`), [walk-sdk/src/config.js](../../walk-sdk/src/config.js),
  [walk-sdk/package.json](../../walk-sdk/package.json), [walk-sdk/README.md](../../walk-sdk/README.md).
- **Walk app entries** — [src/walk-companion.js](../../src/walk-companion.js) (on-demand
  platform inject), [src/walk-playground.js](../../src/walk-playground.js). Pages:
  [pages/walk-landing.html](../../pages/walk-landing.html) (`/walk`),
  [pages/walk-embed.html](../../pages/walk-embed.html) (`/walk-embed` code generator),
  [pages/walk-leaderboard.html](../../pages/walk-leaderboard.html),
  [pages/walk-analytics.html](../../pages/walk-analytics.html).
- **Page-Agent SDK (`@three-ws/page-agent`)** — [page-agent-sdk/src/index.js](../../page-agent-sdk/src/index.js)
  (public API), [page-agent-sdk/src/element.js](../../page-agent-sdk/src/element.js)
  (`<page-agent>` custom element), [page-agent-sdk/src/page-agent.js](../../page-agent-sdk/src/page-agent.js)
  (controller), [page-agent-sdk/src/catalog.js](../../page-agent-sdk/src/catalog.js)
  (**rigged-only** catalog), [page-agent-sdk/src/picker.js](../../page-agent-sdk/src/picker.js),
  [page-agent-sdk/src/narrator.js](../../page-agent-sdk/src/narrator.js),
  [page-agent-sdk/src/lipsync.js](../../page-agent-sdk/src/lipsync.js),
  [page-agent-sdk/src/stage.js](../../page-agent-sdk/src/stage.js). Demos:
  [page-agent-sdk/examples/](../../page-agent-sdk/examples). Publish:
  [page-agent-sdk/PUBLISHING.md](../../page-agent-sdk/PUBLISHING.md).
- **Feature Tour** — [src/feature-tour/index.js](../../src/feature-tour/index.js)
  (`createFeatureTour`, `?tour=start` bootstrap), [src/feature-tour/director.js](../../src/feature-tour/director.js)
  (curriculum stepping/spotlight/pointing), [src/feature-tour/controls.js](../../src/feature-tour/controls.js)
  (playback bar), [src/feature-tour/free-roam.js](../../src/feature-tour/free-roam.js)
  (hand-off to click-to-walk), [src/feature-tour/guide-avatar.js](../../src/feature-tour/guide-avatar.js)
  (guide character), [src/feature-tour/narrator.js](../../src/feature-tour/narrator.js),
  [src/feature-tour/chapters.js](../../src/feature-tour/chapters.js),
  [src/feature-tour/curriculum.js](../../src/feature-tour/curriculum.js),
  [src/feature-tour/spotlight.js](../../src/feature-tour/spotlight.js). App entry:
  [src/feature-tour.js](../../src/feature-tour.js). Page: [pages/tour.html](../../pages/tour.html) (`/tour`).
- **Universal rig pipeline (do not bypass)** — [src/glb-canonicalize.js](../../src/glb-canonicalize.js),
  [src/animation-retarget.js](../../src/animation-retarget.js), gate in
  [src/animation-manager.js](../../src/animation-manager.js) (`supportsCanonicalClips()`).
- **Tests** — [tests/walk-gestures.test.js](../../tests/walk-gestures.test.js),
  [page-agent-sdk/test/catalog.test.js](../../page-agent-sdk/test/catalog.test.js),
  [tests/feature-tour-curriculum.test.js](../../tests/feature-tour-curriculum.test.js).

## Do this

1. **Exercise all three in a real browser** (`npm run dev`, port 3000): load `/walk`,
   click the corner companion to detach into the full-page playground, open the avatar
   picker; load a page with `<page-agent>` (use `page-agent-sdk/examples/index.html`)
   and let it narrate; launch the Feature Tour via `?tour=start` and run it to free-roam
   hand-off. Watch the console and Network tab the whole time — zero errors/warnings.
2. **Every avatar is rigged and animates.** Confirm the Walk roster and the Page-Agent
   catalog only surface rigged GLBs that drive the canonical clip library (idle/walk
   legs included), never a bind-pose T-pose. If a humanoid won't animate, it's a
   bone-name gap — extend [src/glb-canonicalize.js](../../src/glb-canonicalize.js) and
   add a case in `tests/glb-canonicalize.test.js`. Do not hardcode a rig allowlist.
3. **Avatar picker diversity.** Audit `WALK_AVATARS` (roster.js) and the page-agent
   catalog for a genuinely diverse set (skin tones, body types, styles, presentation) —
   not five variants of one model. Make the picker keyboard-navigable, focus-trapped,
   with hover/active/focus states and a designed empty/loading state if a GLB fails.
4. **Every state designed for each surface:** companion loading (skeleton, not a dead
   sprite), playground empty/first-run hint, picker loading/error, narrator
   caption-while-speaking + muted state, tour loading/paused/finished/exit-confirm.
   No fake `setTimeout` progress bars — real asset-load progress only.
5. **Mode hand-offs never break.** Companion → playground detach, playground → page
   navigation persistence ([src/walk-companion.js] transitions), Tour director →
   `free-roam.js` click-to-walk and back. Verify each transition leaves no orphaned
   canvas, listener, or animation loop (check for leaked `requestAnimationFrame`).
6. **Performance.** Lazy-load three.js and avatar GLBs; cap the playground/companion
   frame budget; pause render loops when the tab is hidden or the element is offscreen
   (IntersectionObserver). Confirm no layout thrash and a smooth 60fps on a mid-range
   device profile (DevTools Performance trace).
7. **Embed integrity.** The `/walk-embed` code generator and the `<page-agent>` script
   tag must produce working, copy-pasteable snippets that load from the published
   package paths — exercise the generated snippet in a blank HTML file.
8. **Accessibility & resilience.** ARIA labels on companion/picker/tour controls,
   `prefers-reduced-motion` respected (reduce idle sway, no auto-walk), and a missing
   avatar/manifest falls back gracefully (next roster entry) instead of a blank canvas.
9. **Run the tests:** `npx vitest run tests/walk-gestures.test.js
   tests/feature-tour-curriculum.test.js page-agent-sdk/test/catalog.test.js`. Add
   cover for any failure mode you fixed (GLB load failure, picker empty, tour exit).
10. Add a `data/changelog.json` entry for any user-visible change and run
    `npm run build:pages`.

## Must-not

- Do not hardcode a rig allowlist — extend `glb-canonicalize.js` bone maps for any new
  skeleton instead, and never ship a T-posed humanoid.
- Do not break the existing companion/playground/tour code paths while polishing — add
  to unprotected paths, don't refactor working logic for its own sake.
- Do not ship a fake progress bar, a render loop that runs while the tab is hidden, or
  a picker that lists unrigged/missing avatars.
- Do not leave a broken mode hand-off, orphaned canvas, or leaked animation loop.
- Do not reference any coin other than `$THREE` in copy, narration, or sample data.

## Acceptance (all true before claiming done)

- [ ] `/walk` companion, full-page playground, and avatar picker all work in a real
      browser with no console errors/warnings; detach + page-navigation persistence work.
- [ ] `<page-agent>` mounts from the example, narrates with live captions and a muted
      state, and offers a rigged-only, diverse, keyboard-navigable picker.
- [ ] Feature Tour runs end-to-end (`?tour=start` → chapters → free-roam hand-off →
      exit), with loading/paused/finished/exit-confirm states designed.
- [ ] Every surfaced avatar is rigged and animates (no unjustified T-pose); any new
      skeleton convention added to `glb-canonicalize.js` with a test case.
- [ ] Loading/empty/error states designed across all three; no fake progress bars;
      render loops pause when hidden/offscreen; 60fps on a mid-range profile.
- [ ] The `/walk-embed` snippet and the `<page-agent>` script tag work pasted into a
      blank page.
- [ ] `prefers-reduced-motion` and ARIA/keyboard support verified.
- [ ] Listed tests pass; new failure modes covered.
- [ ] Changelog updated and `npm run build:pages` is clean.
