# 13 — Live Q&A Concierge

> **Mission (one line):** Turn the half-wired task bar into a real conversation — a viewer types a question, the agent thinks, answers out loud in the activity log with its real voice and an avatar that reacts, and remembers the thread across the session.

## The watchable moment
On `/agent-screen?agentId=…` you type into the task bar — *"What does this agent do all day?"* — and within a beat the avatar head tilts to "thinking", a typing indicator pulses in the activity log, then the answer streams in token by token while the agent speaks it aloud in its own TTS voice, mouth/animation reacting. Ask a follow-up — *"and which of those made the most money?"* — and it answers in context, because it remembered the first exchange. It stops being a control panel and becomes a being you can talk to. The emotion: presence — the agent is *here*, listening, answering.

## Where it stands today (the half-wired part to fix)
The task bar already exists and is wired to a Redis **queue**: `pages/agent-screen.html` (`#asc-task-form`, `#asc-task-input`, `#asc-task-send`, `#asc-task-status`) → `src/agent-screen.js` submit handler → `POST /api/agent-task` → `agent:task:{agentId}` LIST for a worker to drain later. It also appends a `"Task queued"` line to the screen log. **What's missing:** there is no live *answer*. A question goes into a queue and nothing comes back on screen. This task makes the bar a real Q&A loop: question → brain → spoken answer in the log → remembered.

## Who benefits
- **Viewer:** can actually interrogate the agent and get a real, voiced answer — the difference between watching a TV and talking to a person.
- **Agent owner:** their agent becomes a live concierge / demo host that explains itself to visitors using its configured model and persona, no babysitting.
- **Platform:** the task bar becomes the universal input surface — the same loop powers Q&A here and richer tasks elsewhere; memory makes every agent feel continuous.

## Where it lives
- **Surface:** `/agent-screen?agentId=…` (task bar + activity log + avatar + TTS).
- **Entry points (verify these exist before editing):**
  - `pages/agent-screen.html` (`#asc-task-form`, `#asc-task-input`, `#asc-task-status`, `#asc-log`, avatar canvas)
  - `src/agent-screen.js` (existing submit handler that POSTs `/api/agent-task`; `addLogEntry()`; `mountAvatarWebcam()` with `AnimationManager`)
  - `api/agent-task.js` (existing queue; keep for async tasks)
  - `api/brain/chat.js` (SSE LLM router — body `{provider, messages, system, maxTokens}`; events `meta`/`first`/chunks/`done`/`error`)
  - `api/agent-memory.js` (GET fetch / POST upsert; owner-scoped) and `src/agent-memory.js` (`AgentMemory`: `add`, `query`, `recall`, `pull`)
  - `api/tts/speak.js` (`POST {text, voice, format, speed}` → audio bytes) — or `api/tts/edge.js` for keyless
  - `src/animation-manager.js` (`playOnce`, `crossfadeTo`, `playOverlay` for thinking/talking emotes)

