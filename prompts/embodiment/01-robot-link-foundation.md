# Task 01 — Robot Link Foundation (the spine: pair a body to a mind)

> Read `prompts/embodiment/00-README.md` and `CLAUDE.md` first. This is the spine —
> 02–07 import the interfaces you define here. Define them well; don't fork them later.

## Mission

Build the real, transport-abstracted link between a three.ws agent and a physical humanoid
robot, the pairing flow that binds them, and the event bus every other surface subscribes
to. After this task, a user can pair the humanoid in their room to their agent in under a
minute, the binding is recorded on-chain, and every other embodiment feature has a clean,
honest interface to build on.

## The innovation bar

Pairing IRL hardware to a cloud identity is usually a QR code and a spinner. The
game-changer: pairing **feels like a soul descending into a body** — the on-screen avatar
visibly "transfers" into the physical robot (the avatar twin dims as the body wakes), the
binding is provably written on-chain in front of the user, and from that instant every
surface in three.ws knows "this agent now also has a body" and reacts.

## What to build

1. **`src/embodiment/robot-link.js`** — the transport-abstracted `RobotLink` interface
   exactly as specified in the README (`connect`, `disconnect`, `getTelemetry`, `setJoints`,
   `playClip`, `setFace`, `speak`, `camera`, `estop`), bound to one `agentId` + one `bodyId`.
   - **Adapter registry.** A `RobotLink` resolves a concrete adapter by transport. Ship:
     - A **real adapter** against whatever is actually reachable in this environment — probe
       at task start (connected MCP servers via `ToolSearch`; a ROS 2 bridge / WebRTC control
       URL in `.env`; a vendor SDK in `node_modules`). Implement against the real interface;
       do not invent endpoints.
     - A **simulator adapter** that drives the on-screen `<agent-3d>` avatar as the digital
       twin (real renderer — `src/element.js` / `src/viewer.js`). This is the shipped default
       when no hardware is reachable, and is the canonical local-dev body.
   - Connection lifecycle with real reconnect/backoff and a defined safe state on disconnect.
2. **`src/embodiment/embodiment-bus.js`** — the typed pub/sub singleton with the README's
   event set. Reconcile with the Living Agents bus if present (subscribe/bridge, don't fork).
3. **Backend `api/embodiment/`** (real Vercel functions):
   - `pair.js` — start a pairing session, verify ownership of the agent, register the body.
   - `link.js` — read/update the active binding for an agent; session lifecycle.
   - `telemetry.js` — relay/persist the latest real telemetry; never synthesize it.
   - New table(s) via a real migration in `api/_lib/migrations/` (e.g. `agent_bodies`:
     `agent_id`, `body_id`, `transport`, `status`, `bound_at`, `meta` jsonb). Write the
     pairing/unpairing as signed entries in the existing `agent_actions` log.
4. **On-chain binding.** Record agent-identity → body binding on-chain using the existing
   identity/attestation contracts (ERC-8004 attestation or a `ThreeWSFactory`/agent-invocation
   event — reuse, don't deploy a parallel system). The UI shows the real tx/signature. The
   full ownership/transfer/payment layer is Task 05; here, just the canonical bind record.
5. **Pairing UI** — a real page/surface (e.g. `/agent/{id}/embody` or a tab in
   `pages/agent-edit.html`): discover/enter a body, consent, pair, see live telemetry
   (battery, joint state, faults), and the "soul descends" transition on the avatar twin.
   Designed empty/loading/error/fault/paired states.

## Wiring & real-API mandate

- Telemetry is real device/sim state only. No fabricated battery %, no fake joint angles.
- Ownership of the agent is verified server-side before any binding is written.
- The avatar twin is the real `<agent-3d>` renderer; respect `src/webgl-budget.js`.

## Definition of done

- [ ] `RobotLink` + adapter registry with a real adapter (against a reachable interface) and a
      simulator adapter driving the real avatar twin; clean disconnect → safe state.
- [ ] `embodiment-bus.js` emits/consumes the README event set; reconciled with any existing bus.
- [ ] `api/embodiment/{pair,link,telemetry}.js` + migration live and used by the UI; pairing is
      logged in `agent_actions`; binding written on-chain with a real tx shown to the user.
- [ ] Pairing UI reachable via navigation; every state designed; "soul descends" transition.
- [ ] No console errors/warnings; WebGL budget respected; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`) + `npm run build:pages`.

## Self-improvement pass

Make the binding feel real and owned: show the on-chain record as a verifiable badge, let the
user name the body, and emit `robot:linked` so the site-wide companion reacts ("I have a body
now"). Add the keyboard shortcut to summon the embody panel.

## When done

Delete this file. Report the `RobotLink` interface, the adapters shipped, the real endpoints
+ migration, and the on-chain binding mechanism used.
