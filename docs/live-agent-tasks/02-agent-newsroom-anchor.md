# 02 — Agent Newsroom Anchor

> **Mission (one line):** An agent becomes a live market-news anchor — pulling real intel, scripting a short broadcast, speaking it aloud while its 3D avatar lip-syncs, with headlines rendering as lower-third overlays.

## The watchable moment
On `/agent-screen?agentId=…` the agent sits as a broadcast anchor: the Avatar Cam head is talking — mouth actually moving to the words via Audio2Face visemes — while a lower-third overlay slides up with the headline ("aixbt: NEW NARRATIVE — restaking flows accelerating"). Audio plays in the viewer's browser. Every ~90 seconds the anchor refreshes with new intel and runs the next bulletin. It feels like a live financial channel that exists only because an autonomous agent is reading the market to you.

## Who benefits
- **Viewer:** a digestible, spoken market briefing from real intel feeds — no chart-reading required, ambient and watchable.
- **Agent owner:** their agent gains a recurring on-air persona that showcases its intelligence and voice, driving repeat watchers.
- **Platform:** binds the intel surfaces (aixbt, sentiment, pump snapshot), the brain LLM router, and the TTS/lipsync stack into one flagship demo of three.ws capabilities.

## Where it lives
- **Surface:** `/agent-screen?agentId=…` panel (the anchor desk); a card on `/agents-live` shows the current lower-third headline.
- **Entry points (verified to exist):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (Avatar Cam + overlay layer)
  - `src/shared/agent-screen-client.js` (`createAgentScreenClient`)
  - `mcp-server/src/tools/aixbt-intel.js` (`aixbt_intel` → `GET /api/aixbt/intel`)
  - `mcp-server/src/tools/sentiment-pulse.js` (`sentiment_pulse`)
  - `mcp-server/src/tools/pump-snapshot.js` (`pump_snapshot`)
  - `api/brain/chat.js` (`POST /api/brain/chat`, SSE, multi-LLM router)
  - `api/tts/speak.js` (`POST /api/tts/speak` — NVIDIA Magpie free lane → OpenAI backstop)
  - `api/a2f.js` + `packages/audio-mcp` `audio_to_face` (ARKit blendshape lipsync)
  - `src/animation-manager.js` (`playOnce('talking')`, additive gesture overlay)

## Data flow (source → transform → render)
1. **Source:** every cadence tick, the anchor loop fetches `GET /api/aixbt/intel` (via the `aixbt_intel` path), `sentiment_pulse`, and `pump_snapshot` for current market state.
2. **Transform:** the three feeds are merged into a compact briefing object, then `POST /api/brain/chat` scripts a tight 2–4 sentence anchor read (system prompt: "You are a market-news anchor. Plain language, no jargon, one headline + one line of context per item."). The script is split into a headline (lower-third) and the spoken body.
3. **Transport:** the anchor worker pushes each headline as `POST /api/agent-screen-push` `{ frame: { activity: headline, type: 'analysis' } }`; viewers subscribe over `GET /api/agent-screen-stream`. Audio + viseme track are produced client-side in `src/agent-screen.js` from the script text.
4. **Render:** lower-third overlay (CSS slide-up over the live screen), spoken audio from `/api/tts/speak`, and the Avatar Cam head driven by the `/api/a2f` ARKit blendshape track so the mouth matches the audio; `playOnce('talking')` runs as an additive gesture so the body stays alive while speaking.

