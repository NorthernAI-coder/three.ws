# R02 — Client: WorldObjects manager for /play

**Phase 1 (Foundation) · Depends on: R01 · Unblocks: R05, R18**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. R01 must be merged — this brief consumes its `objects` map and `obj:*` protocol.

## Goal

Build a client manager that mirrors R01's server `objects` map into the 3D scene: instantiate a
Three.js node per object, interpolate it smoothly each frame, and dispose cleanly. It must be
**feature-agnostic** — later features (ball, blocks, props) register their own mesh factory
without editing this manager.

## Files

- `src/game/world-objects.js` — **new** module exporting a `WorldObjects` class.
- `src/game/community-net.js` — add `spawnObject` / `updateObject` / `removeObject` send methods,
  mirroring the existing `sendChat` / `sendEmote`.
- `src/game/coincommunities.js` — wire `WorldObjects` into the `CoinCommunities` construction,
  per-frame update loop, and net add/change/remove events; dispose on teardown.

## Spec

1. **`WorldObjects` class** — subscribe to `community-net` object add/change/remove events. On add,
   look up a mesh factory by `kind` and instantiate a scene node; on change, update its target
   transform; on remove, dispose geometry/materials and remove from the scene.
2. **Interpolation** — reuse the `REMOTE_LERP` interpolation pattern from `RemotePlayer` in
   `coincommunities.js` so objects glide between server updates instead of snapping. Same lerp
   feel as remote avatars.
3. **`kind` registry** — expose a small registry (e.g. `WorldObjects.registerKind(kind, factory)`)
   where `factory` returns/configures the Three.js node for that `kind`. Provide a sane default
   primitive mesh fallback for unknown kinds. Later briefs (R05 ball, R18 blocks) register here.
4. **`community-net` methods** — `spawnObject(kind, opts)`, `updateObject(id, transform)`,
   `removeObject(id)` that emit the R01 `obj:spawn` / `obj:update` / `obj:remove` messages with
   validated payloads.
5. **Lifecycle** — instantiate, update each frame, and dispose alongside the rest of the
   `CoinCommunities` lifecycle. No leaked geometries/materials/timers on world teardown.

## Definition of done

- Objects spawned via the net appear for **all** clients, interpolate smoothly, and clean up.
- The manager is feature-agnostic: it has no ball/block-specific logic — those live in the
  registered factories.
- Verified in a real browser with two clients: one spawns a test object via the net, the other
  sees it appear, move, and disappear. No console errors/warnings; no leaks on teardown.
- Diff self-reviewed per the R00 / CLAUDE.md DoD.
