# 22 — Ambient World DJ (the calm channel)

> **Mission (one line):** On `/agent-screen`, the agent stops trading and starts hosting — curating a living 3D world with a day/night cycle, wandering NPCs, and a calm spoken narration, so the screen becomes the one channel you leave open all day.

## The watchable moment
The stage isn't a dashboard — it's a place. A low-poly biome breathes under a moving sun; the light warms toward golden hour, then cools to dusk and a starfield. NPCs wander their zones, idle by props, drift between districts. In the corner the agent's avatar head glances around like a host, and a soft line scrolls in the log — "Sun's setting over the plaza. Quiet shift on the wall tonight." With audio on, that line is spoken in the agent's voice over an ambient bed. It's the opposite of the trading desk: nothing urgent, everything alive, impossible to stop watching.

## Who benefits
- **Viewer:** A calm, always-on scene to keep open — ambient company, not information overload. The "lo-fi beats" of the agent wall.
- **Agent owner:** Gives their agent a 24/7 watchable presence even when it isn't trading; personality and voice make it memorable.
- **Platform:** Proves the screen surface is a stage, not just a dashboard — and reuses the entire `src/game/` world engine, linking the live wall to the worlds product.

## Where it lives
- **Surface:** `/agent-screen?agentId=…` (primary stage, an alternate "Ambient" mode); a card on `/agents-live` can opt into the ambient render as its live feed.
- **Entry points (verified to exist):**
  - `src/agent-screen.js` — the stage, panel system, avatar cam, activity log, Zen mode
  - `pages/agent-screen.html` — stage container + controls
  - `src/game/world-env.js` — `seedFromString`, biome archetypes, sun/light rig, `update(dt)`
  - `src/game/world-zones.js` — `ZONES`, `SPAWN_POINTS`, `zoneAt`, `pickSpawn`, `clampToBounds`
  - `src/game/world-objects.js` — `WorldObjects`, `PROP_CATALOG`, prop placement
  - `src/game/npc/ambient-life.js` — `AmbientLife` (wandering NPC behavior)
  - `src/game/npc/world-life.js`, `src/game/npc/npc.js` — NPC bodies + movement
  - `api/tts/speak.js` — real TTS (NVIDIA Magpie → OpenAI backstop)
  - `api/agent-screen-push.js` / `api/agent-screen-stream.js` — narration as `log` entries

## Data flow (source → transform → render)
1. **Source:** The agent's identity seeds the world: `seedFromString(agentId or coin mint)` picks the biome from `world-env.js`. Real time-of-day comes from a deterministic clock derived from `Date.now()` scaled to a configurable cycle length (default 8 real-minutes per day) so all viewers of the same agent see the same sky.
2. **Transform:** A lightweight "DJ script" generator turns world events (sunrise, golden hour, dusk, an NPC reaching a landmark, a zone getting "busy") into short host lines. Lines are templated from the world state — never random filler — and rate-limited to one every ~25–40s so it stays calm.
3. **Transport:** Each host line is pushed as a real activity entry via `POST /api/agent-screen-push` (`type: 'activity'`) so it appears in the log AND is replayable to late joiners through `api/agent-screen-stream` `log` backfill. With audio enabled, the same text is sent to `POST /api/tts/speak` and played through the Web Audio path.
4. **Render:** A new client module mounts the `src/game/` world into the `/agent-screen` stage canvas (Three.js scene + renderer already imported on the page), ticks `worldEnv.update(dt)` + `ambientLife.update(dt)` in the render loop, drives the sun by the deterministic clock, and renders the avatar head cam as the "host" (existing avatar-cam panel).

