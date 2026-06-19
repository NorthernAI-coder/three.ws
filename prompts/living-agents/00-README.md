# Living Agents — Prompt Suite (Index — DO NOT DELETE)

> This file is the index and shared context for the **Living Agents** initiative.
> It is NOT a task. Do not delete it. Every numbered prompt in this folder is a
> self-contained task for one agent chat. When an agent finishes a numbered task
> (and its self-improvement pass), it deletes **only its own** numbered prompt file.

---

## The vision

Today three.ws has a real agent brain (multi-provider chat, persona extraction, a
`agent_memories` store with salience/IPFS/encryption) and a real 3D avatar system
(`<agent-3d>` web component, a site-wide `walk-companion`, a WebGL context budget).
But the brain is **invisible** and the avatar is **stateless decoration**. Users
can't see their agent think, learn, remember, feel, or grow — so the "brain" feels
fake even though it is real.

**We are building the first platform where your AI agent has a mind you can _see,
explore, shape, and own_ — and a body that is present, alive, and reactive on every
page you visit.** Not a chatbot with a face. A living agent.

The north star: a user should be able to (1) see their agent everywhere as a
persistent, state-reflecting companion; (2) walk through their agent's memory like a
place; (3) come back after being away and find their agent has _reflected_ and
_grown_ on its own; (4) reshape its personality and feel the change land instantly on
the visible avatar; (5) truly own and carry that mind — verifiable and portable.

This is not character.ai with a 3D skin. If a competitor already has it, we are not
building that version. **Invent.**

---

## What already exists (build ON this — do not rebuild it)

Brain / memory backend:
- `api/chat.js` — multi-provider streaming chat (Anthropic/OpenAI/Groq/NVIDIA/Watsonx, SSE).
- `api/brain/chat.js` — reasoning endpoint.
- `api/agent-memory.js` + `agent_memories` table (`api/_lib/schema.sql` ~478-525):
  fields `type` (user|feedback|project|reference), `content`, `tags`, `context` (jsonb),
  `salience` (real, 0..1), `is_public`, `expires_at`. Owner-only CRUD.
- `agent_memory_pins` table — IPFS CID tracking for pinned/encrypted memory.
- `specs/MEMORY_SPEC.md` — the memory retrieval/relevance/timeline protocol.
- `api/agents/_id/persona.js` + persona fields on `agent_identities`
  (`persona_prompt`, `persona_tone_tags`, `persona_extracted_at`); extraction is a
  5-question interview → Claude "Persona Architect" → signed system prompt.
- `agent_identities` table — name, description, `avatar_id`, `skills` (text[]),
  `voice_*`, wallet in `meta` (encrypted), publish fields, `agent_versions` history,
  `agent_actions` append-only signed action log.

3D / avatar frontend:
- `src/element.js` — the `<agent-3d>` web component. Attrs: `src`, `avatar-id`,
  `agent-id`, `manifest`, `body`, `mode` (`inline|floating|section|fullscreen`),
  `kiosk`, `eager`, `voice`, `brain`, `instructions`. Methods: `playGesture(name,opts)`,
  `setMorph(name,weight)`.
- `src/viewer.js` — per-instance Three.js renderer (bloom+vignette, pixel-ratio cap).
- `src/webgl-budget.js` — live WebGL context budget (default 8) with LRU eviction;
  `window.AGENT3D_MAX_LIVE_VIEWERS`, `reserveWebGLContext()`, `window.__agent3dReservedContexts`.
- `src/walk-companion.js` — the site-wide persistent floating avatar (cursor tracking,
  gesture-on-nav, route-aware greet). Mounted via `public/nav.js`.
- `src/shared/agent-3d.js` — `agentAvatarGlb(agent)` resolver, `MANNEQUIN_GLB` fallback.
- `src/agent-resolver.js` / `src/manifest.js` — resolve avatar-id / agent-id / on-chain
  `agent://` URIs → GLB + manifest (100-entry LRU).
- `src/agent-accessories.js` — runtime clothing/accessory overlay without mutating the GLB.

Central editor:
- `pages/agent-edit.html` + `src/agent-edit.js` — the `/agent/{id}/edit` hub with tabs
  (Persona, Outfit, Voice, Knowledge, Skills, Autopilot, Publish, Wallet, Analytics,
  Studio…). Contains an emotion-graph state machine (`src/agent-edit.js` ~644-715) and a
  bare "Add memory" button (`mem-add-btn`).

