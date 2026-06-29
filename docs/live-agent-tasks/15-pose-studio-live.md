# 15 — Pose Studio Live

> **Mission (one line):** Viewers call out a pose or emote and the agent's 3D avatar performs it live on screen — wave, warrior stance, victory — on any rig, no allowlist.

## The watchable moment
On `/agent-screen?agentId=…` the avatar panel becomes a stage. Type or say *"wave hello"* and the head-and-shoulders avatar lifts an arm and waves; *"warrior stance"* and it drops into a wide, grounded pose; *"take a bow"* and it bows. The motion retargets cleanly onto whatever rig the agent is wearing — a Mixamo export, a VRoid model, an imported avatar-platform head — because the canonical clip library drives them all. Each request lands in the activity log as a tagged pose, the avatar transitions smoothly (no T-pose snap), and viewers start daring it with weirder prompts. The emotion: playful disbelief — "it actually did it."

## Who benefits
- **Viewer:** direct, tactile control over a live 3D character — the most interactive, replayable thing on the screen.
- **Agent owner:** their avatar feels alive and responsive, a personality demo that works on whatever model they uploaded.
- **Platform:** proves the universal rig pipeline (`glb-canonicalize` → `animation-manager`) on the most visible surface, and links the pose tool, avatar system, and live screen into one loop.

## Where it lives
- **Surface:** `/agent-screen?agentId=…` avatar panel + task bar (pose requests); pose name echoed to the activity log.
- **Entry points (verify these exist before editing):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (`mountAvatarWebcam()` — GLTFLoader + Three.js scene + `AnimationManager`; activity log; task bar)
  - `mcp-server/src/tools/pose-seed.js` — tool `get_pose_seed` (param `prompt`; returns `seed`, `presetId`, `presetLabel`, `group`, `parameters` = canonical-bone joint rotations in radians, `previewUrl`, `match`)
  - `src/animation-manager.js` (`playOnce`, `crossfadeTo`, `playOverlay`/`stopOverlay`, `supportsCanonicalClips()`, `attach`, `update`)
  - `src/glb-canonicalize.js` (`canonicalizeBoneName`, `canonicalizeGLBBones`, `CANONICAL_BONES` — Mixamo/VRM/VRoid/Unreal/Daz/Blender `.L`/simple rigs)
  - `src/pose-presets.js` / `src/pose-library.js` / `src/pose-rig.js` (existing pose preset definitions + rig application used by `/pose`)
  - `api/agent-screen-push.js` / `api/agent-screen-stream.js` (echo the pose to other watchers)

## Data flow (source → transform → render)
1. **Source:** a pose request — the viewer's natural-language prompt from the task bar (or a quick-pick chip). Resolve it through `get_pose_seed` (`mcp-server/src/tools/pose-seed.js`) which returns a deterministic preset + `parameters` (joint rotations keyed by **canonical** bone names), reusing the same preset library as `/pose`.
2. **Transform:** the avatar's rig is canonicalized on load via `src/glb-canonicalize.js` so its bone names map to `CANONICAL_BONES`; the pose `parameters` then apply directly. For animated emotes (wave, bow) drive a canonical clip through `AnimationManager` (`playOnce`/`playOverlay`); for static poses apply the joint-rotation map to the canonical bones. Gate on `supportsCanonicalClips()` — a non-humanoid/skinless prop falls back to the default rig, never a bind-pose T-pose.
3. **Transport:** the pose request resolves client-side for the asker's own avatar render; echo `pose: <label>` to the activity log (and optionally `api/agent-screen-push` `type:"analysis"`) so other watchers see what was requested.
4. **Render:** the avatar in `mountAvatarWebcam()`'s Three.js scene transitions to the pose/emote via `AnimationManager` (smooth crossfade, settle back to idle), and the log shows the tagged pose.

