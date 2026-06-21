# 03 · Test the product core (forge, avatar, auto-rig)

> **Phase 0 — Test confidence** · **Depends on:** 01 · **Parallel-safe:** yes · **Effort:** L

## Mission
The Forge (text/photo → 3D) and avatar creation/auto-rig pipeline are the product. Several forge
endpoints and core `src/` modules ship without dedicated tests. Lock down generation cost caps,
provider failover, asset delivery, the avatar create→rig path, and the bone-name canonicalization
that the whole animation system depends on.

## Context (read first)
- `CLAUDE.md` — note the **"avatar animation is universal — no rig allowlist"** rule and the canonicalization contract.
- Forge endpoints: `api/forge.js`, `api/forge-creation.js`, `api/forge-enhance.js`, `api/forge-gameready.js`, `api/forge-gallery.js`, and the engine lanes (nvidia/trellis/meshy/tripo/hunyuan3d/triposg).
- Store: `api/_lib/forge-store.js` (`listShowcase`, `listCreations`, `setPreview`).
- Avatar/animation: `src/glb-canonicalize.js` + `tests/glb-canonicalize.test.js` (extend), `src/animation-retarget.js`, `AnimationManager.supportsCanonicalClips()`, `api/avatars.js`, `api/avatar-render.js`, MCP `rig_mesh` / `forge_avatar` paths.
- Showcase client logic: `src/forge-showcase.js` (thumbnail fallback chain).

## What to cover (write tests for)
1. **Forge cost cap & gating** — generation respects the free/holder/paid tiers; a request over quota is rejected cleanly; $THREE-holder free lane works (server-verified).
2. **Provider failover** — when the primary engine lane errors, the chain falls back per the documented order and surfaces a real error if all fail (no fake success).
3. **Asset delivery & store** — `forge-store.listShowcase` ordering (preview-first, recency tiebreak), `done + glb_url` filter, `rejected` exclusion; `setPreview` only sets when null and only by the creating client.
4. **Gallery API** — `api/forge-gallery.js` scope=community vs client scope; `enabled:false` when store unconfigured; dedupe/limit behavior.
5. **GLB canonicalization** — extend `tests/glb-canonicalize.test.js` with every skeleton convention named in CLAUDE.md (Mixamo, Avaturn, Unreal, VRM/VRoid, VRM 1.0, Daz/Genesis, MakeHuman, Blender `.L`, simple `shoulderL`). A genuinely non-humanoid rig falls back to default (gate), never a T-pose.
6. **Avatar create→rig** — `api/avatars.js` POST validation + the auto-rig-on-create path; humanoid gate behavior.
7. **Showcase thumbnail fallback** — `src/forge-showcase.js`: Plan A/B/C/D selection logic given preview/glb presence (pure-logic assertions; DOM via jsdom).

## Files likely in play
`tests/api/forge-critical-path.test.js` (new), `tests/api/forge-gallery.test.js` (extend), `tests/glb-canonicalize.test.js` (extend), `tests/api/avatar-creation.test.js` (new), `tests/src/forge-showcase.test.js` (new). Add deterministic ones to the gate.

## Definition of done
- [ ] New/extended tests pass; deterministic across reruns.
- [ ] Every CLAUDE.md skeleton convention has a canonicalization test case.
- [ ] Cost cap, provider failover, and store ordering all asserted.
- [ ] Deterministic tests added to `GATE_TESTS` + `.vercelignore` (`--audit` clean).
- [ ] Changelog: internal → **no** entry.

## Guardrails
Follow CLAUDE.md. Use synthetic GLB fixtures or existing test assets — never fabricate "passing" generation results. If a test exposes a real pipeline bug, fix it or flag it explicitly. Push both remotes.
