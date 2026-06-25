# Prompt 06 — Polish, QA, and launch

The Omniology Arena is functionally built (prompts 01–05). This pass makes it
demo-perfect and durable: every state designed, responsive, accessible,
performant, tested, documented, and verified end-to-end in a real browser. The
goal is that it "just works 100%" with no follow-up babysitting.

## Read first (required)
- `docs/omniology-arena/README.md`, `CONTRACTS.md`, and prompts `01`–`05`
- `CLAUDE.md` — especially the **Definition of done** and **Self-review protocol** checklists. You are enforcing them here.
- The files produced by prompts 01–04 under `src/game/arena/`, the page
  `pages/arena/omniology.html`, and the venue assets under `public/arena/omniology/`.
- `src/club-perf.js` (perf profiles) and the weaknesses noted in the build plan.

## Do
1. **State audit** — for the world, screens, and desk verify all of: loading,
   empty, error, populated, overflow (very long agent names, 0 / 1 / many
   leaderboard rows, 0 entries, a stalled round), unconfigured, and
   network-failure-mid-submit. Fix any undesigned or ugly state. Skeleton
   loaders, not spinners. No blank voids.
2. **Responsiveness** — verify at 320px, 768px, 1440px. Touch controls, the
   compose UI, and the proximity prompt must all work on mobile. No fixed widths
   that break.
3. **Accessibility** — keyboard navigation for the desk/compose UI, focus rings,
   ARIA labels on interactive controls, sufficient contrast on canvas text,
   `prefers-reduced-motion` honored across bloom/celebration/animations.
4. **Performance** — profile a populated room (multiple players + 3 live screens +
   desk). Hold 60fps mid-tier and run on mobile. Apply the improvements the recon
   flagged where they pay off: instance/merge structural and repeated meshes,
   LOD or billboard distant remote avatars, share one poller across screens,
   ensure polling/animation pause on `document.hidden`. Cap draw calls. No jank.
5. **Resilience** — Omniology feed down → screens degrade calmly and auto-recover.
   Multiplayer server unreachable → the world still loads single-player with a
   clear notice. Submit failure → no double-charge, accurate messaging. A round
   flipping mid-submit is handled.
6. **Cross-links** — make the Arena reachable and navigable: add it where users
   would look for it (the relevant directory/nav/launch surface), and ensure
   leaving returns cleanly. A dead-end isn't done.
7. **Tests** — add/extend tests: the venue anchor test (02), adapter
   normalization (03), and the desk's SSE event handling against the documented
   `/api/x402-pay` event shapes (04). `npm test` green.
8. **Changelog** — add a holder-readable `feature` entry to `data/changelog.json`
   for the Omniology Arena (plain language, no jargon; optional `link` to the
   live path), then `npm run build:pages` to regenerate + validate.
9. **Final verification** — run `npm run dev`, walk the full journey in a real
   browser: spawn → see another player → watch a live ~88s contest on screens →
   walk to the desk → submit a real entry → see it confirm and hit the ticker.
   Capture that there are **no console errors or warnings** and that the Network
   tab shows real API calls succeeding. Run the repo's responsive-audit script if
   present.

## Acceptance criteria (the bar)
- Every box in CLAUDE.md's **Definition of done** is true and you can say so
  explicitly, per surface.
- The full end-to-end journey works in a real browser with real data, zero
  console errors/warnings.
- 60fps mid-tier; mobile usable. All states designed. A11y verified.
- `npm test` passes; changelog entry added and `build:pages` is green.
- `git diff` reviewed line-by-line; every change justified. You would be proud to
  demo this to a room of senior engineers and to Omniology.

## Do NOT
- Do not commit/push unless explicitly told. Do not modify the multiplayer server.
- Do not reference any coin other than `$THREE` (USDC payment asset is fine).
- Do not leave any TODO, stub, mock, sample array, or `setTimeout` fake progress.
