# Prompt 03 — Live contest screens

Build the in-world screens that show Omniology's live contests: the current
contest with a ~88-second countdown, a leaderboard, and a live ticker of recent
entries. Real data from Omniology's feed — no mocks, no sample arrays.

## Read first (required)
- `docs/omniology-arena/README.md`, `docs/omniology-arena/CONTRACTS.md` (esp. §1.1 feed shape and §2.1/§2.2 module contracts), `CLAUDE.md`
- `src/game/chart-screen.js` — the proven live-screen pattern to generalize: a `CanvasTexture` (sRGB, anisotropy) on a `PlaneGeometry`, a poll loop with `clearTimeout`/`setTimeout`, a `draw()` that paints loading/live/empty/error states, a `~10fps` redraw (`REDRAW_MS = 100`) via `update(dt)`, clickable raycast, and a clean `dispose()`. Mirror its structure closely.
- `src/game/coincommunities.js` `_buildScreen()` / `_drawScreen()` (~592–720) — event-driven redraw and canvas layout reference.
- `src/game/arena/arena.js` (prompt 01) — `registerUpdatable()` and `this.anchors.screens[]` (prompt 02).

## Build
1. **Adapter** `src/game/arena/omniology-adapter.js` per CONTRACTS §2.1 — the
   ONLY module that knows Omniology's wire shapes. `omniologyBase()` reads
   `<meta name="omniology-base">` or `VITE_OMNIOLOGY_BASE`. `fetchLiveFeed()`
   calls `GET {base}/v1/contests/live`, normalizes to `NormalizedFeed`
   (ms timestamps, camelCase), and throws on network error. Also export
   `submitEntryRequest(contestId, entry, agent)` for prompt 04 (define it now so
   the boundary is fixed). **If `omniologyBase()` is empty, `fetchLiveFeed()`
   must surface a clear "unconfigured" status — never return fabricated data.**
2. **Screen component** `src/game/arena/contest-screen.js` per CONTRACTS §2.2 —
   `createContestScreen(scene, { position, width, rotationY })`. Three logical
   panels rendered to the canvas:
   - **Now playing**: contest title, round number, prize (USDC), and a large
     countdown to `closesMs` corrected by `serverNowMs` drift. Color shifts as
     time runs low. When a round flips (round number changes), animate a brief
     "NEW ROUND" sweep.
   - **Leaderboard**: top entries with rank, agent, score, optional thumbnail.
   - **Live ticker**: recent entries scrolling in; `pushEntry()` inserts
     optimistically (used by the desk in prompt 04).
   - A pulsing LIVE/OFFLINE status badge driven by `setStatus()`.
3. **Polling controller**: one poller (not one per screen) calls
   `fetchLiveFeed()` on an interval tuned to the 88s cadence (e.g. every 5s, and
   immediately re-poll right after a detected round close to catch the flip).
   Pause polling on `document.hidden`; resume on focus. Feed each screen via
   `applyFeed()`. On error, `setStatus('error')` with a designed retry/backoff.
4. **Mount**: in the arena bootstrap, create one `contest-screen` per
   `this.anchors.screens[]` entry, add to scene, and `registerUpdatable()` each
   so they redraw and advance the countdown every frame. (You may give the three
   walls different roles — e.g. wall 1 now-playing, wall 2 leaderboard, wall 3
   winners — via an option flag, but one component handles all.)
5. **States (all designed, per CLAUDE.md)**: loading (skeleton on the canvas),
   live (data), empty (between rounds / no contest — tell the viewer what's
   next, e.g. "Next round opens in…"), error (Omniology unreachable — calm,
   non-alarming, auto-retrying), unconfigured (no base URL set — a tasteful
   "connecting to Omniology" placeholder, not fake leaderboard rows).

## Acceptance criteria
- With `VITE_OMNIOLOGY_BASE` (or the meta tag) pointed at Omniology's real or
  sandbox feed, the screens show live contests, a counting-down ~88s clock that
  stays in sync across a round flip, a populated leaderboard, and entries
  ticking in. Verified in a real browser against a real endpoint.
- With no base configured, screens show the designed unconfigured/connecting
  state — never invented data. (This satisfies no-mocks while unblocked of the
  partner.)
- Network tab shows real GET polls; polling pauses when the tab is hidden.
- Multiple screens share one poller; no duplicate requests per screen.
- `dispose()` cleans canvas/texture/geometry and cancels timers.
- No console errors/warnings. `npm test` passes. 60fps maintained with screens live.

## Hand-off
Export the screen handles (or a `pushEntry` hook) so prompt 04's desk can call
`pushEntry()` on successful submission. Keep `submitEntryRequest()` in the
adapter stable — prompt 04 depends on it.
