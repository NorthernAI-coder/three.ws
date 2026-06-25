# Prompt 03 — Live contest screens

Build the in-world screens that show Omniology's live contests: the current
contest with a ~88-second countdown, a leaderboard, and a live ticker of recent
entries. Real data from Omniology's feed — no mocks, no sample arrays.

## Read first (required)
- `docs/omniology-arena/README.md`, `docs/omniology-arena/CONTRACTS.md` (esp. §1.1 feed, §1.6 leaderboard, §2.1/§2.2/§2.5 module contracts), `docs/omniology-arena/SECURITY.md` (C3–C5 — the proxy enforces these), `CLAUDE.md`
- `api/x402-pay.js` for the SSRF-guarded `guardedFetch` (host-pinned, size/timeout bounded) you reuse in the proxy; `api/_lib/ssrf.js`.
- `src/game/chart-screen.js` — the proven live-screen pattern to generalize: a `CanvasTexture` (sRGB, anisotropy) on a `PlaneGeometry`, a poll loop with `clearTimeout`/`setTimeout`, a `draw()` that paints loading/live/empty/error states, a `~10fps` redraw (`REDRAW_MS = 100`) via `update(dt)`, clickable raycast, and a clean `dispose()`. Mirror its structure closely.
- `src/game/coincommunities.js` `_buildScreen()` / `_drawScreen()` (~592–720) — event-driven redraw and canvas layout reference.
- `src/game/arena/arena.js` (prompt 01) — `registerUpdatable()` and `this.anchors.screens[]` (prompt 02).

## Build
1. **Server proxy** `api/arena/omniology-feed.js` per CONTRACTS §2.5 — read-through,
   short-TTL cache (~5s) over `GET {OMNIOLOGY_ENGINE_BASE}/v1/contests/active`
   (and the leaderboard, §1.6). Use the SSRF-guarded `guardedFetch` host-pinned to
   the engine; enforce a response size limit + content-type check (SECURITY.md C3)
   and clamp/strip partner strings (C4). The browser only ever talks to this proxy,
   never the engine (privacy, C5). Expose e.g. `GET /api/arena/omniology-feed` and
   `GET /api/arena/omniology-feed?leaderboard={contestId}`.
2. **Adapter** `src/game/arena/omniology-adapter.js` per CONTRACTS §2.1 — the ONLY
   client module that knows Omniology shapes. `omniologyBase()` reads
   `<meta name="omniology-base">` / `VITE_OMNIOLOGY_BASE` (OUR proxy base, default
   `/api/arena`). `fetchLiveFeed()` GETs the proxy, normalizes to `NormalizedFeed`
   (ms timestamps, camelCase, picks `current` = soonest-closing open/collecting
   contest), throws on network error. `fetchLeaderboard(contestId)` via the proxy.
   **If unconfigured, surface a clear "unconfigured" status — never fabricate data.**
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
- With `OMNIOLOGY_ENGINE_BASE` set (server) and the proxy live, the screens show
  real contests from `/v1/contests/active`, a counting-down ~88s clock
  (`time_remaining_seconds`/`submission_closes_at`) that stays in sync across a
  round flip, a populated leaderboard (§1.6), and entries ticking in. Verified in
  a real browser against the real engine (or sandbox).
- The browser only calls our proxy; the proxy enforces size/content-type (C3) and
  string clamping (C4). Confirm in the Network tab the engine host is never hit
  directly from the client.
- With no base configured, screens show the designed unconfigured/connecting
  state — never invented data. (This satisfies no-mocks while unblocked of the
  partner.)
- Network tab shows real GET polls; polling pauses when the tab is hidden.
- Multiple screens share one poller; no duplicate requests per screen.
- `dispose()` cleans canvas/texture/geometry and cancels timers.
- No console errors/warnings. `npm test` passes. 60fps maintained with screens live.

## Hand-off
Export the screen handles (or a `pushEntry` hook) so prompt 04's desk can call
`pushEntry()` on a confirmed entry. Keep the adapter's `fetchLiveFeed()` /
`NormalizedFeed` and the `current` selection stable — prompt 04 reads the
featured contest (id, theme, fee, payload_format, max_payload_chars) from it.
