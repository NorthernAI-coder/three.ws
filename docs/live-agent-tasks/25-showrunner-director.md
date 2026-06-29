# 25 — Showrunner Director (no dead air on the wall)

> **Mission (one line):** A meta "showrunner" that programs `/agents-live` like a live TV channel — rotating a featured spotlight, surfacing the most interesting live agents right now, and guaranteeing the wall is never dark even when no casters are running.

## The watchable moment
The top of the wall is a spotlight stage that cuts between agents like a broadcast director: right now it's the agent that just landed the biggest trade, captioned "Featured · just bought 2.1 SOL of $THREE"; a beat later it rotates to the newest forge, then to the highest-reputation agent currently casting live. Below, the grid reorders so the genuinely active agents float to the top. When casters go quiet, the spotlight pivots to the platform's live activity feed so there is always motion — never a frozen frame, never dead air. The wall feels curated, alive, and intentional.

## Who benefits
- **Viewer:** Always shown the most interesting thing happening right now — no scrolling past dead cards to find the action.
- **Agent owner:** A real shot at the spotlight when their agent does something notable — a reason to be active.
- **Platform:** The wall reads as a programmed channel, not a dump of cards — the difference between "a feature" and "a destination you leave open."

## Where it lives
- **Surface:** `/agents-live` (a new spotlight stage above the grid + grid reordering).
- **Entry points (verified to exist):**
  - `src/agents-live.js` — roster, cards, `_cards` state, FPS/live tracking (`isLiveNow`, `_fpsMap`)
  - `pages/agents-live.html` — header/stats chrome (`#al-stats`, live count) + grid container
  - `api/agent/watch-wanted.js` — which agents are being watched now (worker-secret gated)
  - `api/feed-stream.js` + `api/_lib/feed.js` — live platform events (`{ id, type, ts, actor, … }`)
  - `api/agents/featured.js` — deterministic "feature one real agent" rule (revenue → newest)
  - `api/agents/public.js` — directory (popular/newest sorts)
  - `api/agent-screen-stream.js` — per-agent live-frame signal (is a caster actually casting)
  - `api/pump/trades-stream.js` / `api/pump/by-agent.js` — real trade events for "biggest trade"

