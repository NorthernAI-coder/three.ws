# Prompt 01 — Arena scaffold + multiplayer presence

You are a senior engineer on three.ws. Build the foundational surface for the
**Omniology Arena**: a new standalone 3D world route where a player spawns into a
lit space, moves with keyboard/touch, and sees other real players present via the
existing Colyseus multiplayer server — with **zero changes to the multiplayer
server**. This is the skeleton that prompts 02–06 plug into.

## Read first (required)
- `docs/omniology-arena/README.md` and `docs/omniology-arena/CONTRACTS.md`
- `CLAUDE.md` (operating rules — non-negotiable: no mocks, no stubs, finish what you write, design every state)
- `pages/play.html` — the reference page (canvas `#kx-canvas`, loading `#kx-loading`, `<meta name="game-server">` ~line 24)
- `src/game/coincommunities.js` — reference world bootstrap. Study: `enter()`, the render loop `_loop()` (~2706–2745), local movement `_stepLocal()` (~2755–2800), camera `_updateCamera()` (~2848–2860), and `RemotePlayer` (~126–284). Constants: `MOVE_SPEED 4.2`, `RUN_SPEED 8.0`, `GRAVITY 15`, `JUMP_VELOCITY 5.5`, `REMOTE_LERP 0.18`, joystick deadzone `0.12`.
- `src/game/community-net.js` — the Colyseus client wrapper. Note `ROOM_NAME = 'walk_world'`, the `joinOrCreate('walk_world', { token, tier, name, avatar, … })` call, and the server-URL resolution order (`window.GAME_SERVER_URL` → localhost → `<meta name="game-server">` → `VITE_GAME_SERVER_URL`).
- `src/game/avatar-rig.js` — `buildAvatar(rig, url, anim)`, `resolveAvatarUrl()`, the animation manifest at `/animations/manifest.json`.
- `multiplayer/src/index.js` — confirm `gameServer.define('walk_world', WalkRoom).filterBy(['coin','tier'])`, and read `WalkRoom.onAuth` to confirm an **open** join (no holder/play gate) works when `tier:''` and `PLAY_GATE_MINT` is unset. Report what you find — if a global gate would block open access, surface it (do not work around it silently).

## Verify before you build
- Check whether `pages/arena.html`, `pages/play/arena.html`, and `src/play-arena.js` already exist and what they are (`vite.config.js` inputs ~468–479, `vercel.json` routes ~878–892). **Do not collide.** Build the new surface at route **`/arena/omniology`** (page `pages/arena/omniology.html`, vite input key `arena-omniology`, vercel route `/arena/omniology/?` → that html). If an existing arena page is clearly unused scaffolding, note it but do not delete without cause.

## Build
1. **Page** `pages/arena/omniology.html`: copy the structure of `pages/play.html` — a full-screen `<canvas>`, a designed loading overlay, and the `<meta name="game-server" content="…">` tag (same value as play.html). Add `<meta name="omniology-base" content="">` (empty for now; CONTRACTS §3). Module script → `/src/game/arena/omniology.js`.
2. **Wiring**: add the vite input (`vite.config.js`) and the vercel route (`vercel.json`). Match the surrounding formatting exactly.
3. **Bootstrap** `src/game/arena/arena.js`: an `OmniologyArena` class that owns `scene`, `renderer` (shadows on, `PCFShadowMap`), `camera`, a render loop, and a `registerUpdatable(obj)` registry whose members get `update(dt)` each frame (per CONTRACTS §2.4). Provide an `anchors` field initialized to sensible defaults now (a spawn point, a few forward screen positions, a desk position) — prompt 02 will overwrite these from the venue GLB. Expose `dispose()` with full teardown (geometry/material/texture disposal, listener removal) modeled on `coincommunities.js leave()`.
4. **Entry module** `src/game/arena/omniology.js`: read player name/avatar (reuse whatever `/play` uses to resolve the local avatar and the boot-avatar preview), instantiate `OmniologyArena`, and connect multiplayer via `CommunityNet` with `coin: { mint: 'arena:omniology', name: 'Omniology Arena', symbol: 'OMNI', image: '' }`, `tier: ''`. Render the local avatar and all remote players (reuse `RemotePlayer` or extract its logic — prefer reuse). Name labels, interpolation at `REMOTE_LERP`, and the 15Hz move send must work.
5. **Controls**: keyboard + on-screen joystick + drag-to-orbit camera, identical feel to `/play`. Mobile must work (touch joystick, touch drag). Reuse the `/play` input code rather than reinventing it.
6. **Environment placeholder**: a simple lit ground + sky/fog so the space reads as a real room (prompt 02 replaces it with the venue). Not a void.

## Acceptance criteria
- Visiting `/arena/omniology` (via `npm run dev`, port 3000) loads with a designed loading state, then a navigable lit space.
- Two browser tabs see each other move in real time, with name labels and smooth interpolation. Confirm in the Network/WS tab that it joined a `walk_world` instance keyed to `arena:omniology` (isolated from real coin worlds).
- No multiplayer-server file was modified. No console errors or warnings from your code.
- Local + remote avatars load and animate (idle/walk), no T-pose flash.
- `dispose()` fully tears down on navigation away (no leaked rAF, listeners, or GPU memory).
- `npm test` still passes. Review your own `git diff` before declaring done.

## Hand-off to prompt 02
Leave clear `anchors` defaults and a documented way for the venue loader to
replace them. Do not author the venue here.
