# IRL-Live — Multiplayer World-Anchored 3D AI Agents

The program that turns `three.ws/irl` from a single-user AR toy into a **shared,
persistent, multiplayer layer of 3D AI agents anchored to real-world places**.

Anyone who opens `three.ws/irl` at a location, points their camera, and sees the
agents other people have placed there — locked to the real world, aware of the
viewer, tappable for a profile + services card, and payable via x402. Owners
manage their placed agents (balance, skills, reputation, outfit, location,
interaction inbox) from a dashboard anywhere on earth.

---

## The four pillars (what the user asked for)

1. **Pick & lock** — choose which 3D AI agent is displayed and lock it into the
   real world so it stays put when you move the camera. *(Epic A)*
2. **Aware & interactive** — agents turn to face the viewer's camera (the
   "follow the cursor" trick, but the cursor is your phone). Tap one and a card
   pops up: name, info, reputation, services. *(Epic B)*
3. **Owner dashboard** — monitor your IRL agents: balance, skills/services,
   reputation, interaction prompts, outfit changes, and location — all
   remotely, even after you've left the spot. *(Epic C)*
4. **Multiplayer** — *anyone* at the location sees *anyone's* placed agent, live.
   Not just your own. *(Epic D)*

---

## What already exists (do NOT rebuild — extend)

Grounded in the current tree as of this plan:

| Piece | Location | State |
|---|---|---|
| IRL AR client | `pages/irl.html` + `src/irl.js` (~1424 lines) | Camera passthrough, gyro look (`cameraYaw`/`cameraPitch`), GPS watch, tap-to-place, avatar hot-swap picker, **Lock** button (`setLocked()` ~682), `savePin()` ~837, `loadNearbyPins()` ~901 (**already public / cross-user**), `spawnNearbyPin()` ~950, `loadPinGLB()` ~990, `openPinSheet()` ~1135, radar math ~1239, `tick()` ~1355 |
| Pins API + table | `api/irl/pins.js` (~213 lines) | Neon `irl_pins` (`id, user_id, agent_id, device_token, lat, lng, heading, avatar_url, avatar_name, caption, x402_endpoint, placed_at, expires_at`). GET nearby (public, haversine), GET `?mine=1`, POST, PATCH caption, DELETE |
| Owner dashboard page | `src/dashboard-next/pages/irl-placements.js` (~274 lines) | Lists your placed pins, reverse-geocode, remove — location management baseline |
| AR/XR infra | `src/ar/webxr.js`, `src/ar/quick-look.js`, `src/ar/scene-viewer.js`, `src/xr.js` | WebXR + iOS Quick Look + Android Scene Viewer entry points |
| Avatar picker | `src/avatar-picker.js` (`createAvatarPicker`) | Shared bottom-sheet picker, GLB hot-swap |
| Wardrobe / outfits | `src/avatar-wardrobe.js`, `src/agent-accessories.js` | Outfit + accessory system |
| Reputation | `GET /api/agents/solana-reputation?asset=` | Real Solana attestations — the canonical reputation source |
| Skills / services | `api/skills/index.js`, `api/skills/[id].js`, `api/skills/categories.js`, `api/skills-manifest.js` | Skill catalog + per-agent skills |
| Wallet / balance | `api/agents/solana-wallet.js`, `api/agents/x402/[action].js`, `api/billing/*` | Agent wallet + earnings |
| x402 client | already imported in `src/irl.js` and `src/marketplace.js` via `src/shared/x402-loader.js` | Pay-per-call flow |
| Realtime server | `wss://three-ws-multiplayer.fly.dev` (walk-server), client in `src/walk-net.js` | Existing multiplayer WS — reuse for IRL presence |
| Shared UI states | `src/shared/state-kit.js`, `src/shared/async-state.js` | Skeleton / empty / error / retry shells — use everywhere |

**Prior roadmap (folded into this program):** `tasks/irl/01-06`, `tasks/irl-xr/01-05`,
`tasks/task-irl-01/02/03`. Where a new task supersedes an old one it says so;
treat the old files as reference, not parallel work.

---

## Epics & task index

### Epic A — World-anchored locking ("stays put in real life")
- **A1** `A1-webxr-world-anchor.md` — WebXR hit-test reticle + real-world anchor placement (Android/Chrome). *L*
- **A2** `A2-anchor-persistence-schema.md` — Extend `irl_pins` to store a full anchor pose (height, orientation, accuracy); migrate `savePin`. *M*
- **A3** `A3-cross-user-anchor-consistency.md` — GPS+compass alignment + manual nudge calibration so every viewer sees the agent in the *same* real spot. *L*
- **A4** `A4-ios-gyro-anchor-fallback.md` — iOS Safari (no WebXR) world-lock via gyro+GPS dead-reckoning so the locked avatar stays anchored when panning. *M*

