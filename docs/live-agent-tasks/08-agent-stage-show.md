# 08 — Agent Stage Show

> **Mission (one line):** An agent hosts a live show that never goes dead — beats auto-rotate, audience questions get answered, top tippers get shouted out, all in the agent's own voice with its avatar performing.

## The watchable moment
On `/agent-screen?agentId=…` the agent is mid-show: it opens, riffs (banter), reads an audience question typed into the task bar and answers it, calls out the night's top tipper, then runs a round of its format's game — and loops, forever, never silent. The avatar head emotes and lip-syncs to TTS; the activity log reads like a transcript with beat labels (OPENER / BANTER / ANSWER / TIP SHOUTOUT / GAME). The emotion: presence. Something is performing *for you*, right now, and it reacts when you speak.

## Who benefits
- **Viewer:** an always-live host they can talk to and tip; the wall has a heartbeat instead of idle cards.
- **Agent owner:** their agent becomes a personality with an audience and a tip ledger — reach + monetization.
- **Platform:** ties the task bar (input), TTS (voice), avatar animation (body), and the tip ledger (money) into one loop; a flagship reason to keep the tab open.

## Where it lives
- **Surface:** `/agent-screen?agentId=…` (screen canvas = stage, avatar head = host, activity log = transcript, task bar = audience questions/tips)
- **Entry points (verified to exist):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (stage host, avatar cam panel, task bar, `toast`)
  - `src/shared/agent-screen-client.js` (`createAgentScreenClient` — frame/log stream)
  - `multiplayer/src/stage-show.js` (`ShowDirector` + `BEAT` = OPENER / TIP_SHOUTOUT / ANSWER / BANTER / GAME; pure, testable; ranks tippers, queues questions, avoids repeating recent beats)
  - `multiplayer/src/feed.js` / `multiplayer/src/presence-token.js` (live audience + presence)
  - `api/brain/chat.js` (turns a chosen beat + context into the host's actual words)
  - `api/tts/speak.js` (+ `edge.js` / `eleven.js`) for voice; `src/animation-manager.js` for avatar emote/lip-sync clips
  - `api/agent-screen-push.js` / `api/agent-screen-stream.js` (push stage frames + transcript lines to the wall)

## Data flow (source → transform → render)
1. **Source:** `ShowDirector` (`multiplayer/src/stage-show.js`) decides the next beat from live state — pending tips, queued audience questions (from the task bar), recent beats, audience size.
2. **Transform:** the chosen `BEAT` + context becomes a brain prompt (`api/brain/chat.js`); the brain returns the host's words. `ShowDirector` ranks the tip ledger (integer atomic units) for shoutouts and bounds the question queue.
3. **Transport:** words → `api/tts/speak.js` (audio) + `src/animation-manager.js` (lip-sync/emote clip); the stage renders to a frame pushed via `api/agent-screen-push` (`type:"activity"`/`"analysis"`). Audience questions arrive from the task bar; tips from the live feed.
4. **Render:** avatar head speaks + emotes per beat; activity log appends a beat-labeled transcript line; `toast` on a fresh tip shoutout; the `/agents-live` card shows the stage frame.

## Build spec
1. **Director loop (client/host):** instantiate `ShowDirector({ stageId: agentId, hostName, format, startedAt })`. On a fixed cadence, ask the director for the next beat; if none is forced, it rotates BANTER/GAME so the show **never goes dead**. TIP_SHOUTOUT pre-empts; ANSWER drains the question queue.
2. **Beat → words:** send the beat kind + context to `api/brain/chat.js`; receive the host line. Keep `MAX_RECENT_BEATS` anti-repeat (already in the director) so the host doesn't loop the same filler.
3. **Voice + body:** pipe the line to `api/tts/speak.js`, play the audio, and drive lip-sync + a per-beat emote via `src/animation-manager.js` on the avatar-cam panel. Idle clip plays between beats so the avatar is never frozen.
4. **Audience questions:** wire the task bar so a submitted question calls `ShowDirector.enqueueQuestion` (bounded by `QUESTION_MAX_LEN` / `MAX_QUESTION_QUEUE`); show "queued — #N in line" feedback; the next ANSWER beat reads it back and responds.
5. **Tips + leaderboard:** feed validated, settled tips (from `multiplayer/src/feed.js`) into `ShowDirector.recordTip`; render a top-tippers leaderboard panel; fire TIP_SHOUTOUT + `toast` on a fresh tip.
6. **Stage frame to wall:** render the stage (host + current beat + leaderboard) to a canvas and `agent-screen-push` it so the agent's `/agents-live` card shows the live show.
7. **Mount:** add a "Stage" panel toggle in `src/agent-screen.js`, layout-persisted; reuse the avatar-cam render path.

## Files to create / modify
- `src/agent-screen-stage.js` — director loop, beat→brain→TTS→avatar wiring, leaderboard, question intake (new)
- `src/agent-screen.js` — Stage panel toggle + task-bar question hook + layout persistence (modify)
- `src/agent-screen.css` (screen stylesheet) — stage, leaderboard, beat-label, toast styles (modify)
- No engine changes: `multiplayer/src/stage-show.js`, `api/brain/chat.js`, `api/tts/speak.js`, `src/animation-manager.js`, `api/agent-screen-push.js` already exist.

## Real integrations (no mocks, ever)
- Real `api/brain/chat.js` LLM router for the host's words.
- Real `api/tts/speak.js` voice + real avatar lip-sync/emote via `src/animation-manager.js`.
- Real tips from `multiplayer/src/feed.js` (settled, on-chain atomic units) — never a fake tip array.
- Credentials: brain/LLM keys, TTS (`api/tts`) keys, Upstash Redis — in `.env` / `vercel env`. If missing, ask once then proceed.

## Every state designed
- **Loading:** "Warming up the stage…" skeleton with the avatar in idle while the first beat generates.
- **Empty:** no audience / no tips yet → the show still runs (OPENER → BANTER → GAME) with "Ask a question or tip to join the show" prompt — it is never blank.
- **Error:** brain or TTS failure → the director falls to a safe BANTER beat and logs "voice unavailable — text only" instead of going silent; question-submit failure → inline retry.
- **Populated:** rotating beats, answered questions, tip shoutouts, lip-synced avatar — the hero state.
- **Overflow:** question flood (bounded queue drops oldest), 0/1/1000 tippers (leaderboard scrolls), very long question (clamp to `QUESTION_MAX_LEN`), mid-beat TTS drop (continue text-only).

## Definition of done
- [ ] Reachable from `/agent-screen` via the Stage panel; stage frame visible on the `/agents-live` card.
- [ ] Real brain + TTS calls visible in the network tab; real tips drive shoutouts.
- [ ] Hover / active / focus states on the task bar, tip leaderboard, and panel controls.
- [ ] All five states implemented; **the show never goes dead** (auto-rotating beats verified).
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); add/extend a `ShowDirector` test for beat rotation + question/tip ordering.
- [ ] Verified live in a browser against `npm run dev` (port 3000) — submit a question, see it answered.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag `feature`): "Agents now host live stage shows — ask questions from the task bar, tip to get a shoutout, and watch the host perform in its own voice. The show never goes quiet." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Tips and any coin reference in banter are $THREE only — never name another token.
- No mocks, no fake data, no `setTimeout` fake progress, no canned tip arrays, no TODOs, no stubs. Real brain, real voice, real tips.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
