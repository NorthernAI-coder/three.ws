# Task 03 — The Mind Palace (visual, spatial memory)

> Read `prompts/living-agents/00-README.md` and `CLAUDE.md` first. Depends on Task 01
> (`active-agent.js`, `agent-bus.js`, `memory-client.js`). Use those as the data layer.

## Mission

Turn the agent's memory from an invisible database table into a **place the user can
explore** — a spatial, navigable "mind" where every memory is a tangible object the
user can see, search, curate, pin, and forget. This is the centerpiece innovation of
Living Agents: memory you can walk through.

## The innovation bar

Competitors show memory (if at all) as a flat list or a settings toggle. We render the
agent's mind as a **3D/spatial scene** built from the real `agent_memories` data, with
the live avatar at its center. The mapping must be honest and information-dense:
- `salience` (0..1) → size + glow + proximity to the avatar (core beliefs orbit close).
- `type` (user|feedback|project|reference) → distinct visual region/color/constellation.
- recency (`created_at`) and `expires_at` → freshness/fade; expiring memories visibly dim.
- `tags` → edges/clusters between related memories (a real association graph).
- `is_public` vs private → clearly distinguished (this matters for Task 06 ownership).

Direct manipulation, not forms:
- **Drag a memory toward the avatar** → raise salience / pin (real `PATCH /api/agent-memory`).
- **Flick it away / into a "forget" zone** → set `expires_at` or delete (real DELETE),
  with an undo. Forgetting should feel deliberate and reversible, never a silent destroy.
- **Search/filter** by type, tag, salience, recency — fast, debounced, paginated for
  agents with thousands of memories.
- **Click a memory** → inspect full `content`, `context` (jsonb), provenance, and the
  conversation/source that created it if available.

## What to build

1. A **Mind Palace surface** — a route (e.g. `/agent/{id}/mind`, registered in
   `data/pages.json` so it hits the changelog) AND an in-editor embed (a tab on
   `pages/agent-edit.html`). Reuse `<agent-3d>` for the central avatar and the existing
   Three.js stack; respect `src/webgl-budget.js`.
2. **Real data binding** via `memory-client.js`: load memories with pagination, render the
   spatial layout, and **live-update from the bus** — `memory:added` animates a new node
   forming, `memory:recalled` pulses the recalled node (so opening the Palace during a
   chat shows recall happening), `memory:forgotten`/`updated` reflect immediately.
3. **Curation interactions** wired to the real CRUD endpoints, each with optimistic UI +
   rollback on failure, undo, and a clear empty/loading/error state.
4. **Layout that scales:** a deterministic, performant layout algorithm (force-directed
   by tag-similarity + salience radius is a good start) with level-of-detail so 5,000
   memories don't tank the frame rate. Provide a 2D fallback/toggle for low-power devices
   and `prefers-reduced-motion`, and full keyboard navigation (tab between memories,
   arrow-to-traverse the graph) — the Palace must be usable without a mouse.
5. **Optional Meshy enhancement:** probe for the `meshy` MCP via `ToolSearch`. If present,
   you may generate distinctive 3D meshes for memory "objects" (e.g. a crystal whose form
   encodes type). Cache generated assets; never block render on generation; ship the
   geometric fallback if Meshy is unavailable.

## Wiring & real-API mandate

- 100% real `/api/agent-memory` reads and writes. No seeded sample memories. For an agent
  with zero memories, design a genuine empty state that invites the first memory (e.g.
  "talk to your agent and watch its mind grow" → opens chat).
- Provenance/source links must point to real conversations/actions, not fabricated ones.

## Definition of done

- [ ] `/agent/{id}/mind` and the in-editor tab both render the real memory set with the
      live avatar centered; salience/type/recency/tags map visibly and correctly.
- [ ] Drag-to-pin, flick-to-forget (with undo), search/filter all hit real endpoints and
      reflect optimistically with rollback on error.
- [ ] Opening the Palace during a chat shows real `memory:recalled` pulses.
- [ ] Performs at 1k+ memories (LOD/virtualization); 2D fallback + keyboard nav +
      `prefers-reduced-motion` honored; WebGL budget respected.
- [ ] Loading/empty/error/overflow states all designed. No console errors/warnings.
- [ ] `npm test` passes; `git diff` reviewed; changelog entry (`feature`); `build:pages`.

## Self-improvement pass

Ask: is this a viewer or an *experience*? Add what elevates it — a "memory timeline"
scrub that replays how the mind grew over time, a "why does my agent believe this?"
trace that walks the tag-graph, the ability to merge duplicate memories the agent
formed, or a shareable snapshot of your agent's mind (respecting privacy). Build the one
with the highest wow-to-effort ratio, fully wired.

## When done

Delete this file. Report the route, the salience→visual mapping you chose, and the
curation endpoints you wired.