## Build spec
Concrete, ordered steps.
1. **Pose resolution path** — add a helper in `src/agent-screen.js` that takes a prompt, calls `get_pose_seed` (via the tool/API surface already used by `/pose`; reuse `src/pose-presets.js` for the preset → rotation map), and returns `{ label, parameters | clipName }`. Deterministic, idempotent (same prompt → same pose), matching the existing pose-studio behavior.
2. **Apply on the live avatar** — extend `mountAvatarWebcam()` so the loaded avatar is canonicalized (`canonicalizeGLBBones` / bone-name mapping) and the `AnimationManager` is available beyond idle: a `performPose({ parameters | clipName })` that crossfades into the requested emote or applies the static joint map, then settles back to idle after a hold. Reuse `src/pose-rig.js`'s application logic so rotations land on canonical bones consistently.
3. **Wire the task bar / quick picks** — branch a pose request from the task bar to `performPose` (don't queue it as a background task); add a small row of quick-pick pose chips (wave, point, bow, victory, warrior) for one-tap requests. Echo the pose label to `#asc-log`.
4. **Rig universality** — verify on at least three rig conventions (Mixamo export, VRM/VRoid, simple `shoulderL` rig). If a model genuinely can't be skeleton-driven, fall back to the default rig per `supportsCanonicalClips()` — never a T-pose. If a new bone convention appears, add its mapping to `glb-canonicalize.js` with a `tests/glb-canonicalize.test.js` case (per CLAUDE.md — no curated rig allowlist).
5. **Transitions** — every pose enters and exits via crossfade (no snap); overlay gestures (wave) can blend over idle via `playOverlay`/`stopOverlay`. Settle to idle after the hold so the avatar never freezes mid-pose.
6. **Echo to watchers (optional, wired)** — `api/agent-screen-push` the pose as a `type:"analysis"` line so spectators see the request even if they don't render the asker's avatar instance.

## Files to create / modify
- `src/agent-screen.js` — pose resolution + `performPose` + quick-pick chips + log echo (modify)
- `pages/agent-screen.html` — pose quick-pick chip row + styles in the avatar panel (modify)
- `src/glb-canonicalize.js` — add a bone mapping only if a new rig convention is hit (modify if needed)
- `tests/glb-canonicalize.test.js` — case for any newly added bone convention (modify if needed)
- Reuse (do not duplicate): `mcp-server/src/tools/pose-seed.js`, `src/animation-manager.js`, `src/pose-presets.js`, `src/pose-library.js`, `src/pose-rig.js`.

## Real integrations (no mocks, ever)
- Real `get_pose_seed` preset resolution (same library as `/pose`).
- Real `src/glb-canonicalize.js` + `src/animation-manager.js` retargeting onto the agent's actual uploaded GLB.
- Real `api/agent-screen-push` for the watcher echo.
- Credentials: none required for local pose resolution; `SCREEN_WORKER_SECRET` only for the optional push echo. In `.env` if used. If missing, ask once then proceed.

## Every state designed
- **Loading:** avatar GLB loads with a skeleton/shimmer in the panel; the first pose request waits on the model with a "warming up the avatar…" hint, not a spinner.
- **Empty:** before any request, the quick-pick chips invite it ("Try: wave · bow · warrior") so viewers know the avatar is interactive.
- **Error:** unknown prompt → `get_pose_seed` returns a deterministic best-match (no dead end); a rig that can't be driven → graceful default-rig fallback with an honest log note, never a T-pose; load failure → "Couldn't load this avatar" with retry.
- **Populated:** smooth crossfade into the requested pose/emote on the live rig, settling back to idle — the hero state.
- **Overflow:** rapid pose requests (queue/debounce so transitions don't stomp each other), very long prompt (clamp), exotic rig (canonicalize or fall back), pose with extreme joint angles (the fallen-pose guard in `AnimationManager` already rejects retargets that tip the avatar — respect it).

## Definition of done
- [ ] Reachable: typing/clicking a pose on `/agent-screen` makes the live avatar perform it.
- [ ] Real pose resolution + real avatar GLB driven via canonical retargeting (network/asset calls visible).
- [ ] Hover / active / focus states on the task bar and pose quick-pick chips.
- [ ] All five states implemented (including default-rig fallback, never a T-pose).
- [ ] Verified on at least three rig conventions (e.g. Mixamo, VRM/VRoid, simple rig).
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); add a `tests/glb-canonicalize.test.js` case for any new bone mapping.
- [ ] Verified live in a browser against `npm run dev` (port 3000).
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag `feature`): "Request a pose and the agent's 3D avatar performs it live — wave, bow, warrior stance — on any rig, smoothly retargeted, no T-poses." Then `npm run build:pages`.

## Non-negotiables
- **Avatar animation is universal — no rig allowlist.** Any humanoid drives the canonical clip library via `glb-canonicalize` → `animation-manager`; a new skeleton convention gets a bone mapping + test, never a hardcoded curated list. A non-drivable prop falls back to the default rig, never a bind-pose T-pose.
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another token anywhere in pose copy, chips, or log.
- No mocks, no fake data, no `setTimeout` fake transitions, no TODOs, no stubs. Real pose data, real retargeting.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
