# 21 — Watch-Intent Pool Polish (instant live pixels on demand)

> **Mission (one line):** When a viewer's eyes land on an agent card, a real Chromium caster spins up for it within seconds — and the handoff from skeleton → "warming up" → live frames feels so smooth the viewer never sees the seam.

## The watchable moment
You scroll the `/agents-live` wall. The card you're looking at flips from a dim activity terminal to a crisp, animated "warming up" pulse, then — a beat later — real browser pixels stream in at a visible FPS. Scroll past and the slot quietly frees: no wasted browser, no frozen last-frame. When the pool is full, the card honestly says "3rd in line" and keeps the activity terminal alive underneath, so it is never blank. It feels like a TV wall where every channel you turn to is already broadcasting.

## Who benefits
- **Viewer:** Looks at any agent and gets a live browser feed within seconds, with honest status the whole way — never a dead black box, never a lie about being "live".
- **Agent owner:** Their agent becomes watchable on demand without paying for an always-on browser; the moment someone cares, the pixels appear.
- **Platform:** Turns a fixed pool of 6 Chromium slots into the illusion of infinite live channels — the core economics that let the wall scale to thousands of agents at viewer-bounded cost.

## Where it lives
- **Surface:** `/agents-live` card (primary) + `/agent-screen?agentId=…` watch panel (same handoff states)
- **Entry points (verified to exist):**
  - `src/agents-live.js` — the wall: `buildCard`, `attachStream`, `signalWatch`, `paintActivity`, `startWatchPings`
  - `pages/agents-live.html` — card markup + styles
  - `src/shared/agent-screen-client.js` — SSE client with reconnect backoff
  - `api/agent/watch-intent.js` — POST intent → `ZADD screen:wanted`
  - `api/agent/watch-wanted.js` — GET read side (returns `{ agents, ts }`)
  - `workers/agent-screen-pool/index.js` — Playwright caster pool (`MAX_BROWSERS`, `reconcile`)
  - `api/agent-screen-stream.js` — SSE: emits `open` / `frame` / `log` / `dark` / `ping`

## Data flow (source → transform → render)
1. **Source:** Viewport intersection on a card → `POST /api/agent/watch-intent { agentId }` → `ZADD screen:wanted <now> <agentId>` (90s window). The pool worker polls `GET /api/agent/watch-wanted`, reconciles its bounded Chromium set, and pushes JPEG frames via `api/agent-screen-push.js`.
2. **Transform:** A new `GET /api/agent/watch-status?agentId=…` resolves, from Redis only (no DB), one of: `casting` (a frame exists in `agent:screen:{id}:frame`), `warming` (agent is inside the wanted window AND pool has free capacity), `queued` (wanted but pool at `MAX_BROWSERS` — returns a 1-based queue position by rank in `screen:wanted`), or `activity` (not wanted / Redis off). Position = the agent's reverse-rank in `screen:wanted` minus `MAX_BROWSERS`.
3. **Transport:** Existing SSE `frame`/`dark` events drive the live↔activity flip. The new status is fetched on mount and refreshed only while a card is `warming`/`queued` (not when already `casting`), so steady-state adds no per-frame requests.
4. **Render:** Card screen shows one of five visual states (below). The live badge dot + `[data-status]` text + a new `[data-warming]` overlay reflect the handoff.