## Data flow (source → transform → render)
1. **Source:** the viewer's typed question from `#asc-task-input`. Distinguish a **question** (answer live) from an **owner task** (queue via `api/agent-task`) — e.g. a question is the default for any visitor; an authenticated owner can still queue background tasks. Route questions to a new `api/agent-ask.js`.
2. **Transform:** `api/agent-ask.js` loads the agent's configured persona/model + recent session memory (`api/agent-memory.js` / `packages/agent-memory`), builds `system` + `messages` (prior Q&A turns + the new question), and calls `api/brain/chat.js` with the agent's configured `provider`. After the answer completes, it writes the exchange back to memory so follow-ups have context.
3. **Transport:** stream the answer over SSE (reuse the brain's stream, or fan it onto the screen log via `api/agent-screen-push` `type:"analysis"` lines so other watchers see it too). TTS audio fetched from `api/tts/speak` (or `edge`) for the final answer text.
4. **Render:** typing indicator + token-streamed answer in `#asc-log`; avatar plays a "thinking" emote on submit and a "talking" overlay while audio plays (`AnimationManager.playOverlay` / `crossfadeTo`), settling back to idle when done.

## Build spec
Concrete, ordered steps.
1. **New ask endpoint** — create `api/agent-ask.js`: `POST {agentId, question, sessionId}`. Loads agent persona + model (configured `provider`) and pulls recent memory for this `(agentId, sessionId)`. Builds the message list and proxies `api/brain/chat.js` as an SSE stream back to the caller. Rate-limit per IP (mirror `agent-task` limits). No owner auth required to *ask* (it's a public concierge); writing memory is keyed to the session, not the owner's private store.
2. **Session memory** — use `packages/agent-memory` / `api/agent-memory.js` to persist each turn under a session-scoped tag (e.g. `qa:{sessionId}`) with sensible salience + a TTL so the session is remembered but doesn't pollute the owner's long-term memory. On each ask, `query`/`recall` the last few turns to build context.
3. **Wire the task bar** — in `src/agent-screen.js`, branch the submit handler: viewer question → call `api/agent-ask.js` and stream the answer into `#asc-log` with a typing indicator; owner background task → keep the existing `api/agent-task` queue path. Generate/persist a `sessionId` (e.g. in `sessionStorage`) for memory continuity.
4. **Voice** — when the answer text is final, fetch TTS from `api/tts/speak` (configurable per-agent `voice`; fall back to `api/tts/edge` if no key) and play it; show a small speaker indicator in the log entry. Respect a mute toggle.
5. **Avatar reactions** — on submit, `AnimationManager.crossfadeTo('thinking')` (or a subtle idle variant); while audio plays, `playOverlay('talking')`; on end, settle to idle. Use only canonical clips so it works on any rig (`supportsCanonicalClips()` gate).
6. **Multi-watcher echo (optional, wired)** — also `api/agent-screen-push` the question + answer as `type:"analysis"` log lines so everyone watching sees the exchange, not just the asker.

## Files to create / modify
- `api/agent-ask.js` — live Q&A: persona + memory + brain SSE + memory write-back (new)
- `src/agent-screen.js` — branch task bar to ask vs queue; stream answer; typing indicator; TTS; avatar emotes (modify)
- `pages/agent-screen.html` — typing-indicator + speaker/mute affordances in the log/task area (modify)
- `api/agent-memory.js` / `packages/agent-memory` — session-scoped read/write (use as-is; extend only if a session tag helper is missing)

## Real integrations (no mocks, ever)
- Real `api/brain/chat.js` LLM router with the agent's configured `provider`/model.
- Real `api/agent-memory.js` / `packages/agent-memory` persistence for cross-question context.
- Real `api/tts/speak.js` (or `api/tts/edge.js`) audio.
- Real `src/animation-manager.js` clips for thinking/talking.
- Credentials: brain/LLM keys (router has free-tier fallbacks), TTS keys (`edge` needs none), Upstash Redis. In `.env` / `vercel env`. If missing, ask once then proceed.

## Every state designed
- **Loading:** typing indicator (animated dots) in the log + avatar "thinking" emote the instant the question is sent — real time-to-first-token, no fake delay.
- **Empty:** before any question, the task bar placeholder invites it ("Ask this agent anything…") and the log shows a one-line hint of what it can answer.
- **Error:** brain unavailable → an honest log line ("I couldn't reach my brain just now — try again") with a retry, never a silent freeze; TTS failure → answer still shows as text (voice is enhancement, not a hard dependency).
- **Populated:** streamed, voiced answer with avatar reactions and remembered context across follow-ups — the hero state.
- **Overflow:** very long question (clamp to `maxlength`), very long answer (scroll the log, stream incrementally), rapid-fire questions (queue/debounce so answers don't interleave), session with many turns (cap context window, summarize older turns), mid-answer network drop (resume via SSE retry, mark the partial answer).

## Definition of done
- [ ] Reachable: typing in the `/agent-screen` task bar produces a live, voiced, remembered answer.
- [ ] Real brain + memory + TTS calls visible in the network tab.
- [ ] Hover / active / focus states on the input, send button, and mute toggle.
- [ ] All five states implemented (typing indicator + reconnect included).
- [ ] Follow-up question demonstrably uses prior context (memory wired).
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); add a test for the question-vs-task routing + context-building (pure logic).
- [ ] Verified live in a browser against `npm run dev` (port 3000).
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag `feature`): "Talk to any live agent — type a question and it answers out loud in its own voice, with its avatar reacting, and remembers the conversation as you go." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. If the agent discusses tokens, the only coin it names or recommends is $THREE.
- No mocks, no fake data, no canned answers, no `setTimeout` fake "thinking", no TODOs, no stubs. Real LLM, real memory, real voice.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
