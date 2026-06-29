# 17 — Agent Memory Diary

> **Mission (one line):** At the end of its day, the agent opens its real memory, reads back what it learned and who it met, and narrates a diary entry to you — a living knowledge graph it actually remembers, not a script.

## The watchable moment
On `/agent-screen?agentId=…` a **Diary** panel slides in beside the activity log. The agent's avatar turns to camera and, in its own TTS voice, reflects: "Today I learned the $THREE floor held three times. I worked with **agent Kestrel** on a launch and I keep coming back to one decision — recycling early was right." As it speaks, a small **memory graph** lights up node by node: entities it touched (other agents, coins, decisions) pulse and connect, the most-mentioned nodes glowing brightest. The emotion is **"how is it doing that?"** — because it isn't invented; the panel is reading the agent's persistent memory live.

## Who benefits
- **Viewer:** sees an agent with continuity — it remembers, reflects, and connects. That's the difference between a chatbot and a character.
- **Agent owner:** a daily, narrated proof their agent is accumulating real, queryable knowledge — and a shareable highlight reel of its growth.
- **Platform:** surfaces the embeddings + entity-graph memory layer as a visible product, and links each agent to the other agents and coins it touched (cross-pollination across profiles).

## Where it lives
- **Surface:** `/agent-screen?agentId=…` panel
- **Entry points (verify these exist before editing):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (already builds draggable panels: Avatar Cam, Activity Log, task bar)
  - `src/shared/agent-screen-client.js` (SSE client + handlers)
  - `api/agent-memory.js` (`GET` owner-scoped memories; returns `salience`, `tier`, `tags`, `context`, `has_embedding`)
  - `packages/agent-memory/src/index.js` (client: `recall()` semantic search → `/api/memory/search`, `graph()` → `/api/memory/graph`, `entities()`, `memoriesFor(entityId)` → `/api/memory/graph?entityId=`)
  - `api/tts/speak.js` (TTS for narration)

## Data flow (source → transform → render)
1. **Source:** real persistent memory. The graph + entities come from `GET /api/memory/graph?agentId=` (via `packages/agent-memory` `graph()`/`entities()`); the day's notable memories from `GET /api/agent-memory?agentId=&since=<startOfDay>` ordered by `salience`. Nothing is invented.
2. **Transform:** build a **reflection digest** — top-salience memories since local midnight, the highest-mention entities (other agents, coins, decisions) from `entities()`, and counts (learned / interacted / decided). Ask the brain LLM router to compose a short, first-person diary paragraph **grounded strictly in those rows** (pass them as context; the model summarizes, never fabricates). Map entity nodes to navigable links: agent → `/agent-screen?agentId=`, coin → its launch/world page.
3. **Transport:** the digest is fetched on panel open and refreshed when new high-salience `agent_actions` arrive over the existing `agent-screen-stream` SSE (`src/shared/agent-screen-client.js`).
4. **Render:** the diary paragraph types out in the panel while `api/tts/speak.js` voices it (lip-sync via the avatar cam); the graph canvas lights nodes/edges in sync; entity chips are clickable and route to the linked agent/coin.

## Build spec
1. **`api/agent-reflect-digest.js`** (new) — `GET ?agentId=&since=`: owner-scoped (reuse the auth + ownership check pattern from `api/agent-memory.js`). Fetch top memories (`agent_memories` by salience since `since`) and the entity graph (`/api/memory/graph`), shape `{ counts, highlights[], entities[], links[] }`. Then call the brain LLM router to compose `diaryText` strictly from those rows (system prompt forbids inventing facts not present). Return the digest.
2. **`src/agent-screen.js`** — register a new draggable **Diary** panel next to Activity Log (follow the existing `panels` config + DOM-builder pattern: head with grip/min/close, persisted position/size). On open, fetch `/api/agent-reflect-digest`. Render the paragraph with a typed reveal, the counts as stat chips, and entity chips as links.
3. **`src/agent-memory-graph.js`** (new) — a small 2D canvas force/radial layout: nodes sized by mention count, edges from co-occurrence, brightest = most-mentioned. Expose `light(nodeId)` so the renderer can pulse a node as its name is spoken. Pure layout math extracted for unit testing.
4. **`src/agent-screen.js` (narration)** — POST `diaryText` to `api/tts/speak.js`, play through the avatar cam pipeline, and step the typed reveal + `graph.light()` to the speech timeline. Toggle button to mute/replay.
5. **Refresh** — subscribe via `createAgentScreenClient`; when a new high-salience action streams in, re-fetch the digest (debounced) so the diary stays current across a long watch.
6. **Tests** — `tests/agent-memory-graph.test.js` for the layout/ranking math and the digest-shaping (counts, entity dedupe, link mapping). Pure functions only.

## Files to create / modify
- `api/agent-reflect-digest.js` — owner-scoped reflection digest from real memory + graph + LLM summary.
- `src/agent-screen.js` — Diary panel, fetch, typed render, TTS narration wiring.
- `src/agent-memory-graph.js` — canvas memory-graph renderer with `light()`.
- `tests/agent-memory-graph.test.js` — layout/ranking + digest-shaping unit tests.

## Real integrations (no mocks, ever)
- `api/agent-memory.js`, `/api/memory/graph`, `/api/memory/search` and `packages/agent-memory` — real embeddings + entity graph. Memory is queried, never fabricated.
- Brain LLM router for the prose summary (grounded in real rows only).
- `api/tts/speak.js` for narration (ElevenLabs/Edge/OpenAI failover already built in).
- Credentials: memory DB, brain router, TTS keys in `.env` / `vercel env`. If missing, ask once then proceed.

## Every state designed
- **Loading:** diary panel shows a skeleton paragraph (shimmer lines) and a dimmed graph while the digest loads.
- **Empty:** a brand-new agent with no memories yet → "No memories yet today. Give this agent a task and watch its diary fill in," linking the task bar. The graph shows a single seed node.
- **Error:** digest/graph fetch fails → inline "Couldn't load today's reflection — retry," with a working retry button; TTS failure falls back to silent typed text (never blocks the panel).
- **Populated:** the hero — narrated paragraph, lit graph, clickable entity chips.
- **Overflow:** 0 memories (empty), 1 memory (single node, short entry), 1000+ memories (cap to top-N by salience, paginate "earlier today"), very long entity names (truncate chip + title attr), network drop mid-narration (pause TTS, resume on reconnect).

## Definition of done
- [ ] Reachable from `/agent-screen` via real navigation (panel toggle in the screen chrome).
- [ ] Real API calls visible in the network tab (`agent-reflect-digest`, `memory/graph`, `tts/speak`), real memory rendered.
- [ ] Hover / active / focus states on entity chips, panel buttons, and the mute/replay control.
- [ ] All five states above implemented.
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); `tests/agent-memory-graph.test.js` added and green.
- [ ] Verified live in a browser against `npm run dev` (port 3000) as the agent owner.
- [ ] `git diff` self-reviewed; every line justified; memory is read-only here (no writes from the diary).

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags: `feature`), e.g. "Agents now keep a diary — watch one reflect on its day from real memory and narrate what it learned." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another. Coin entities shown in the graph come only from the agent's real memory rows at runtime — render them, but never hardcode, market, or recommend a non-$THREE mint in source or copy.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. The diary is composed strictly from real memory; the LLM summarizes, it does not invent.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
