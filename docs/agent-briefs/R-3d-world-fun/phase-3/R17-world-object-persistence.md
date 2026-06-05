# R17 — Persistence layer for world objects

**Phase 3 (Sandbox building) · Depends on: R01 · Unblocks: R19**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. **Inspect the repo's existing storage — do NOT invent a new provider.** Real backend only.

## Goal

Make placed objects durable per coin world, keyed by coin mint. Leaving and re-entering a coin
world shows the same build; it survives a server restart.

## Files

- `api/` and/or `workers/` — a storage-backed endpoint/worker using the **existing** KV/DB the repo
  already uses (inspect `api/_lib/`, existing workers, and how the off-schema economy already
  persists state — match that). Do not introduce a new datastore.
- `multiplayer/src/rooms/WalkRoom.js` — load saved objects on room create; persist on
  `obj:spawn` / `obj:update` / `obj:remove` (debounced).

## Spec

1. **Inspect first.** Find how the repo already persists data (the fishing/inventory off-schema
   economy, KV, or DB) and use that exact provider/pattern. A new provider is not allowed.
2. **Keyed by coin mint.** Saved object sets are scoped per coin world (the room's coin mint is the
   key).
3. **Load on create.** When a `WalkRoom` is created for a coin, hydrate the R01 `objects` map from
   storage before clients connect.
4. **Persist on change.** On `obj:spawn` / `obj:update` / `obj:remove`, write through to storage,
   **debounced** so rapid updates don't hammer the backend. Distinguish persistent build pieces
   from transient objects (e.g. the R05 ball) so transient ones are not saved.
5. **Real, not in-memory.** Persistence must survive a full server restart, not just live in room
   memory.

## Definition of done

- Placing objects, leaving, and re-entering a coin world shows the same build.
- Persistence survives a server restart. Writes are debounced; transient objects are excluded.
- Uses the existing datastore — no new provider. No console/server errors. Diff self-reviewed per DoD.
