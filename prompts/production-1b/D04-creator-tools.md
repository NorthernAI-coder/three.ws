# D04 — Creator tools (Scene Studio, Compose, Pose, Voice, Scan) production pass

> Phase D · Depends on: D01 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
The creator tools — Scene Studio (3D scene editor), Compose (attach items to avatars), Pose
(animation studio), Voice (voice cloning), Scan (selfie → rigged avatar) — are what turn
consumers into creators, and creators into sellers. Each is powerful but uneven. Bring them
to a dependable, no-lost-work, monetizable baseline.

## Where this lives (real files)
- `src/scene-studio/` (`/scene`, vendored three.js editor), Compose (`/compose`), Pose (`/pose`), Voice (`/voice`), Scan (`/scan`) — confirm exact module paths via `data/pages.json`.
- `avatar-sdk/`, `character-studio/` for shared 3D; `api/` for save/monetize.

## Current state & gaps
- Scene Studio: no autosave (unsaved-work loss), unclear lighting bake vs real-time, no scene-size limits, no mobile path.
- Compose: item-to-bone attachment can be wrong, scale constraints, outfit save/load, export formats.
- Pose: IK convergence errors, timeline scrubbing perf, GLB export validity, monetization not integrated, no mobile posing.
- Voice: recording-quality validation, cloning confidence, privacy/storage policy, cross-agent assignment persistence.
- Scan: camera-permission failures, lighting requirements, face-detection retry, rigging-failure detection, mobile camera API compatibility.

## Build this
For each tool (do them as sub-tasks, all must reach the bar):
1. **No lost work:** autosave/recover where a user invests effort (Scene, Pose, Compose).
2. **Validated output:** exports produce valid GLB/clip JSON (integrity-checked); attachments map to correct bones; rigging/scan failures are detected and explained with retry.
3. **All states + limits:** loading/empty/error states; enforced size/time/quality limits surfaced to the user.
4. **Monetize:** Pose/Compose/Voice outputs can be saved + listed for sale through the real payment path (A11/B03), $THREE economics applied.
5. **Privacy:** Voice/Scan document where recordings/images are stored and how to delete; honor it.
6. **Mobile + a11y:** at minimum a usable mobile path or a clear "best on desktop" with graceful degradation; keyboard + labels.

## Out of scope
- The shared avatar pipeline (**D01**) and payment internals (**B03**) — reuse them.

## Definition of done
- [ ] Each tool: no lost work, valid validated exports, all states, enforced+surfaced limits.
- [ ] Monetization wired for sellable outputs; privacy policy honored for Voice/Scan.
- [ ] Mobile path or graceful degradation; a11y verified; `npx vitest run` green.
- [ ] Changelog entry; committed + pushed to both remotes.

## Verify
- In each tool: invest work → reload → recovered; export → load the file back successfully; (Pose/Voice) list an output for sale and buy it; (Scan) deny camera → clear fallback.