## Build spec
1. **`api/agent/watch-status.js` (new):** Public, IP-rate-limited (reuse `limits.apiIp` + `clientIp` as in `watch-intent.js`). Validate `agentId` with `isUuid`. With Redis: read `EXISTS agent:screen:{id}:frame`; if set → `{ state: 'casting' }`. Else read the agent's rank in `screen:wanted` via `ZREVRANK` within the 90s window and compare to `MAX_BROWSERS` (env `SCREEN_POOL_MAX`, default 6, documented to mirror the worker's `MAX_BROWSERS`): rank `< MAX` → `{ state: 'warming' }`; else `{ state: 'queued', position: rank - MAX + 1 }`. No Redis → `{ state: 'activity' }`. Always `cache-control: no-store`.
2. **`src/agents-live.js` — card markup:** In `buildCard`, add a centered overlay node inside `.al-card-screen`: `<div class="al-card-warming" data-warming hidden><span class="al-warming-pulse"></span><span data-warming-text></span></div>`. This sits above the canvas, below the live badge.
3. **`src/agents-live.js` — status loop:** Add `pollWatchStatus(state)` that calls `watch-status`, then drives the overlay: `warming` → show pulse + "Warming up a live view…"; `queued` → show "Live view queued · #N in line"; `casting`/`activity` → hide overlay. Call it once in `mountAgent` right after `signalWatch`, and schedule a refresh every 4s **only while** `state` is not live and the last status was `warming`/`queued`. Clear the timer when a `frame` arrives (the agent went `casting`) or on `suspendStreams`.
4. **`src/agents-live.js` — intersection-driven intent:** Replace the "signal every card on mount" pattern with an `IntersectionObserver` (threshold 0.1) so `signalWatch` + status polling fire only for cards actually on screen, and stop when scrolled away. Keep `startWatchPings` but iterate only currently-intersecting cards (track an `_inView` Set). This is what frees pool slots the instant a viewer scrolls past — the missing teardown trigger the worker already honors.
5. **`src/agents-live.js` — FPS-aware label:** The wall already counts frames per agent in `_fpsMap`. Surface per-card FPS in the live badge tooltip (`title` attribute on `[data-status]`) and downgrade the dot to a "thin" class when an agent's own FPS drops below 1/s for >3s while still `casting` (stuttering caster), distinct from full `dark`.
6. **`src/agents-live.js` — reconnection polish:** On `es.onerror`, before the EventSource's own retry, immediately re-`signalWatch` so a dropped viewer reclaims its pool priority, and show a transient "Reconnecting…" status (not "Idle") for the first 2s after a drop. Mirror `RECONNECT_DELAYS` semantics already in `agent-screen-client.js`.
7. **`src/agent-screen.js` (watch panel parity):** Wire the same `warming`/`queued` overlay into the single-agent stage so the deep-dive page shows identical honest handoff copy. Reuse `watch-status`; the page already imports `createAgentScreenClient`.
8. **`pages/agents-live.html` — styles:** Add `.al-card-warming` (absolute-centered, backdrop blur, fade-in via opacity/transform transition), `.al-warming-pulse` (a CSS keyframe ring, `will-change: transform, opacity`, respects `prefers-reduced-motion` by falling back to a static dot), and `.al-card-live-dot.thin` (amber). No `setTimeout`-driven fake progress — the pulse is pure CSS ambiance, never a lie about real progress.
9. **`workers/agent-screen-pool/index.js` — capacity signal:** When `reconcile()` skips a wanted agent because `pool.size >= MAX_BROWSERS`, it already breaks; no change to the cast logic. Confirm `MAX_BROWSERS` default (6) and document that `SCREEN_POOL_MAX` on the API must match it so queue math is accurate. (Worker reads its own env; the API reads `SCREEN_POOL_MAX` for display only.)

## Files to create / modify
- `api/agent/watch-status.js` — new: Redis-only per-agent caster status + queue position.
- `src/agents-live.js` — IntersectionObserver intent, status overlay loop, FPS-aware badge, reconnection polish.
- `src/agent-screen.js` — warming/queued overlay parity on the single-agent stage.
- `pages/agents-live.html` — warming overlay + pulse + thin-dot styles (reduced-motion aware).
- `workers/agent-screen-pool/index.js` — comment/env alignment so `SCREEN_POOL_MAX` mirrors `MAX_BROWSERS` (no behavior change required beyond doc/env).

## Real integrations (no mocks, ever)
- Redis (`api/_lib/redis.js`) for `screen:wanted` + `agent:screen:{id}:frame` — the same keys the worker and stream already use.
- Real Playwright casters from `workers/agent-screen-pool` pushing through `api/agent-screen-push.js`.
- SSE via `api/agent-screen-stream.js` — no new transport.
- Credentials: `SCREEN_WORKER_SECRET` (worker ↔ API), Upstash Redis env. Locate in `.env` / `vercel env`; if absent, the path degrades to the activity view (already handled) — never fake a "live" state without a real frame.

## Every state designed
- **Loading:** Card mounts on the activity terminal (already painted) while `watch-status` resolves — never a blank canvas.
- **Empty:** No agents → existing `renderEmpty()` CTA. A watched agent with zero frames and no activity → "standing by" terminal line (existing `paintActivity`).
- **Error:** `watch-status` fails → overlay hidden, activity view stays; SSE drop → "Reconnecting…" then auto-retry. Never a silent black box.
- **Populated:** Live JPEG frames at visible FPS, green live dot, FPS in tooltip — the hero state.
- **Overflow:** Pool full → honest "queued · #N"; 1000 cards → IntersectionObserver keeps only on-screen cards signaling intent (bounded Redis writes); very long agent name → existing `esc` + CSS truncation; mid-stream network drop → reconnection path above.

## Definition of done
- [ ] Reachable from `/agents-live` and `/agent-screen` via real navigation.
- [ ] `watch-status` calls visible in the network tab; real `casting`/`warming`/`queued` transitions observed against a running `workers/agent-screen-pool`.
- [ ] Hover/active/focus states on card, watch button, and expand control intact.
- [ ] All five states implemented and visually verified.
- [ ] No console errors/warnings from this code; IntersectionObserver + timers cleaned up on `suspendStreams`/unmount.
- [ ] Existing tests pass (`npm test`); add a unit test for the queue-position math (`position = rank - MAX + 1`).
- [ ] Verified live in a browser against `npm run dev` (port 3000) with the pool worker running.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags: `feature`, `improvement`) — e.g. "Live agent wall now spins up a real browser feed the instant you look at a card, with honest 'warming up' and queue states." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another. This task touches transport/UX only — no token copy.
- No mocks, no fake data, no `setTimeout` fake progress (the CSS pulse is ambiance, not a progress claim), no TODOs, no stubs.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
