# three.ws — Continuous Improvement Plan

A set of **self-contained prompts**, one per file, each runnable cold in a new chat.
Paste the contents of one file into a fresh three.ws session and the agent has
everything it needs to ship that improvement without breaking the current
architecture.

## How to use

1. Open a new chat in this repo (so `CLAUDE.md` auto-loads).
2. Paste the full contents of one `NN-*.md` file as your first message.
3. Let the agent execute. Each prompt ends with a Definition of Done it must verify.
4. Run them in any order — they are independent. Where one benefits from another,
   it says so, but none hard-depend on another.

## Standing rules every prompt inherits (from `CLAUDE.md`)

These are restated in each file, but they hold everywhere:

- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.
  Never reference, hardcode, or recommend any other token. Synthetic placeholders
  only in fixtures.
- **No mocks, no fake data, no placeholders, no stubs, no `setTimeout` fake loading.**
  Real APIs, real endpoints, real data, or it doesn't ship.
- **Don't break what works.** Read the existing pattern before adding to it. Match
  naming, file organization, and abstractions already in the repo. Run `npm test`
  before claiming done.
- **Every state is designed** — loading (skeletons), empty (tells the user what to
  do), error (actionable), populated, overflow.
- **Changelog:** every user-visible change appends an entry to `data/changelog.json`
  (run `npm run build:pages` to validate). Internal-only chores do not.
- **Commit/push only when the user asks.** When they do: push to **both** remotes
  (`threeD` and `threews`). Never pull/fetch from `threeD`.

## The plan

### Harden & polish what's built
- [`01-forge-studio-state-audit.md`](01-forge-studio-state-audit.md) — Make the 3D
  generation studio flawless in every state; close dead paths.
- [`02-self-host-default-lane.md`](02-self-host-default-lane.md) — Make our own
  GPU model lanes the resilient default; stop depending on third-party vendors.
- [`03-pose-animation-polish.md`](03-pose-animation-polish.md) — Pose studio +
  animation retarget: more poses, cleaner export, universal-rig coverage.

### New 3D creation tools
- [`04-multiview-3d-scanner.md`](04-multiview-3d-scanner.md) — Turn a phone/webcam
  into a multi-view 3D scanner on the existing multi-view reconstruction path.
- [`05-scene-studio-worlds.md`](05-scene-studio-worlds.md) — Composable, shareable
  3D worlds populated with live agents.
- [`06-ar-view-in-space.md`](06-ar-view-in-space.md) — One-tap AR "view in your
  space" for any generated avatar or asset.
- [`07-retexture-gameready.md`](07-retexture-gameready.md) — AI retexture + a
  polished game-ready (quad retopo + PBR) export path.

### New ways to create & use with 3D + crypto + AI
- [`08-launch-coin-with-3d-mascot.md`](08-launch-coin-with-3d-mascot.md) — Forge a
  3D mascot and carry it through a $THREE-only pump.fun launch.
- [`09-agent-embodiment.md`](09-agent-embodiment.md) — Every agent gets a forged,
  rigged 3D body that follows it across every surface.
- [`10-forge-as-paid-service.md`](10-forge-as-paid-service.md) — Sell 3D generation
  to other agents over x402, metered and provenance-logged.

## Picking what to run first

If you want the **highest leverage on what exists**, run `02` (kills vendor cost
and flakiness) then `01` (polish the funnel users already hit).
If you want **new surface area to show off**, run `04` then `08`.