## Build spec
1. **`src/agent-screen-world.js` (new):** Export `createAmbientWorld({ agentId, seed, container })`. Build a `Scene`, `WebGLRenderer`, `PerspectiveCamera`; call into `world-env.js` to create the biome group from `seedFromString(seed)`; instantiate `WorldObjects` for props and `AmbientLife` for NPCs using `world-zones.js` spawn points. Return `{ start, stop, setTimeScale, getState }`. Geometry is shared/cloned per the world-env doctrine — cheap enough to run beside the avatar cam.
2. **Deterministic day/night:** Add `worldClock(now, cycleMs)` returning a `0..1` phase. Map phase → sun elevation/azimuth + sky/fog interpolation by reusing the biome's `sun`/`sky`/`fog` fields. Drive `world-env`'s light rig each frame from the phase (no `Math.random` in the layout path — matches `world-env.js` seeded design). Same agent + same wall-clock = same sky for every viewer.
3. **`src/agent-screen-dj.js` (new):** A `DjScript` that observes world state (`getState()` exposes phase, active zone populations, recent NPC arrivals) and emits host lines from a template set keyed to events: `sunrise`, `goldenHour`, `dusk`, `night`, `zoneBusy(zoneName)`, `npcArrived(name, landmark)`, `idleAmbiance`. Enforce a min-gap timer (configurable `DJ_MIN_GAP_MS`, default 28000). Each emitted line returns `{ text, type, mood }`.
4. **Narration wiring (`src/agent-screen.js`):** Add an "Ambient" stage mode toggle (alongside the existing live/zen modes). When active: start the world, start the DJ loop, and for each line POST to `/api/agent-screen-push` so it lands in the log + stream. Gate behind the same agent ownership/JWT used by other push calls (the page already manages the agent context).
5. **TTS soundscape (opt-in):** Add an audio toggle (default OFF — calm, respects autoplay policy and requires a user gesture). When on, send each host line to `/api/tts/speak`, decode via the existing Web Audio path, duck under a soft ambient pad. Drive the avatar's visemes from the analyser exactly as the existing lipsync surfaces do (the TTS endpoint header already describes the bytes for `decodeAudioData`).
6. **Avatar as host:** Reuse the existing avatar-cam panel; when in Ambient mode, add subtle idle look-around using the `AnimationManager` already imported in `src/agent-screen.js`. No new rig list — drives the canonical clips per CLAUDE.md.
7. **`/agents-live` opt-in (optional, `src/agents-live.js`):** Allow an agent flagged `ambient` to render the world module as its card feed instead of the activity terminal, at a low frame budget — same `start/stop` lifecycle as casters, torn down when scrolled away.
8. **`pages/agent-screen.html` — controls + styles:** Add the Ambient mode button, audio toggle, and a tiny "time of day" readout (sunrise/day/dusk/night) styled with existing design tokens. Reduced-motion: hold the clock at midday and disable look-around.

## Files to create / modify
- `src/agent-screen-world.js` — new: mounts the `src/game/` world into the stage with a deterministic day/night clock.
- `src/agent-screen-dj.js` — new: world-state → host narration script with calm pacing.
- `src/agent-screen.js` — Ambient stage mode, narration push, TTS soundscape, host avatar idle.
- `pages/agent-screen.html` — Ambient mode + audio toggles, time-of-day readout, styles.
- `src/agents-live.js` — (optional) ambient-flagged card feed using the same world module.

## Real integrations (no mocks, ever)
- The real `src/game/` world engine: `world-env.js`, `world-zones.js`, `world-objects.js`, `npc/ambient-life.js`, `npc/world-life.js`.
- Real TTS: `api/tts/speak.js` (NVIDIA Magpie free lane → OpenAI backstop). No synthesized/fake audio.
- Real narration transport: `api/agent-screen-push.js` + `api/agent-screen-stream.js`.
- Credentials: `NVIDIA_API_KEY` (TTS), agent JWT for push. Locate in `.env` / `vercel env`. Missing TTS key → silent fallback to text-only narration (no audio), never a fake voice.

## Every state designed
- **Loading:** Stage shows a skeleton sky gradient (from the biome's `sky` palette) while the world group builds — never a blank canvas or spinner.
- **Empty:** No NPCs spawned yet → the biome + sun still render and the DJ emits `idleAmbiance` lines ("Quiet out here right now — just the wind through the plaza").
- **Error:** WebGL unavailable → fall back to the standard activity stage with a one-line notice; TTS error → text-only narration continues. Never a black stage.
- **Populated:** Full biome, moving sun, wandering NPCs, periodic host lines (spoken if audio on) — the hero state.
- **Overflow:** Long agent/NPC names truncated; viewers across timezones all see the same deterministic sky; tab backgrounded → pause the render loop + DJ via the existing `visibilitychange` handling; 1000 cards on the wall → ambient render only for on-screen, low-budget cards.

## Definition of done
- [ ] Reachable: `/agent-screen?agentId=…` → Ambient mode toggle; world renders.
- [ ] Real narration POSTs visible in the network tab; lines appear in the log and replay to late joiners via the stream backfill.
- [ ] Audio toggle gates real `/api/tts/speak` calls; visemes drive the avatar.
- [ ] Hover/active/focus on Ambient toggle, audio toggle, time-of-day readout.
- [ ] All five states implemented.
- [ ] No console errors/warnings; render loop + audio context torn down on mode exit and `visibilitychange`.
- [ ] Existing tests pass (`npm test`); add a unit test for `worldClock(now, cycleMs)` phase mapping and the DJ min-gap pacing.
- [ ] Verified live in a browser against `npm run dev` (port 3000), including a full day/night cycle at an accelerated time scale.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags: `feature`) — e.g. "Agent screens now have an Ambient mode: a living 3D world with day/night, wandering life, and your agent narrating as host (optional voice)." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another. The world is seeded by agent id / runtime mint only — narration must never promote a non-$THREE token.
- No mocks, no fake data, no fake voice, no `setTimeout` fake progress, no TODOs, no stubs.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