Autonomy / events:
- A real-time alert & automation engine landed recently (see git log: "real-time alert
  and automation engine for user-defined alerts"). Memory-grounded Autopilot builds on it.
- `api/_lib/agent-wallet.js` — encrypted Solana/EVM custodial wallets.

On-chain / portability:
- `contracts/` — ERC-8004 on-chain identity; `agent_memory_pins`; IPFS pinning + ECIES
  encrypt-to-owner already used for the `encrypted-ipfs` memory mode.

Optional generation resource:
- A **`meshy` MCP server** (AI 3D model/texture generation) may be connected. Do NOT
  hardcode tool names. Probe with `ToolSearch` ("meshy", or "select:<name>") at task
  start; if available, use it for procedural 3D artifacts (memory objects, dream imagery,
  generated accessories). If unavailable, ship the feature without it — never block on it,
  never fake it.

---

## The features (one numbered prompt each)

| # | Prompt | What it delivers | Depends on |
|---|--------|------------------|------------|
| 01 | Foundation: Active-Agent + Memory Bus | One canonical "my agent" state + a client event bus all surfaces subscribe to | — |
| 02 | Persistent Companion HUD | The avatar present, alive, and state-reflecting on every page; contextual quick-edit; transparency chips | 01 |
| 03 | The Mind Palace (visual memory) | Memory as a navigable spatial place you explore, curate, search | 01 |
| 04 | Reflection & Dreams engine | Idle-time real LLM consolidation → higher-order insights ("dreams") the user reviews | 01 |
| 05 | Brain Studio (persona live editor) | Personality as editable traits with instant live preview on the visible avatar; A/B | 01 |
| 06 | Portable & Verifiable Brain | Signed, ownable, exportable/importable, IPFS/encrypted, on-chain-anchored mind | 01, (03) |
| 07 | Emotion & Embodiment engine | Avatar body/face driven by a real emotional state derived from memory + events | 01, 02 |
| 08 | Memory-grounded Autopilot | Explainable autonomy: agent acts (alerts/wallet) and shows the memory that motivated it | 01, 04 |
| 09 | Integration, QA & polish | Cross-feature wiring, perf, a11y, every-state-designed audit, end-to-end exercise | 01-08 |

**Dependency order:** 01 first (it is the spine — everything subscribes to its bus).
02–08 can run in parallel once 01 lands. 09 runs last. Agents working in parallel must
follow the "Concurrent agents share this worktree" trap in `CLAUDE.md` (stage explicit
paths only; re-check `git status`/`git diff --staged` before committing).

---

## Shared contract — the bus and the active agent (defined by 01, used by all)

So parallel agents don't invent conflicting interfaces, 01 establishes these and every
other task imports them. If you are NOT task 01, treat this as a fixed API:

- Module: `src/agents/active-agent.js`
  - `getActiveAgent()` → resolved agent record (or null) from `/api/agents/:id`.
  - `setActiveAgent(id)` → persists to `localStorage['threews:active-agent']`, resolves, emits.
  - `onActiveAgentChange(cb)` / off — subscribe to changes.
- Module: `src/agents/agent-bus.js` — a typed pub/sub event bus (singleton). Events:
  - `memory:added`, `memory:recalled`, `memory:updated`, `memory:forgotten`
  - `brain:updated` (persona/trait change), `mood:changed`, `dream:created`
  - `action:taken` (autopilot), `agent:changed`
  - Each event carries `{ agentId, ...payload, ts }`. `ts` must come from the server
    response or be passed in by the caller — see the date rule below.

Surfaces subscribe to the bus to react (the HUD shows a "recalled" chip on
`memory:recalled`; the Mind Palace animates a new node on `memory:added`; the avatar
re-expresses on `mood:changed`). This decoupling is what makes the avatar feel alive
everywhere without each page knowing about every feature.

---

## Rules every agent in this suite MUST follow

These restate and point to `CLAUDE.md` (read it fully — it OVERRIDES defaults):

1. **Be innovative, professional, proper. Never take a lazy shortcut.** If the obvious
   implementation is the one every competitor already has, you have not finished thinking.
   Build the version that makes someone screenshot it and share it.
2. **No mocks, no fake data, no placeholders, no stubs, no `setTimeout` fake loading, no
   sample arrays.** Wire 100% to the real APIs and tables listed above. If an endpoint or
   column you need does not exist yet, build it for real (Vercel function in `api/`, worker
   in `workers/`, migration in `api/_lib/migrations/`) — completely, not a stub.
3. **No TODOs, no commented-out code, no `throw new Error("not implemented")`.** Finish it.
4. **The only coin is `$THREE`** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
   Never reference any other coin/token anywhere — code, copy, fixtures, tests, commits.
   Synthetic placeholders only (e.g. `THREEsynthetic1111…`).
5. **Every state is designed** — loading (skeletons), empty (tells the user what to do),
   error (actionable + recovery), populated, overflow. Hover/active/focus on every
   interactive element. Responsive at 320/768/1440. Accessible (semantic HTML, ARIA,
   keyboard, contrast, focus rings). Respect `prefers-reduced-motion`.
6. **Performance:** the avatar is on every page — respect `src/webgl-budget.js`. Lazy-boot
   offscreen viewers, reserve contexts for standalone renderers, debounce input, paginate
   memory. Do not ship jank.
7. **Date/random in code you ship is fine; but if any part of your work is generated via a
   workflow/agent harness, never rely on wall-clock in the orchestration** — stamp times
   from server responses. In product code use server timestamps for `ts`/`created_at`.
8. **Changelog:** every user-visible change gets an entry in `data/changelog.json`
   (holder-readable, tags from feature/improvement/fix/sdk/infra/docs/security), then
   `npm run build:pages`. New pages are automatic via `data/pages.json`.
9. **Git:** do NOT install npm packages (`node_modules`/cache are corrupted in this
   codespace — see the user memory). Stage explicit paths only (never `git add -A`).
   When the user asks to push: push to BOTH `threeD` and `threews`. Never pull/fetch
   from `threeD`. Don't commit/push unless asked.
10. **Verify before claiming done.** Run `npm run dev` (port 3000), exercise the feature
    in a real browser, confirm real API calls succeed in the network tab, no console
    errors/warnings. Run `npm test`. Review your own `git diff` line by line.

---

## When you finish your task

1. Run the **Definition of done** checklist in your prompt. Fix every gap.
2. **Self-improvement pass:** step back and ask "what would make this genuinely
   game-changing instead of merely good? what adjacent quality decision did I skip?"
   Then DO it — add the keyboard shortcut, the empty-state illustration, the
   cross-feature wire, the microinteraction, the explainability detail. Raise the bar
   before you stop.
3. Add the changelog entry and run `npm run build:pages`.
4. **Delete your own numbered prompt file** (e.g. `rm prompts/living-agents/0X-….md`).
   Do not delete this README or other agents' prompts.
5. Report: what you built, the real endpoints/tables it uses, what you exercised in the
   browser, and what you improved in the self-improvement pass.
