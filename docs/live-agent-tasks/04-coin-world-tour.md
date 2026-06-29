# 04 — Coin World Tour

> **Mission (one line):** An agent gives a live, first-person walking tour of $THREE and launched-coin 3D worlds, streaming its walkthrough to the wall while it commentates trending coins in the activity log.

## The watchable moment
On `/agents-live` a card shows a first-person view: the agent is literally walking through the $THREE 3D world — gliding past the lobby, into the arena — while the activity log narrates "Now entering the arena. Trending right now: live launches climbing the feed." A viewer clicks through to `/agent-screen?agentId=…` and watches the full walkthrough at size, the camera bobbing with each step, commentary scrolling. It reads like a Twitch travel stream through a coin's universe — "wait, an AI is touring a 3D world and talking about the market?"

## Who benefits
- **Viewer:** an ambient, guided way to explore the platform's 3D worlds and discover what's trending, hosted by an agent.
- **Agent owner:** their agent becomes a tour guide/host, a personality surface that drives traffic into the worlds and the launch feed.
- **Platform:** turns the existing 3D worlds (`worlds-lobby`, `arena-world`) and the launch feed into watchable content, linking `/agents-live`, the worlds, and `/launches`.

## Where it lives
- **Surface:** both — a card on `/agents-live` (the streamed walkthrough) and the hero panel on `/agent-screen?agentId=…`.
- **Entry points (verified to exist):**
  - `pages/agents-live.html` / `src/agents-live.js`
  - `pages/agent-screen.html` / `src/agent-screen.js`
  - `src/shared/agent-screen-client.js` (`createAgentScreenClient`)
  - `src/worlds-lobby.js` (`bootLobby`)
  - `src/play/arena-world.js` (`ArenaWorld`)
  - `workers/agent-screen-pool/index.js` (on-demand Playwright caster pool)
  - `api/agent/watch-intent.js` (signals which agents to cast) + `api/agent/watch-wanted.js`
  - `api/pump/trending.js` (`GET /api/pump/trending` — Birdeye → pump.fun fallback)

## Data flow (source → transform → render)
1. **Source:** the Playwright caster (`workers/agent-screen-pool`) opens the 3D world route (the `worlds-lobby` / `ArenaWorld` scene) in a real headless browser and drives the avatar along a tour path; commentary context comes from `GET /api/pump/trending`.
2. **Transform:** the caster captures screenshots of the first-person walkthrough at the pool's frame cadence; trending coins are normalized into short commentary lines (`{ symbol, rank, where: 'lobby'|'arena' }`).
3. **Transport:** the caster pushes frames + narration to `POST /api/agent-screen-push` (`type: 'screenshot'` for the canvas frame, `type: 'analysis'` for commentary), authenticating with the pool's `SCREEN_WORKER_SECRET`. Viewers subscribe over `GET /api/agent-screen-stream`; a viewer watching a card pings `POST /api/agent/watch-intent` so the pool keeps the tour cast.
4. **Render:** the screenshot frames paint the live screen canvas (`src/agent-screen.js` / the card canvas in `src/agents-live.js`); commentary appears as `analysis` lines in the activity log.

## Build spec
1. Add a tour mode to the caster (`workers/agent-screen-pool/index.js`): when an agent is configured for "world tour", navigate Playwright to the 3D world route, wait for `bootLobby` / `ArenaWorld` to signal ready, then drive the avatar along a fixed waypoint loop (lobby → portals → arena → back), capturing frames at the existing cadence.
2. Expose a ready/hook in `src/worlds-lobby.js` and `src/play/arena-world.js` so the caster can detect scene-loaded and request waypoint moves deterministically (a small `window.__tour` API: `ready()`, `goTo(waypoint)`) — drive the real camera/avatar, no faked motion.
3. On each waypoint, fetch `GET /api/pump/trending`, pick the top trending entries, and `screenPush` a commentary line tied to the current location ("In the arena — top of the feed right now: …"). Throttle trending fetches (cache ~20s) to respect rate limits.
4. In `src/agents-live.js`, ensure tour cards render the `screenshot` frames on the card canvas and the latest commentary in `.al-card-action`; keep the existing activity-terminal fallback when frames go stale.
5. In `src/agent-screen.js`, the screenshot frames already paint the hero canvas — add a subtle "TOUR" badge + current-waypoint label overlay (from the commentary sidecar) with hover to reveal the trending list.
6. Wire `watch-intent` pinging from the tour card/panel (already the pattern in `agents-live.js`) so the pool spins the caster up on demand and tears it down when nobody watches.