## Build spec
1. Create `workers/agent-anchor/index.js` — a cadence loop (default 90s, env `ANCHOR_CADENCE_MS`) that calls the three intel sources, posts the merged brief to `/api/brain/chat`, collects the script, and `screenPush`es the headline as a `type: 'analysis'` frame. Model it on `workers/agent-sniper/screen-push.js` for the non-blocking push.
2. The anchor frame's `activity` carries the headline; a compact JSON sidecar (`script`, `ttl`) is embedded in the frame so the client can speak the body. Keep within the 320-char `ACTIVITY_MAX` for the headline; the spoken body is fetched client-side by the client re-requesting the script via a new `GET /api/agent/anchor-script?agentId=…` reading the last script from Redis (set by the worker alongside the frame).
3. In `src/agent-screen.js`, add an overlay layer: on a `type: 'analysis'` frame, slide a lower-third in `pages/agent-screen.html` (`#asc-lowerthird`) with the headline, fetch the spoken body, call `POST /api/tts/speak` for audio and `POST /api/a2f` for the viseme/blendshape track, play the audio, and drive `webcamAnimManager` blendshapes from the a2f track frame-by-frame.
4. Gate lipsync on `webcamAnimManager.supportsCanonicalClips()` / blendshape availability; if the rig has no ARKit morph targets, fall back to a jaw-bob driven by audio RMS so the head still "talks" (no frozen face).
5. In `src/agents-live.js`, render the latest `type: 'analysis'` headline as the card's `.al-card-action` so the wall shows what each anchor is reporting.
6. Add an "audio on/off" toggle (muted by default for the wall, prompts a one-tap unmute on `/agent-screen`) with hover/focus states, plus a `M` mute shortcut.

## Files to create / modify
- `workers/agent-anchor/index.js` — the cadence loop fetch → script → push (create).
- `workers/agent-anchor/screen-push.js` — non-blocking pusher mirroring the sniper's (create, or import the sniper's shared helper if extracted).
- `api/agent/anchor-script.js` — `GET` last anchor script from Redis for the client to speak (create).
- `src/agent-screen.js` — lower-third overlay, TTS playback, a2f-driven lipsync, mute toggle (modify).
- `pages/agent-screen.html` — `#asc-lowerthird` overlay + mute button markup (modify).
- `src/agents-live.js` — surface the current headline on the card (modify).
- `tests/anchor-brief.test.js` — unit test for the pure feed-merge → headline/body split (create).

## Real integrations (no mocks, ever)
- aixbt narrative intel (`GET /api/aixbt/intel`, key held server-side), `sentiment_pulse`, `pump_snapshot` — real market intel.
- `POST /api/brain/chat` — real multi-LLM router (Anthropic / OpenAI / Qwen / watsonx per `api/brain/chat.js`), SSE.
- `POST /api/tts/speak` — real NVIDIA NIM Magpie TTS (free lane) with OpenAI backstop.
- `POST /api/a2f` (`api/a2f.js`) — real NVIDIA Audio2Face-3D ARKit blendshape lipsync.
- Transport: `api/agent-screen-push.js` + `api/agent-screen-stream.js`.
- Credentials: `AIXBT_API_KEY`, `NVIDIA_API_KEY`, brain provider keys, `AGENT_JWT`/`AGENT_ID`. Locate in `.env` / `vercel env`; if missing, ask once then proceed.

## Every state designed
- **Loading:** lower-third shows a skeleton bar; Avatar Cam plays `idle` until the first script arrives.
- **Empty:** before the first bulletin, the overlay reads "On air shortly — pulling the latest market intel." so the viewer knows a broadcast is imminent.
- **Error:** if an intel feed is down, the anchor reports only the feeds that returned ("Sentiment offline — reading flow + narrative only") rather than going silent; TTS failure falls back to text-only lower-third with a visible "audio unavailable" note; a2f failure falls back to RMS jaw-bob.
- **Populated:** the hero state — talking head, lower-third headline, audio.
- **Overflow:** 0 intel items (graceful "quiet market" read), 1 item (single headline), many items (anchor scripts the top 2–3 only; rest summarized); very long headline truncates in the lower-third with a marquee on hover.

## Definition of done
- [ ] Reachable from `/agent-screen` (and the headline visible on `/agents-live`).
- [ ] Real intel, brain, TTS, and a2f calls visible in the network tab; real audio plays.
- [ ] Hover / active / focus states on the mute toggle and any controls.
- [ ] All five states implemented.
- [ ] No console errors or warnings from this code.
- [ ] `npm test` passes; `tests/anchor-brief.test.js` added for the pure feed-merge logic.
- [ ] Verified live in a browser against `npm run dev` (port 3000): audio plays, mouth moves to the words.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag: `feature`) — e.g. "Newsroom Anchor: agents now read the market to you on air, speaking real intel with a lip-synced avatar." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. The anchor reports market intel from runtime feeds (generic plumbing); never script, name, or recommend any non-$THREE mint. If a feed surfaces another token, summarize the narrative without promoting the token.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. Audio and lipsync are driven by real synthesized bytes.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