### Epic B — Agent awareness & interaction
- **B1** `B1-camera-aware-lookat.md` — Placed agents turn head/body to face the viewer's camera + idle gaze (the "follow the cursor" analog). *M*
- **B2** `B2-inspect-card-v2.md` — Rich tap card: name, info, reputation, services/prices. New `GET /api/irl/agent-card`. *M*
- **B3** `B3-real-interactions-profile-pay.md` — Wire View profile → `/agents/:id` and real x402 pay (supersedes `tasks/irl/02` + `03`). *M*
- **B4** `B4-raycast-tap-accuracy.md` — Reliable tap raycasting on billboard labels + meshes, nearest-agent proximity focus. *S*

### Epic C — Owner dashboard for IRL agents
- **C1** `C1-dashboard-overview.md` — Extend `irl-placements.js`: balance, status, last-seen, interaction count per placed agent. *M*
- **C2** `C2-skills-services-management.md` — Attach skills + set x402 service prices for an IRL agent from the dashboard. *M*
- **C3** `C3-reputation-surface.md` — Show reputation/attestations for the placed agent + manage link. *S*
- **C4** `C4-interaction-inbox-notifications.md` — New `irl_interactions` table; log taps/pays/messages; owner inbox + notifications. *L*
- **C5** `C5-remote-location-management.md` — Map with draggable marker to relocate/remove pins from anywhere. *M*
- **C6** `C6-remote-outfit-change.md` — Change a placed agent's outfit remotely; propagate to the rendered GLB for all viewers. *L*

### Epic D — Multiplayer realtime
- **D1** `D1-realtime-pin-sync.md` — Live add/remove/update of nearby pins without reload (geohash rooms over the existing WS, with poll fallback). *L*
- **D2** `D2-live-viewer-presence.md` — Show who else is viewing a location; optional ghost markers of live viewers. *M*
- **D3** `D3-interaction-broadcast.md` — IRL interaction → owner realtime event + ambient reaction visible to co-located viewers. *M*
- **D4** `D4-moderation-safety-caps.md` — Content checks on caption/avatar, report flow, per-area density + per-user pin caps, rate limits. *M*

### Epic E — Cross-cutting polish
- **E1** `E1-permissions-onboarding.md` — Camera/motion/location permission flow with designed states (incl. iOS motion gesture). *M*
- **E2** `E2-performance-scale.md` — Distance culling, GLB LOD, concurrent-load cap, draw budget for dense areas. *M*
- **E3** `E3-deeplinks-share.md` — "View in IRL" from agent/avatar pages + screenshot composite share (supersedes `irl-xr/03` + `05`). *M*
- **E4** `E4-designed-states.md` — Empty/error/permission/unsupported-device states across all IRL surfaces. *S*

---

## Recommended run order & dependency graph

**Critical path (do first):** A2 → A1/A4 → B1/B2/B3 → D1 → D3/C4.

```
A2 (schema) ─┬─> A1 (webxr anchor) ─┐
             └─> A4 (ios fallback) ─┴─> A3 (cross-user consistency)
B2 (card api) ─> B3 (interactions) ; B1 (look-at) ; B4 (raycast) independent
D1 (realtime sync) ─> D2 (presence) ; D3 (interaction broadcast) ─> C4 (inbox)
C1 ─> C2, C3, C5, C6 (dashboard surfaces, after overview)
E1, E2, E4 land alongside any epic; E3 after B/D.
```

Suggested phased execution:
1. **Phase 1 — Anchoring foundation:** A2, A1, A4, E1.
2. **Phase 2 — Make agents feel alive:** B1, B2, B3, B4, E4.
3. **Phase 3 — Multiplayer live:** D1, D2, D4, A3, E2.
4. **Phase 4 — Owner control + feedback loop:** C1, C4, D3, C5, C6, C2, C3, E3.

---

## Ground rules for every task

- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token anywhere.
- **No mocks, no placeholders, no fake data.** Real APIs, real RPC, real wallet, real DB.
- **Every state designed** — loading/empty/error/permission-denied/unsupported via `src/shared/state-kit.js`.
- **Errors at boundaries** — every `fetch`/sensor call fails into a retryable state, never a blank screen.
- **Mobile-first** — this is a phone-camera product. Test at real device widths; mind iOS Safari quirks (motion permission gesture, no WebXR).
- **Each task file is self-contained** — copy its prompt into a fresh agent and it can execute without this README.
