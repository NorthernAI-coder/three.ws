# Task 01 — Memory MCP tools (`remember` / `recall` / `forget`)

**Pillar:** Brain (LLM memory). **Server:** main `/api/mcp`.
**Read first:** [`README.md`](README.md) (shared conventions, MCP authoring
contract, Definition of Done) and `/CLAUDE.md`.

## Goal

Give agents persistent, recallable memory **through MCP**. The entire memory
backend already exists and is battle-tested — it is simply not exposed as MCP
tools. After this task, an agent connected to `/api/mcp` can store a memory,
recall the most relevant memories for a query, and forget one — closing the
"brain (LLM **memory**)" half of the narrative that IBM Granite _inference_
(`/api/ibm-mcp`) does not cover.

## What already exists (wire to this — do not rebuild)

- **REST endpoint:** `api/agent-memory.js` - `GET /api/agent-memory?agentId=` — list an agent's memories (owner only),
  ordered `salience DESC, created_at DESC`, excluding expired (`expires_at`). - `POST /api/agent-memory` — upsert a memory: `{ agentId, type, content, tags,
context, salience, expires_at }`. `type ∈ {user, feedback, project,
reference}`; `salience` default `0.5`. - `DELETE /api/agent-memory/:id` — forget (owner only). - Ownership is enforced via `agent_identities.user_id` (see `resolveAuth` and
  the `SELECT user_id FROM agent_identities WHERE id = ${agentId}` checks).
- **DB table:** `agent_memories (id, agent_id, type, content, tags, context,
salience, created_at, expires_at, updated_at)`.
- **Semantic recall:** `api/agents/_id/embed.js` produces Voyage AI embeddings
  (`voyage-3-lite`, 1024-dim) used for similarity search; an `AgentMemory.recall()`
  helper exists (find it — search `recall(` and `agent_memories`) that ranks by
  salience + vector similarity. **Reuse the existing recall logic**; do not
  re-implement embedding/ranking from scratch.

Read all of `api/agent-memory.js` and the recall helper before writing.

## Build

Create `api/_mcp/tools/memory.js` exporting `toolDefs` with three tools, and wire
it into `api/_mcp/catalog.js` (`import { toolDefs as memoryDefs }` → add to
`allDefs`).

### `remember` (scope: `memory:write`)

Store a memory for one of the caller's agents.

- Inputs: `agent_id` (required, uuid), `content` (required, 1–4000 chars),
  `type` (enum user|feedback|project|reference, default `reference`), `tags`
  (string[] optional), `context` (string optional), `salience` (number 0–1
  optional, default 0.5), `expires_at` (ISO-8601 string optional).
- Behavior: verify `agent_identities.user_id === auth.userId` (reuse the
  endpoint's ownership query); upsert into `agent_memories`; if an embedding
  step is part of the existing write path, run it. Return the stored memory id +
  fields.

### `recall` (scope: `memory:read`)

Retrieve the most relevant memories for a query.

- Inputs: `agent_id` (required), `query` (required, 1–1000 chars), `limit`
  (int 1–50, default 8), `type` (optional filter).
- Behavior: ownership check, then call the existing `AgentMemory.recall()` (or
  equivalent) — semantic similarity over the query embedding, blended with
  salience, excluding expired. Return an ordered list of `{ id, type, content,
tags, salience, score }`.

### `forget` (scope: `memory:write`)

Delete a memory the caller owns.

- Inputs: `memory_id` (required), or (`agent_id` + `memory_id`).
- Behavior: ownership check (join `agent_memories` → `agent_identities.user_id`,
  mirroring `handleDelete`), delete, return `{ ok: true, id }`.

## Requirements & edge cases

- **Ownership on every tool.** Reuse `api/agent-memory.js`'s ownership query —
  do not trust `agent_id` from input. If the agent isn't owned by `auth.userId`
  (or `auth.userId` is null on the x402 path), return a designed error
  ("sign in with three.ws OAuth and pass an agent you own"), not a throw.
- Register `memory:read` and `memory:write` in the OAuth scope list (find where
  scopes like `avatars:read` / `avatars:delete` are defined — `api/_mcp/auth.js`
  / `api/_lib/auth.js`) so they can actually be granted.
- Recall with zero stored memories returns an empty list with a helpful message,
  not an error.
- If embeddings/Voyage are unconfigured, recall must still work by falling back
  to salience + recency ordering (the existing helper likely already does this —
  preserve that behavior; do not introduce a new failure mode).
- Respect a sensible rate limit (reuse an existing limiter from
  `api/_lib/rate-limit.js`; recall/remember are cheap but DB-backed).

## Wiring checklist

- [ ] `api/_mcp/tools/memory.js` created; `toolDefs` = [remember, recall, forget].
- [ ] Imported + added to `allDefs` in `api/_mcp/catalog.js`.
- [ ] `memory:read` / `memory:write` scopes registered and grantable.
- [ ] `INSTRUCTIONS` in `api/_mcp/dispatch.js` mention memory if appropriate.
- [ ] `server.json` description updated to mention agent memory.

## Definition of Done

All items in [`README.md`](README.md) → "Definition of Done", plus:

- [ ] Catalog assembles: `node --input-type=module -e "import('./api/_mcp/catalog.js').then(m=>console.log(m.TOOL_CATALOG.map(t=>t.name).join(', ')))"` lists `remember, recall, forget`.
- [ ] `tests/api/mcp-memory.test.js`: ownership rejection, schema validation,
      a happy-path remember→recall→forget round-trip (mock `sql`/embed at the
      module boundary), and the "no memories" empty case. Green.
- [ ] Manually verified via MCP inspector against `npm run dev`: `remember` then
      `recall` returns the stored item ranked first.

## Out of scope

- A dedicated memory MCP server (memory belongs on the main agent server).
- Auto-seeding memory from external sources (Farcaster seed already exists at
  `api/agents/_id/memory-seed-farcaster.js` — leave it).
- Wiring memory into IBM Granite chat (that's a future "memory-aware inference"
  task; this task only exposes store/recall/forget).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/mcp-agent-selfsufficiency/01-memory-mcp-tools.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
