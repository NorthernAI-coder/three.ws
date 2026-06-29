# 19 — Cinematic Activity Feed

> **Mission (one line):** Turn the 24/7 "dark agent" activity terminal into cinema — typed, color-graded, severity-aware narration with smooth beats and a platform-wide ticker — so an agent that isn't even rendering pixels is still impossible to stop watching.

## The watchable moment
A card on `/agents-live` whose live screen has gone dark falls back not to a dull log dump but to a **cinematic feed**: each `agent_actions` row streams in as a typed line with action-type iconography, a color grade, and a severity glow (a failed defense pulses amber, a graduation flares gold). Related actions group into **beats** ("Defended floor ×3 — held"). Lines enter and exit with intention; a thin **platform-wide ticker** scrolls site-wide events underneath. The emotion is **momentum** — even an idle agent feels alive, like a terminal in a film.

## Who benefits
- **Viewer:** never hits a blank or boring card — every agent is watchable, dark or live, which keeps eyes on the wall.
- **Agent owner:** their agent's real work reads as a polished broadcast, not raw logs — value with zero extra effort.
- **Platform:** the fallback becomes a feature; the site-wide ticker (via `api/feed-stream.js`) cross-links activity across all agents, raising the floor on every card.

## Where it lives
- **Surface:** `/agents-live` card fallback | `/agent-screen?agentId=…` activity log | both
- **Entry points (verify these exist before editing):**
  - `pages/agents-live.html` / `src/agents-live.js` (already renders the activity terminal onto the card canvas; `FRAME_STALE_MS` fallback; subscribes `agent-screen-stream`)
  - `pages/agent-screen.html` / `src/agent-screen.js` (Activity Log panel)
  - `api/agent-screen-stream.js` (`mapRow`: `{ ts, activity, type }` from `agent_actions`; `ACTIVITY_REFRESH_MS`)
  - `api/feed-stream.js` (SSE platform-wide ticker; `feed:events` Redis list)

## Data flow (source → transform → render)
1. **Source:** real `agent_actions` rows over `api/agent-screen-stream.js` (per agent) and platform events over `api/feed-stream.js` (site-wide). No fabricated entries.
2. **Transform:** a **pure presentation module** (`src/activity-cinema.js`) maps each entry to `{ icon, colorToken, severity, label, group }` by `action_type`, coalesces consecutive same-type actions into a beat (with a count), and computes enter/exit timing. Severity derived from type/keywords (e.g. `*_fail|error` → high/amber, `graduate|win|launch` → celebratory/gold, default → normal). All of this is deterministic and unit-tested — no DOM, no network.
3. **Transport:** existing SSE (`agent-screen-stream` for the card/log, `feed-stream` for the ticker). No new endpoint.
4. **Render:** `src/agents-live.js` draws typed lines + icons + color grade onto the card canvas with smooth scroll; `src/agent-screen.js` renders the same model as DOM rows in the Activity Log; a slim ticker strip tails `feed-stream`.

## Build spec
1. **`src/activity-cinema.js`** (new, pure) — export `classify(entry)` → `{ icon, colorToken, severity, label }`, `coalesce(entries)` → grouped beats with counts, and `timeline(entry, prev)` → enter/exit timing. Icon + color tables keyed by `action_type` (cover trade/defend/recycle/graduate/launch/hire/memory/error/default). Uses existing design tokens; no DOM access.
2. **`src/agents-live.js`** — replace the plain terminal renderer with the cinema model: typed reveal per line (character-stepped to a real frame clock, not `setTimeout` fakery), icon glyph, color grade, severity glow, and beat-collapsing. Keep the existing `FRAME_STALE_MS` fallback and `agent-screen-stream` subscription.
3. **`src/agent-screen.js`** — render the Activity Log panel through `classify`/`coalesce`: icon + colored chip + severity ring per row, smooth enter/exit transitions (opacity + transform), auto-scroll with a "jump to latest" affordance when scrolled up.
4. **Ticker** — add a thin platform-wide ticker strip on `/agents-live` tailing `api/feed-stream.js`; clicking an event routes to its agent/coin where a link exists. Pause on hover, resume on leave.
5. **Reduced motion** — respect `prefers-reduced-motion`: instant reveal, no scroll animation, glows become static borders.
6. **Tests** — `tests/activity-cinema.test.js` covering `classify` (every action type → expected icon/color/severity), `coalesce` (grouping + counts, boundary changes), and `timeline`. Pure, fast, deterministic.

## Files to create / modify
- `src/activity-cinema.js` — pure presentation logic (classify / coalesce / timeline).
- `src/agents-live.js` — cinematic card terminal + platform ticker.
- `src/agent-screen.js` — cinematic Activity Log rendering.
- `tests/activity-cinema.test.js` — unit tests for all pure logic.

## Real integrations (no mocks, ever)
- `api/agent-screen-stream.js` — real `agent_actions` SSE.
- `api/feed-stream.js` — real platform-wide `feed:events` SSE.
- Credentials: Redis (Upstash) + DB already configured for these endpoints. If missing, the card degrades to the static log (still real data).

## Every state designed
- **Loading:** skeleton lines (shimmer) on the card/log until the first SSE frame; ticker shows a thin pulsing placeholder.
- **Empty:** no recorded actions → a designed standby card: "Standing by — no actions yet. This agent will narrate here the moment it acts," not a blank void (improves the current `> standing by` line).
- **Error:** stream disconnect → an inline "reconnecting…" chip with auto-retry; a malformed row is classified as `default` and never crashes the renderer.
- **Populated:** the hero — typed, graded, beat-grouped narration with smooth motion + live ticker.
- **Overflow:** 0 rows (empty), 1 row, 1000 rows/min (cap visible lines, collapse beats, drop oldest), very long summaries (truncate with ellipsis + full text in title), reduced-motion users (instant, static).

## Definition of done
- [ ] Reachable on both surfaces via real navigation (card fallback + Activity Log).
- [ ] Real API calls visible in the network tab (`agent-screen-stream`, `feed-stream`), real rows rendered.
- [ ] Hover / active / focus states on ticker items, "jump to latest", and any controls.
- [ ] All five states above implemented.
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); `tests/activity-cinema.test.js` added and green (pure presentation logic covered).
- [ ] Verified live in a browser against `npm run dev` (port 3000), including a deliberately dark agent.
- [ ] `git diff` self-reviewed; every line justified; `prefers-reduced-motion` honored.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags: `improvement`, `feature`), e.g. "The live wall's activity feed got cinematic — typed narration, action icons, severity colors, and a platform-wide ticker, so even an idle agent is worth watching." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another. Coin mentions in entries come from real `agent_actions`/feed rows at runtime — render them, but never hardcode, market, or recommend a non-$THREE mint in source or copy.
- No mocks, no fake data, no fabricated entries, no `setTimeout` fake progress (typing is driven by a real frame clock), no TODOs, no stubs.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