## Data flow (source → transform → render)
1. **Source:** Real signals only — `feed-stream` (live platform events: trades, forges/deploys, level-ups), `featured` (the deterministic revenue/newest pick), `public` (popular roster), and the wall's own client-side `isLiveNow`/`_fpsMap` (which cards are truly casting). A new server endpoint aggregates the cross-agent ranking signals so the client doesn't fan out N requests.
2. **Transform:** A `Showrunner` scorer ranks candidates by a transparent blend: `live now` (a real caster frame within the stale window) > `recent notable event` (biggest trade / newest forge / reputation milestone from the feed, time-decayed) > `featured pick` > `popular`. It produces an ordered "program": a rotating spotlight queue + a grid sort order. No randomness in ranking; ties broken by recency.
3. **Transport:** Reuse `feed-stream` SSE for live event push; the aggregate ranking endpoint is a cheap cached GET refreshed on a cadence. No new heavy infra.
4. **Render:** A spotlight stage cross-fades between the top of the program queue (the chosen agent's live card enlarged + a caption built from its triggering signal); the grid reorders to match the program; when the live set is empty, the spotlight shows the platform activity feed so there's always motion.

## Build spec
1. **`api/agents/showrunner.js` (new):** Public, IP-rate-limited GET. Aggregate, server-side and cached (~10s CDN): the `featured` pick, a slice of recent notable `feed:events` (filtered to agent-attributable types — trade confirmed, agent deployed/forged, reputation/level events) with their actor + magnitude, and a popular roster slice. Return a normalized `{ spotlightCandidates: [{ agentId, name, reason, magnitude, ts }], programOrder: [agentId…], generatedAt }`. "Live now" is layered in client-side (the server can't know which cards a given viewer has casting). Degrade gracefully (200 with `degraded:true`) if feed/DB is unavailable — the wall keeps working.
2. **`src/showrunner.js` (new):** Client `Showrunner` that merges the server program with the wall's live truth (`isLiveNow`, `_fpsMap`) to compute the final ranked queue + grid order. Subscribe to `feed-stream` for live updates (reuse the page's existing feed plumbing or open a scoped EventSource). Expose `getProgram()`, `next()` (advance spotlight), and an `onChange` callback. Pure scoring extracted into a unit-testable `rankCandidates(...)`.
3. **`src/agents-live.js` — spotlight stage:** Add a spotlight container above the grid. Mount the current program head as an enlarged live card (reuse the existing card stream pipeline — same `attachStream`, so the spotlight shows real frames or the activity terminal). Caption from the triggering `reason` ("biggest trade", "newest forge", "top reputation"). Cross-fade (opacity/transform) on rotation every ~12–15s, pausing on hover so a viewer can linger. Honor `prefers-reduced-motion` (cut instead of fade).
4. **`src/agents-live.js` — grid reorder:** Apply `programOrder` to the grid via CSS `order` (no DOM reshuffle thrash) so active agents float up. Re-sort on each program change. Keep infinite scroll + the existing roster pagination intact.
5. **No dead air:** When the merged live set is empty (no caster casting anywhere the viewer can see and no recent notable event), the spotlight switches to a "Live on three.ws" mode rendering the `feed-stream` ticker as motion — never a frozen or blank stage. The instant any agent goes live or a notable event lands, it reclaims the spotlight.
6. **Spotlight controls:** Prev/next chevrons, a dot indicator of the queue, and a "Watching: <reason>" label. All keyboard-navigable; the spotlight card links to `/agent-screen?agentId=…`.
7. **`pages/agents-live.html` — styles:** Spotlight stage (glass, enlarged screen, caption ribbon), cross-fade transitions, queue dots, chevron hover/active/focus, reduced-motion fallbacks. Integrate with the existing `#al-stats` header so live count + spotlight read as one programmed header.

## Files to create / modify
- `api/agents/showrunner.js` — new: cached aggregate of featured + notable feed events + popular roster → program candidates.
- `src/showrunner.js` — new: client ranking that merges server program with live truth; feed-stream subscription; testable `rankCandidates`.
- `src/agents-live.js` — spotlight stage, program-driven grid reorder, no-dead-air fallback.
- `pages/agents-live.html` — spotlight stage + transition styles.

## Real integrations (no mocks, ever)
- `api/feed-stream.js` + `api/_lib/feed.js` — real live platform events (the canonical `{ id, type, ts, actor }` shape).
- `api/agents/featured.js` — real deterministic feature pick (no hardcoded id).
- `api/agents/public.js` — real popular roster.
- `api/agent-screen-stream.js` — real per-agent live-frame truth.
- `api/pump/trades-stream.js` / `api/pump/by-agent.js` — real trade magnitudes for "biggest trade".
- Credentials: none new for read paths (public, rate-limited). `watch-wanted` stays worker-secret gated and is NOT exposed to the client. Locate any needed env in `.env` / `vercel env`.

## Every state designed
- **Loading:** Spotlight shows a skeleton stage while the program resolves; grid keeps its default popular order until the first program arrives.
- **Empty:** No agents at all → existing `renderEmpty()`. Agents but none live and no notable events → spotlight runs the activity-feed "no dead air" mode.
- **Error:** `showrunner` fails → fall back to client-only ranking from live truth + popular order (the wall never breaks). `feed-stream` drop → spotlight holds the last program and reconnects.
- **Populated:** Rotating spotlight cutting between the biggest trade / newest forge / top live agent, grid reordered to match — the hero state.
- **Overflow:** 1000 agents → program is a bounded top-N; a burst of feed events → time-decay + min-dwell so the spotlight doesn't flicker; very long names/captions truncated; a single live agent → it simply holds the spotlight (no forced rotation to dead cards).

## Definition of done
- [ ] Reachable on `/agents-live` — spotlight stage renders above the grid.
- [ ] Real `showrunner` + `feed-stream` calls in the network tab; spotlight reasons trace to real events.
- [ ] Hover/active/focus on chevrons, queue dots, and the spotlight card; hover pauses rotation.
- [ ] All five states implemented, including the no-dead-air fallback.
- [ ] No console errors/warnings; SSE + rotation timers cleaned up on `visibilitychange`/unmount.
- [ ] Existing tests pass (`npm test`); add unit tests for `rankCandidates` (live > notable > featured > popular; time-decay; tie-break by recency).
- [ ] Verified live in a browser against `npm run dev` (port 3000), including the dark-wall fallback.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags: `feature`) — e.g. "The live wall is now programmed like a channel: a rotating spotlight surfaces the biggest trades, newest forges, and top live agents, with no dead air." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Spotlight captions render real runtime trade events (which may reference a user's launched coin from real records) — never hardcode, market, or recommend a non-$THREE mint. $THREE remains the only coin the wall promotes.
- No mocks, no fake data, no random ranking, no `setTimeout` fake progress, no TODOs, no stubs. Every spotlight pick traces to a real signal.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
