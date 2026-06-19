# Task 01 — Foundation: Active-Agent state + the Agent Bus

> Read `prompts/living-agents/00-README.md` first — it holds the vision, the real
> codebase map, and the rules every Living Agents task must follow. Read `CLAUDE.md`
> fully; it OVERRIDES defaults. This task is the **spine** of the whole initiative:
> every other feature (02–08) subscribes to what you build here. Get the interface
> right — others will treat it as fixed.

## Mission

Make "my agent" a first-class, single-source-of-truth concept that every page on the
platform shares, and give the client a typed event bus so any surface can react in
real time when the agent thinks, learns, remembers, feels, dreams, or acts. Today
there are three competing notions of "current avatar" (`src/guest-avatar.js`,
`walk:companion:avatar`, `localStorage['cc-avatar']`) and no event plumbing — so the
avatar is stateless decoration. You are fixing the foundation that makes it alive.

## The innovation bar

Anyone can write a global store. The game-changer is that this bus turns the agent
into a **continuous presence**: a memory recalled inside a chat on the marketplace page
visibly ripples to the companion in the corner and to the Mind Palace if it's open.
Design the event contract so that level of cross-surface liveness is trivial for tasks
02–08 to plug into. Think about it like a nervous system, not a settings object.

## What to build

1. **`src/agents/active-agent.js`** — canonical active-agent module.
   - `getActiveAgentId()` / `setActiveAgent(id)` persisting to
     `localStorage['threews:active-agent']`.
   - `getActiveAgent()` → resolves the full record via the real `GET /api/agents/:id`
     (credentials included; private agents allowed). Cache the resolved record; expose
     `refreshActiveAgent()` to force a re-fetch.
   - `onActiveAgentChange(cb)` / returns an unsubscribe fn. Fire on set, on refresh, and
     across tabs via the `storage` event so multiple tabs stay consistent.
   - **Migration/compat:** when no `threews:active-agent` is set, derive a sensible
     default — the user's most recently used / first owned agent from a real API
     (`GET /api/agents` owner list); for signed-out guests, fall back to the staged
     guest avatar (`src/guest-avatar.js`). Reconcile the legacy keys
     (`walk:companion:avatar`, `cc-avatar`) into this module so nothing regresses — read
     them as fallbacks and write through to them where existing code still reads them,
     then leave a single source of truth.
2. **`src/agents/agent-bus.js`** — singleton typed pub/sub bus.
   - `emit(type, payload)` / `on(type, cb)` / `once` / off. Support a wildcard
     subscriber for debugging. Events listed in the README under "Shared contract."
   - Every event payload is `{ agentId, ts, ...data }`. `ts` comes from the server
     response when one exists, else passed by the caller — never invent client wall-clock
     in a way that desyncs ordering; prefer server `created_at`.
   - Provide a thin **memory client** wrapper used by everyone:
     `src/agents/memory-client.js` with `listMemories(agentId, opts)`,
     `addMemory(agentId, entry)`, `updateMemory`, `forgetMemory` — each hitting the real
     `/api/agent-memory` endpoints and emitting the corresponding bus event on success.
     This is how task 03/04/07/08 mutate memory without duplicating fetch logic.
3. **Recall instrumentation (real, not faked).** When the agent recalls memory during a
   chat, the system must emit `memory:recalled`. The chat path (`api/chat.js` builds the
   system prompt from persona + memory) needs to surface *which* memories were injected
   so the client can emit the event. Implement this for real: have the chat endpoint
   include the recalled memory ids/snippets in its SSE `done` (or a dedicated `meta`)
   event, and have the client emit `memory:recalled` from that. No heuristic guessing —
   emit exactly what the server actually used.
4. **A tiny dev surface to prove it works:** a debug overlay (gated behind a query flag
   like `?agentbus=1`, not shipped visibly) that logs live bus events. This is your
   verification tool, not a product feature — keep it out of the normal UI.

## Wiring & real-API mandate

- Use `GET /api/agents/:id`, `GET /api/agents`, `/api/agent-memory` — the real endpoints.
- If `api/chat.js` does not already return the recalled-memory set, add it for real
  (it already assembles memory into the prompt — expose what it used). Keep the SSE
  contract backward compatible.
- No mock agent, no fake memory array, no `setTimeout` simulated events.

## Definition of done

- [ ] `active-agent.js` + `agent-bus.js` + `memory-client.js` exist, documented with
      precise JSDoc, and the three legacy avatar keys are reconciled with no regression
      to `walk-companion` or `/play`.
- [ ] `npm run dev`, open two tabs: changing the active agent in one reflects in the
      other (cross-tab `storage` sync). Network tab shows real `/api/agents/:id`.
- [ ] Sending a chat that triggers memory recall emits a real `memory:recalled` event
      carrying the actual memory ids the server injected (verify in the debug overlay).
- [ ] No console errors/warnings. `npm test` passes. `git diff` reviewed line by line.
- [ ] Changelog entry added (`improvement`/`infra`) + `npm run build:pages`.

## Self-improvement pass (do before stopping)

Ask: is this bus genuinely a nervous system, or just an event emitter? Add what makes
it game-changing — e.g. event replay for a surface that mounts late (so the Mind Palace
opening mid-session can catch up), backpressure/coalescing so a burst of `memory:added`
doesn't thrash subscribers, and a clean TypeScript-style `.d.ts` or JSDoc typedef so
tasks 02–08 get autocomplete on the event contract. Then do it.

## When done

Delete this file (`rm prompts/living-agents/01-foundation-active-agent-and-memory-bus.md`).
Do not touch the README or other prompts. Report the final event contract you shipped so
the other agents build against reality.
