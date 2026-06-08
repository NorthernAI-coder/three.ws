# C6 — Reconcile + polish `/three-live` against Task 13 (don't rebuild it)

**Track:** C — build next · **Priority:** P3 · **Effort:** ~half day · **Depends on:** none
(optionally adopts the **C1** store)

## Context

`tasks/wow-sprint/13-onchain-activity-visualization.md` specs a reactive 3D onchain-activity
visualization, and points at `pages/pump-visualizer.html`. But the real $THREE implementation
already exists and is **~80% done**: `pages/three-live.html` ("$THREE Live · Protocol Pulse",
routed at `/three-live` in `vite.config.js`) — a Three.js scene with an `EventSource` trade stream,
particle bursts, whale shockwaves, a reconnect loop, `prefers-reduced-motion` handling, a
`requestAnimationFrame` loop, and a HUD reading `/api/three-token/stats` + `/api/agents/pumpfun-feed`.

Meanwhile `pages/pump-visualizer.html` (routed at `/pump-visualizer`) is a separate **generic**
pump.fun visualizer, not $THREE-scoped. **Do not build a third scene, and do not fork.**

## What to do (reconcile, then polish)

1. **Read both** `pages/three-live.html` and `pages/pump-visualizer.html`, plus
   `tasks/wow-sprint/13-onchain-activity-visualization.md`. Produce (in your commit message or a
   short note) a clear statement of what Task 13 asked for vs what `three-live.html` already
   delivers — i.e. **close the gap, don't restart**.
2. **Decide the canonical surface.** `three-live.html` is the $THREE one — treat it as canonical.
   If `pump-visualizer.html` overlaps and is redundant/unmaintained, either keep it explicitly as
   the generic-token tool (clearly distinct) or, if it's dead, propose removing it (don't delete
   without confirming it's unreferenced — check `vite.config.js`, nav, and links first).
3. **Polish `three-live.html` to fully satisfy Task 13's checklist:** verify every item the doc
   lists is present and working — reactive intensity tied to real trade volume, whale emphasis,
   reduced-motion path, reconnect resilience, empty/idle state when no trades, HUD accuracy, mobile
   behavior, and accessibility. Fix whatever is missing or rough.
4. **Optional:** retrofit the HUD to read from the **C1** store (`src/pump/three-token-data.js`)
   instead of its own `/api/three-token/stats` fetch, for consistency. Only if C1 is merged and it's
   a clean swap.
5. **Cross-link** `/three-live` from the holder dashboard / token page / nav so it's discoverable
   (it's a screenshot-worthy surface — make sure people can find it).

## Acceptance criteria

- [ ] A written reconciliation of Task 13 vs `three-live.html` (what was already done, what you
      closed) is captured in the commit message.
- [ ] Every Task 13 checklist item is satisfied by `three-live.html` (verified, not assumed).
- [ ] No third/forked scene introduced; `pump-visualizer.html`'s status (kept-as-generic or
      proposed-for-removal) is resolved explicitly.
- [ ] Idle/empty (no trades), reconnect, and reduced-motion states all work; mobile + a11y verified.
- [ ] `/three-live` is reachable from at least one holder surface + nav.
- [ ] No console errors; the trade stream shows real activity and reconnects cleanly.

## Verification

1. `npm run dev`; open `/three-live`. Confirm real trades animate, whales emphasized, HUD matches
   `/api/three-token/stats`.
2. Force-disconnect the stream → confirm reconnect; idle period → confirm the no-trades state.
3. Toggle `prefers-reduced-motion` → confirm the reduced path. Test on a narrow viewport.
4. Confirm the cross-links resolve.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). Only $THREE on this surface. Real trade stream — no synthetic
activity. Don't duplicate an existing surface.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/C6-three-live-reconcile.md`.
3. Commit your code **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "polish(three-live): satisfy Task 13 checklist + reconcile vs pump-visualizer; close C6"`
4. Do **not** push — the human controls pushes.
