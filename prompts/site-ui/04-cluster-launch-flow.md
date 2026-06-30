# Site UI — cluster: launch flow

You are working in `/workspaces/three.ws`. Apply the shared game-feel library to the
**launch & deploy** surfaces — the path where a user creates and ships a coin/agent. These
are moments of accomplishment; the UI should make shipping *feel* like shipping.

**Prerequisite:** `src/ui-juice.js` from `prompts/site-ui/01-foundation-juice-library.md`.
Run that first if it's missing.

## Surfaces in this cluster

`src/launches.{js,css}`, `src/launch-detail.{js,css}`, `src/launch-copilot.{js,css}`,
`src/user-launcher.{js,css}`, `src/admin-launcher.{js,css}`, `src/deployments.{js,css}`,
`src/genesis.{js,css}`.

Work one surface at a time. Read each `.js`/`.css`, find its real data and any
launch/progress events, then apply what fits.

## The treatment (apply what fits each surface)

1. **The launch moment.** When a launch/deploy succeeds, a single restrained accent ripple (`rippleOnce`) + a clear success state — a real "it shipped" beat. **No fake progress bars or `setTimeout` fake-loading** (CLAUDE.md hard rule); show real async status from the actual request lifecycle only.
2. **Live launch feeds.** `launches`/`deployments` lists: `enterRow` for newly-landed launches, `liveDot` if backed by a real feed, count-up on aggregate counters (total launched, volume) between real values.
3. **Directory ladder.** Where launches are listed, rank/sort by real signal (recency, volume, performance) with smooth `flipReorder`. Make the deciding stat dominant.
4. **Detail pages.** `launch-detail`: `sparkline`/`ring` for real metric history; count-up live values; designed states for a brand-new launch with no history yet.
5. **State coverage.** Loading (skeleton), empty, error (actionable + retry), overflow — all designed. Forms (`*-launcher`, `launch-copilot`) need real inline validation and honest in-flight/disabled states.
6. **Consistency.** Tokens from `public/tokens.css`; hover/active/focus everywhere; match `/swarms` vocabulary.

## Rails (non-negotiable)

- Tokens only. No raw hex/px/ms where a token exists.
- Reduced motion verified (token override + library final-state paths).
- **No fake data and no fake progress** — launch status comes from the real request lifecycle, never a simulated timer.
- Concurrent agents edit `main`: stage explicit paths only, re-check `git status`, never `git add -A`.

## Definition of done (per surface)

- `npm run dev`, walk the real flow (create → submit → success/error) against real endpoints — confirm honest async states and a real success beat. No console errors.
- All states verified; forms validate real input at the boundary.
- Reduced-motion verified. `npm test` passes.
- `data/changelog.json` entry per surface (or one batched cluster entry), tag `improvement`.
- Review your `git diff`. Don't commit unless asked.

Track with TodoWrite (one item per surface); report done vs deferred.
