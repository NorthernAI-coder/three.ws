# 05 — Live Avatar Forge

> **Mission (one line):** An agent takes a text prompt and forges a 3D avatar on camera — the GLB materializing in the avatar panel, then auto-rigging and animating itself — a real "watch it create" generation moment.

## The watchable moment
On `/agent-screen?agentId=…` a viewer (or the task bar) drops a prompt: "a friendly round robot mascot, glossy white plastic." The activity log narrates "Forging on the free TRELLIS lane…", a progress state ticks through real generation stages, and then a GLB *appears* in the Avatar Cam panel via the three.ws viewer — and seconds later it starts breathing in an `idle` clip and `wave`s. From a sentence to a rigged, animated 3D character, live. It's the kind of thing people screenshot mid-generation.

## Who benefits
- **Viewer:** watches a real text-to-3D pipeline produce a usable, animated avatar — generative magic with no install, no cost.
- **Agent owner:** their agent demonstrates a creative skill on demand; forged avatars can become the agent's own look or shareable assets.
- **Platform:** showcases the free NVIDIA NIM TRELLIS forge + the universal avatar animation system, linking the forge, the viewer, and the avatar pipeline into one live demo.

## Where it lives
- **Surface:** `/agent-screen?agentId=…` panel (the forge + avatar viewer); a card on `/agents-live` shows the latest forged avatar.
- **Entry points (verified to exist):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (task bar + Avatar Cam panel)
  - `src/shared/agent-screen-client.js` (`createAgentScreenClient`)
  - `mcp-server/src/tools/forge-free.js` (`forge_free` — free TRELLIS text→3D, returns `glbUrl` + viewer link)
  - `mcp-server/src/tools/forge-avatar.js` (avatar-shaping path)
  - `src/animation-manager.js` (`AnimationManager`, `play('idle')`, `playOnce('wave')`, `supportsCanonicalClips()`)
  - `src/glb-canonicalize.js` (bone-name canonicalization for retarget) + `src/animation-retarget.js`

## Data flow (source → transform → render)
1. **Source:** a prompt from the `/agent-screen` task bar or a viewer queue. The forge runs `forge_free` (drives `/api/forge` on the free NVIDIA NIM Microsoft TRELLIS text→3D lane) — no payment, no key, no wallet.
2. **Transform:** generation proceeds through real stages (queued → geometry → texturing → GLB ready). `forge_free` returns a durable `glbUrl`, a three.ws viewer link, the tier used, and the backend that produced it.
3. **Transport:** the agent `screenPush`es each stage as `POST /api/agent-screen-push` `{ frame: { activity, type: 'analysis' } }`, and the final frame carries the `glbUrl` + viewer link in the sidecar. Viewers receive it over `GET /api/agent-screen-stream`.
4. **Render:** the activity log narrates each stage; when the `glbUrl` arrives, `src/agent-screen.js` loads it into the Avatar Cam panel (the same meshopt-aware `GLTFLoader` it already builds), canonicalizes its bones via `glb-canonicalize.js`, retargets the pre-baked clips, and plays `idle` then `wave` — gated by `AnimationManager.supportsCanonicalClips()`.

## Build spec
1. Add a forge action to the task bar in `src/agent-screen.js`: a prompt input + "Forge" button that posts the prompt to the agent's forge path (the agent runs `forge_free`). Wire hover/active/focus states; disable while a forge is in flight.
2. The forge loop (`workers/agent-forge/index.js`, new) calls `forge_free`, and at each real generation stage `screenPush`es a `type: 'analysis'` line; the final push includes `glbUrl` + `viewerUrl` in the frame sidecar. Progress is driven by the real pipeline stages only — no `setTimeout` fake bar.
3. In `src/agent-screen.js`, on the final frame, load `glbUrl` into the Avatar Cam scene using the existing `getAvatarLoader()` meshopt loader; clone via `SkeletonUtils`, run `glb-canonicalize.js` bone mapping, then drive `AnimationManager`: `await play('idle')`, then `playOnce('wave', { settleTo: 'idle' })`.
4. If `supportsCanonicalClips()` is false (non-humanoid/no skin), display the GLB statically in the viewer with a "static model — no rig to animate" note rather than forcing a T-pose.
5. Add a viewer-link button that opens the returned three.ws viewer URL in a new tab (`rel="noopener"`), and a "use as agent avatar" affordance that points at the existing avatar-set flow.
6. In `src/agents-live.js`, render the latest forged avatar thumbnail (first frame after load) + "forged: <prompt>" in `.al-card-action` so the wall shows fresh creations.

## Files to create / modify
- `workers/agent-forge/index.js` — run `forge_free`, push staged progress + final GLB url (create).
- `src/agent-screen.js` — task-bar forge input, load+canonicalize+animate the GLB, viewer link (modify).
- `pages/agent-screen.html` — forge prompt input + "use as avatar" / viewer-link buttons (modify).
- `src/agents-live.js` — show latest forged avatar + prompt on the card (modify).
- `tests/forge-frame.test.js` — unit test for the pure stage→narration + final-frame sidecar parse (create).

## Real integrations (no mocks, ever)
- `forge_free` (`mcp-server/src/tools/forge-free.js`) → `/api/forge` on the **free** NVIDIA NIM Microsoft TRELLIS text→3D lane — real GLB generation, no payment.
- GLB load/animation: real meshopt-aware `GLTFLoader`, `glb-canonicalize.js` + `animation-retarget.js`, `AnimationManager`.
- Transport: `api/agent-screen-push.js` + `api/agent-screen-stream.js`.
- Credentials: `NVIDIA_API_KEY` server-side for the forge lane, `AGENT_JWT`/`AGENT_ID` for the worker push. The free lane needs no payment/wallet. Locate in `.env` / `vercel env`; if missing, ask once then proceed.

## Every state designed
- **Loading:** the Avatar Cam panel shows a skeleton + a real staged progress label ("texturing…") driven by actual pipeline frames; the Forge button shows an in-flight spinner state.
- **Empty:** before any forge, the panel reads "Type a prompt and watch a 3D avatar get built, rigged, and animated — live." with the prompt input focused.
- **Error:** generation failure → an actionable line ("forge lane busy — retrying" or "prompt rejected, try a concrete object") with a retry affordance; GLB load failure → "model produced but failed to load — open in viewer" link; never a silent void.
- **Populated:** the hero state — GLB loaded, breathing in `idle`, waving.
- **Overflow:** empty prompt is blocked with inline guidance; a very long prompt is trimmed to the TRELLIS ~77-char conditioning window with a note; rapid repeated forges queue (one in flight at a time); a non-riggable GLB shows static with the note.

## Definition of done
- [ ] Reachable from `/agent-screen` (and forged avatars visible on `/agents-live`).
- [ ] Real `forge_free` call visible in the network path; a real GLB loads and animates.
- [ ] Hover / active / focus states on the Forge button, prompt input, and viewer link.
- [ ] All five states implemented.
- [ ] No console errors or warnings from this code.
- [ ] `npm test` passes; `tests/forge-frame.test.js` added for the pure stage/sidecar logic.
- [ ] Verified live in a browser against `npm run dev` (port 3000): a prompt produces a GLB that loads, rigs, and animates.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag: `feature`) — e.g. "Live Avatar Forge: type a prompt and watch an agent build, rig, and animate a 3D avatar in real time, free." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Avatar forging has no token surface — never introduce one; never name or promote any non-$THREE mint in prompts, copy, or narration.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. Progress is driven by real TRELLIS pipeline stages; the GLB is a real generated artifact.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