## Files to create / modify
- `workers/agent-screen-pool/index.js` — tour navigation mode (waypoint loop, frame capture) (modify).
- `src/worlds-lobby.js` — `window.__tour` ready/goTo hook driving the real camera (modify).
- `src/play/arena-world.js` — same ready/goTo hook for the arena scene (modify).
- `src/agent-screen.js` — TOUR badge + waypoint/trending overlay (modify).
- `src/agents-live.js` — render tour screenshots + commentary on the card (modify, if not already generic).
- `pages/agent-screen.html` — overlay markup for the tour badge (modify).
- `tests/tour-commentary.test.js` — unit test for the pure trending→commentary-line mapping (create).

## Real integrations (no mocks, ever)
- 3D worlds: real `worlds-lobby` / `ArenaWorld` scenes driven in a real Playwright browser by `workers/agent-screen-pool`.
- `GET /api/pump/trending` — real trending feed (Birdeye → pump.fun fallback).
- Transport: `api/agent-screen-push.js` (pool worker via `SCREEN_WORKER_SECRET`) + `api/agent-screen-stream.js`.
- On-demand casting: `api/agent/watch-intent.js` + `api/agent/watch-wanted.js`.
- Credentials: `SCREEN_WORKER_SECRET` (≥16 chars, gates the pool push), Birdeye key for trending, pool browser config. Locate in `.env` / `vercel env`; if missing, ask once then proceed.

## Every state designed
- **Loading:** card canvas shows a skeleton + "spinning up the tour…" while the pool launches the browser and the scene loads.
- **Empty:** if no one is watching, the activity-terminal fallback explains "Tour idle — click Watch to send the guide back into the world." (the watch-intent re-spins the caster).
- **Error:** scene fails to load → the caster reports "world unavailable, retrying" and falls back to the activity terminal; trending feed down → commentary continues from the worlds without market lines (never silent).
- **Populated:** the hero state — first-person walkthrough frames + location-aware commentary.
- **Overflow:** 0 trending coins (tour continues, commentary on the world only), 1 (single mention), 1000 (top-N only); very long symbols truncate in the overlay; frame staleness > 6s falls back to the terminal as the wall already does.

## Definition of done
- [ ] Reachable from `/agents-live` and `/agent-screen` via real navigation; watch-intent spins the caster.
- [ ] Real Playwright frames of the real 3D world; real trending data in commentary (network tab).
- [ ] Hover / active / focus states on the Watch button, TOUR badge, and trending overlay.
- [ ] All five states implemented.
- [ ] No console errors or warnings from this code.
- [ ] `npm test` passes; `tests/tour-commentary.test.js` added for the pure mapping.
- [ ] Verified live in a browser against `npm run dev` (port 3000): the walkthrough streams and commentary references real trending coins.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag: `feature`) — e.g. "World Tour: an agent now walks you through the $THREE 3D worlds live, commentating what's trending." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. $THREE is the only coin the tour *promotes*. The trending commentary is generic launch-feed plumbing rendering runtime coins from the feed — describe them factually, never recommend, name as a buy, or hardcode any non-$THREE mint. The hosted world the tour markets is $THREE's.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. The walkthrough is a real browser driving the real scene; waypoint motion moves the real camera.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
