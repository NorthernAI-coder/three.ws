# P2 — Memory Studio (LLM memory you can watch form, edit, and trust)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md` and
`STRUCTURE.md` first. **Prerequisite:** P0 (`01-foundation.md`) is merged. Read the "Integration
notes for P1–P5" at the top of `src/studio/agent-studio-store.js`. Mount into the **Memory** tab.
Coordinate with P1 (the Brain's Memory node reads/writes through your store) via the `studio` contract.

## The vision you are enabling

Memory is the difference between a chatbot and a companion that *knows you*. Today we have
`api/agent-memory.js`, the `agent_memories` table (`id, agent_id, type, content, tags, salience`),
and `src/memory-seed.js` (synthesizes identity from GitHub/X/Farcaster connectors). That's a
foundation — but memory is currently invisible. Per our product principle, memory must be a **visual
thing the user watches form, curates, and trusts.** And for our domain it must be **trade-aware**:
the agent remembers every snipe, win, loss, watchlist, and rule, and surfaces them at the right moment.

This is what makes our agent feel alive across sessions. No other crypto tool has a trader with a memory you can see.

## Your mission

### 1. Tiered memory architecture (adopt the proven model)
Mirror **Letta/MemGPT**'s tiers and **mem0**'s ergonomics — implement real storage, don't bolt on a
heavy vendor unless justified:
- **Working memory** — the small, always-in-context core (who the user is, current goals, active
  positions). Editable, pinned, token-budgeted.
- **Recall memory** — recent interactions/trades, searchable.
- **Archival memory** — long-term store with semantic search (embeddings). Use a real embedding
  provider already available in the worker proxies; store vectors in Postgres (pgvector if present —
  check `api/_lib/schema.sql`; add the extension/migration if not). No fake similarity.
- Implement `add()` on events and `search()` before responses (the mem0 pattern) so P1's Brain
  Memory node can recall relevant memories into context for real. Salience/decay so the core stays small.

### 2. Visual memory surfaces (the product principle)
- **Memory Timeline** — a live, scrollable stream of memories forming over time (trades, chats,
  learned preferences), each with type, salience, source, and tags. Animate new memories landing.
- **Memory Graph** — entities and relationships (coins, wallets, people, strategies) as a graph the
  user can explore. (Zep/Graphiti-style temporal knowledge graph is the inspiration — see sources.)
- **Curate:** pin to working memory, edit, merge duplicates, adjust salience, and **forget** (with
  confirm). Show exactly what's in-context right now and the token budget — transparency builds trust.
- **Trade-aware views:** "What does my agent remember about <mint>?", "Show my agent's lessons from
  losing trades," "Rules my agent follows." These pull from real trade history (coordinate with P4).

### 3. Live wiring
- New/extended endpoints under `api/agent-memory.js` and new `api/memory/**` for search, tiering,
  embeddings, graph edges. Real auth (owner-only), real CSRF (match the existing pattern).
- Every memory write/edit flows so the Brain and the live avatar can react (`studio.emit('memory:change')`).
- Hook `src/memory-seed.js` connectors into the timeline so first-run memory has real substance.

## Libraries / concepts to adopt (research-backed)
- **mem0** (add/search ergonomics, hybrid vector+graph+kv) — https://github.com/mem0ai/mem0
- **Letta / MemGPT** (tiered working/recall/archival, self-paging) — https://github.com/letta-ai/letta
- **Zep / Graphiti** (temporal knowledge graph for facts that change over time — best-in-class on
  LongMemEval) — https://github.com/getzep/graphiti
- Embeddings/vectors: prefer Postgres + pgvector over a new external service. Reuse worker proxies
  for the embedding model. Don't add a vendor SDK unless it earns its weight — mirror the patterns.

## Definition of done
- Real tiered memory with real embeddings + semantic search (no fake similarity, no sample arrays).
- Timeline + graph render real memories; pin/edit/merge/forget/salience all persist via real APIs.
- Brain's Memory node (P1) can `search()` and pull real memories into context.
- "In-context now" + token budget visible. Trade-aware queries return real data.
- All states designed (no memories yet → explain + offer connector seeding; thousands → virtualized).
- No console errors; `npm test` passes; network tab shows real calls. Changelog entry added.

## Operating rules (override defaults)
No mocks/stubs/TODOs/fake similarity/sample arrays. $THREE is the only coin promoted; trade memories
reference runtime mints only. Design tokens only. Stage explicit paths (never `git add -A`); re-check
`git diff --staged` before commit. Own `src/studio/memory/**`, `api/memory/**`, and extensions to
`api/agent-memory.js`; coordinate the memory port with P1 and trade history with P4 via `studio`.

## When finished
Self-review (CLAUDE.md's five checks). Then push it: add the one delightful thing — e.g. a "memory
replay" that shows how the agent's understanding of a coin evolved over time, or proactive "your
agent learned X" nudges. Build it. Then **delete this prompt file**
(`prompts/agent-studio/03-memory-studio.md`) and report what you shipped + the memory API surface
P1/P4 should use.
