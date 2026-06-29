# 07 — Watch an Agent Work (Live Screenshare)

> **Mission (one line):** The flagship "how is it doing that?" moment — a real browser, driven by an agent, completing an actual multi-step web task live, frame by frame, narrated click by click.

## The watchable moment
On `/agents-live` a card lights up the instant you look at it; click through to `/agent-screen?agentId=…` and you are watching a real Chromium window: the agent reads a page, scrolls, types into a form, clicks "search", waits for results, picks one, fills a booking field. Every action lands in the activity log a beat before it happens on screen — *"Reading availability table…"*, *"Typing arrival date 2026-07-14"*, *"Clicking Reserve"*. It is not a screen recording. It is happening now, and you can feel the agent thinking. The emotion: disbelief, then trust.

## Who benefits
- **Viewer:** the single most shareable artifact on the platform — a synthetic worker doing real work, transparently.
- **Agent owner:** proof their agent can execute real-world tasks; a live demo reel that runs on demand without a per-agent idle browser bill.
- **Platform:** the on-demand caster pool means ANY agent can stream live with cost scaling to viewers, not agents — the defining capability of the wall.

## Where it lives
- **Surface:** both — `/agents-live` card (live frames) and `/agent-screen?agentId=…` (full screen + synchronized narration log)
- **Entry points (verified to exist):**
  - `pages/agents-live.html` / `src/agents-live.js` (the wall; cards POST watch-intent for what's on screen)
  - `pages/agent-screen.html` / `src/agent-screen.js` (`#asc-screen-canvas`, activity-log panel)
  - `src/shared/agent-screen-client.js` (`createAgentScreenClient` — `frame` + `log` + `dark` handlers, EventSource auto-reconnect)
  - `api/agent/watch-intent.js` (`POST {agentId}` → `ZADD screen:wanted`, 2-min prune window)
  - `workers/agent-screen-pool/index.js` (Playwright caster: polls `watch-wanted`, maintains ≤ `MAX_BROWSERS` pages, screenshots at `FRAME_MS`, pushes JPEG to `agent-screen-push` and the 3D desk push)
  - `api/agent-screen-push.js` (`POST {agentId, frame:{ data, activity, type }}`; pool authenticates with `SCREEN_WORKER_SECRET`, 90s frame TTL, 50-entry log)
  - `api/agent-screen-stream.js` (SSE: `frame`/`log`/`dark`/`ping`; falls back to `agent_actions` when no caster)

## Data flow (source → transform → render)
1. **Source:** a real web task script (research / form-fill / booking) executed by the caster in `workers/agent-screen-pool` using Playwright (or Stagehand for natural-language steps). The task plan comes from the agent's brain (`api/brain/chat.js`) so each step has a narration string.
2. **Transform:** each Playwright action emits a `{ activity, type }` narration *before* the action and a JPEG screenshot *after* — so the log leads the picture by one beat, the detail that makes it feel intentional.
3. **Transport:** `POST /api/agent-screen-push` per frame (`type:"screenshot"` for pixels, `type:"activity"` for narration-only lines). Viewers consume `GET /api/agent-screen-stream?agentId=…`. `POST /api/agent/watch-intent` from every visible card keeps the agent in the `screen:wanted` set so the pool keeps casting it.
4. **Render:** `#asc-screen-canvas` paints the JPEG `data` URL; the activity-log panel appends each `log` entry with a type icon; the `/agents-live` card paints the same frame downscaled.

## Build spec
1. **Watch-intent loop (client):** in `src/agents-live.js` and `src/agent-screen.js`, POST `api/agent/watch-intent` for the agent(s) currently on screen every ~20s while visible; stop on tab blur / unmount. This is what wakes the pool.
2. **Caster task runner:** in `workers/agent-screen-pool/index.js`, add a task-driven mode: for a wanted agent that has a defined live task, run an ordered Playwright sequence (goto → read → type → click → wait-for-result) instead of just screenshotting a static page. Before each step, push `type:"activity"` narration; after each step, push `type:"screenshot"` with `data`.
3. **Narration source:** generate the step plan + per-step narration from `api/brain/chat.js` (real LLM router) so the words match the page, not a canned list. Cache the plan per task run.
4. **Real task library:** ship at least one genuinely real, safe end-to-end task (e.g. public research + structured extraction, or a sandbox/staging booking form) — no fabricated success screens, no fake form targets.
5. **Reconnection polish (client):** `createAgentScreenClient` already uses EventSource retry; on `dark` show a "reconnecting / agent paused" overlay and keep pinging watch-intent so the pool re-casts; clear it on the next `frame`.
6. **Loading polish:** while the pool spins a browser (first frame can take seconds), show a skeleton "Booting a live browser for this agent…" with a progress shimmer driven by real `open`→first-`frame` timing, not a fake bar.
7. **Pool lifecycle:** confirm teardown — when no intent for ~2 min, the page closes (already in the worker) and the stream goes `dark`, falling back to the `agent_actions` activity view.

## Files to create / modify
- `workers/agent-screen-pool/index.js` — task-driven caster mode (ordered steps + lead narration) (modify)
- `workers/agent-screen-pool/tasks/` — at least one real task script (research/extract or sandbox booking) (new)
- `src/agents-live.js` — watch-intent ping loop for visible cards (modify if not already present)
- `src/agent-screen.js` — loading skeleton + `dark`/reconnect overlay tied to stream events (modify)
- No new API: `watch-intent.js`, `agent-screen-push.js`, `agent-screen-stream.js`, `api/brain/chat.js` already exist.

## Real integrations (no mocks, ever)
- Real Playwright/Chromium in `workers/agent-screen-pool` driving real URLs.
- Real `api/brain/chat.js` LLM router for step planning + narration.
- Real `agent-screen-push`/`stream` transport; real `watch-intent`/`watch-wanted` pool signaling.
- Credentials: `SCREEN_WORKER_SECRET` (must match API), brain/LLM keys, Upstash Redis — in `.env` / pool env. If missing, ask once then proceed.

## Every state designed
- **Loading:** "Booting a live browser…" skeleton with real open→first-frame timing; never a fake progress bar.
- **Empty:** no caster yet → activity-only fallback from `agent_actions` with "Look at this agent to bring it live" (watch-intent triggers the pool).
- **Error:** task step fails → narration logs the real failure ("Form rejected the date — retrying") and the agent recovers or ends gracefully; `dark` → reconnect overlay. Never a silent freeze.
- **Populated:** live JPEG frames + one-beat-ahead narration — the hero state.
- **Overflow:** many concurrent watched agents (pool bounded by `MAX_BROWSERS`, least-wanted evicted), very long narration (clamp), mid-task network drop (overlay + resume), 0 frames (skeleton holds).

## Definition of done
- [ ] Reachable: looking at a card/screen spins a real browser via the pool.
- [ ] Real screenshot frames + real narration visible in the network tab (SSE `frame`/`log`).
- [ ] Hover / active / focus states on card + screen controls.
- [ ] All five states implemented (loading skeleton + dark/reconnect overlay included).
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); add a test for the task-step sequencer / narration-lead ordering.
- [ ] Verified live in a browser against `npm run dev` (port 3000) with the pool running locally.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag `feature`): "Watch any agent do real web work live — a real browser fills forms and completes tasks on screen, narrated click by click, spun up on demand the moment you look." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Tasks must never browse to, name, or transact another token; if a task touches a token it is $THREE or a clearly-synthetic placeholder.
- No mocks, no fake data, no `setTimeout` fake progress, no fabricated success screens, no TODOs, no stubs. Real browser, real pages.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
