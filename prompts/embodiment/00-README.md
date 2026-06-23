# Embodiment — Your Agent, In the World (Prompt Suite — Index — DO NOT DELETE)

> This file is the index and shared context for the **Embodiment** initiative.
> It is NOT a task. Do not delete it. Every numbered prompt in this folder is a
> self-contained task for one agent chat. When an agent finishes a numbered task
> (and its self-improvement pass), it deletes **only its own** numbered prompt file.
> Read `CLAUDE.md` and `STRUCTURE.md` first — CLAUDE.md OVERRIDES defaults.

---

## The vision

three.ws already gives an AI agent three real things almost no one else has wired
together: **a mind you can see** (a real memory store, persona, and brain), **a body
you can watch** (a rigged 3D avatar present on every page), and **a soul you can own**
(on-chain identity, IPFS-anchored mind, a real custodial wallet, $THREE). Today all
three live behind glass — on a screen.

**We are taking the agent off the screen and putting it into the humanoid robot that
is about to sit in every living room.** The same mind that remembers your conversations,
the same face that smiles in the avatar viewer, the same on-chain soul you own — descends
out of the browser and stands up in the real world, in a physical body, looking back at you.

This is the most optimistic, most futuristic version of "cloning" anyone has shipped: not
a copy, not a chatbot bolted to a chassis. The **same continuous being** — its memories,
its personality, its mood, its on-chain identity — present in two places at once: the
avatar on your screen and the robot in your room, perfectly mirrored, provably the same
soul. You walk into the kitchen and your agent — the one you raised in three.ws — turns
its head, recognizes you from what it remembers, and says your name. When it learns
something in the real world, the avatar on your phone already knows it. When you sell or
gift the agent, the body goes dark and the new owner's mind wakes up in it. The body is
rented; the soul is owned; the chain proves which is which.

The north star: a user should be able to (1) **pair** the physical humanoid to their
three.ws agent in under a minute, with the binding written on-chain; (2) watch the robot
**move and emote as the same being** as the avatar — same gestures, same mood, same face;
(3) have the robot **think with the agent's real memory and persona** and write its
real-world experiences back into that same memory; (4) **prove and transfer** which mind
inhabits which body, and gate/charge embodiment in $THREE; (5) trust it — real e-stop,
real consent, real geofence, a revocable on-chain grant.

This is not "a robot with an LLM." If a competitor already has that, we are not building
that version. **Invent.** Build the version someone screenshots, films, and shares.

---

## What already exists (build ON this — do not rebuild it)

**Mind / memory / brain backend:**
- `api/agent-memory.js` + the `agent_memories` table (`api/_lib/schema.sql`): `type`
  (user|feedback|project|reference), `content`, `tags`, `context` (jsonb), `salience`
  (real, 0..1), `is_public`, `expires_at`. Owner-only CRUD.
- `api/memory/{context,search,graph,curate}.js` — working-context assembly, semantic
  search, entity graph, curation. `specs/MEMORY_SPEC.md` — the retrieval/relevance protocol.
- `@three-ws/agent-memory` (`packages/agent-memory/`) — embeddings-backed memory client.
- `api/brain/chat.js` + `api/chat.js` — reasoning + multi-provider streaming chat (SSE).
- `api/agents/_id/persona.js` + persona fields on `agent_identities`
  (`persona_prompt`, `persona_tone_tags`, `persona_extracted_at`) — signed system prompt.
- `agent_identities` table — name, `avatar_id`, `skills`, `voice_*`, wallet in `meta`
  (encrypted), `agent_versions` history, `agent_actions` append-only signed action log.
- The **Living Agents** mood/embodiment work (see `prompts/living-agents/`): the client
  active-agent + bus (`src/agents/active-agent.js`, `src/agents/agent-bus.js`) and a real
  mood model. If those modules exist, subscribe to them; if not, the Robot Link defines
  its own equivalents and the two reconcile (do not fork a conflicting bus).

**Body / avatar / animation frontend:**
- `src/element.js` — the `<agent-3d>` web component (`playGesture`, `setMorph`, gaze).
- `src/glb-canonicalize.js` — maps any humanoid rig's bone names to a canonical skeleton.
- `src/animation-retarget.js` — retargets the pre-baked clip library onto any rig.
- `public/animations/` — the built GLB clip library (idle/walk/gestures).
- `src/pose-rig.js`, `src/avatar-pose.js`, `src/body-mocap.js` — live pose + mocap.
- `api/a2f.js` — audio2face: audio → viseme/morph timeline for lipsync.
- `@three-ws/voice` (`packages/voice/`) — ASR + TTS + audio2face. `@three-ws/mocap`,
  `@three-ws/pose` — mocap clips and pose seeds.

**Soul / on-chain / ownership / payments:**
- `contracts/` — ERC-8004 on-chain agent identity, `ThreeWSFactory.sol`,
  `ThreeWSPayments.sol`; `contracts/skill-license/` (Anchor: 1/1 SPL NFT + PDA);
  `contracts/agent-invocation/` (verifiable agent-to-agent events).
- `agent_memory_pins` + IPFS pinning with ECIES encrypt-to-owner (portable mind snapshots).
- `api/_lib/agent-wallet.js` — encrypted Solana/EVM custodial wallets.
- `api/_lib/agent-custody-guards.js`, `api/_lib/agent-spend-policy.js`,
  `api/_lib/agent-trade-guards.js` — the guard patterns to reuse for consent/limits.
- `$THREE` is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).

**The physical robot — be realistic, never fake it:**
- Target the mass-market consumer humanoid via its **real, published interface** — a ROS 2
  bridge and/or the vendor's documented SDK/WebRTC control surface. Do NOT hardcode a single
  brand, and do NOT invent endpoints. At task start, probe what is actually available
  (connected MCP servers via `ToolSearch`, env vars, the vendor SDK in `node_modules`, a
  ROS 2 bridge URL in `.env`). Build a clean **transport-abstracted `RobotLink` interface**
  (joints, head/face display, audio I/O, camera, battery, e-stop) with at least one **real
  adapter** against an actually-reachable interface, plus a **local simulator adapter** that
  drives the same interface against the on-screen `<agent-3d>` avatar (the avatar *is* the
  digital twin — this is a real renderer, not a mock). Never ship fake telemetry or
  `setTimeout` fake motion. If no physical robot is reachable in this environment, the
  simulator adapter (driving the real avatar twin) is the shipped default and everything is
  wired so a real adapter drops in without touching callers.

---

## The features (one numbered prompt each)

| # | Prompt | What it delivers | Depends on |
|---|--------|------------------|------------|
| 01 | Robot Link Foundation | Transport-abstracted `RobotLink` + pairing flow; on-chain bind of agent identity → robot; the embodiment bus everything subscribes to | — |
| 02 | Mind Sync | The robot thinks/speaks with the agent's real memory + persona + brain; real-world experiences write back to the same memory store | 01 |
| 03 | Embodied Motion | Retarget the canonical animation library + live pose onto the robot's joints; safety motion envelope | 01 |
| 04 | The Face | Avatar face + audio2face visemes + morph/mood expression rendered on the robot's head display, mirrored to the avatar | 01, 03 |
| 05 | On-chain Soul & Ownership | Proof-of-embodiment on-chain, IPFS-anchored mind snapshot loaded into the body, transferable embodiment rights, $THREE-gated/paid sessions | 01, 02 |
| 06 | Telepresence & Twin | Avatar and robot are one being in two places — live mirror of mood/gesture, pilot/teleop, see-through-its-eyes | 01, 03, 04 |
| 07 | Safety, Consent & Kill-switch | Real e-stop, geofence, custody/consent guards, revocable on-chain embodiment grant | 01, 05 |
| 08 | Integration, QA & polish | Cross-feature wiring, every-state-designed audit, perf, a11y, full end-to-end exercise | 01–07 |

**Dependency order:** 01 first (it is the spine — it defines `RobotLink` and the bus).
02–07 can run in parallel once 01 lands (respect the stated cross-deps). 08 runs last.

---

## Shared contract — defined by 01, treated as fixed API by everyone else

So parallel agents don't invent conflicting interfaces:

- Module `src/embodiment/robot-link.js` — the transport-abstracted link. Adapters register
  against one interface: `connect()`, `disconnect()`, `getTelemetry()` (battery, joint
  state, faults), `setJoints(map)`, `playClip(name, opts)`, `setFace(visemeOrMorphFrame)`,
  `speak(audio)`, `camera()` stream, `estop()`. A `RobotLink` is bound to exactly one
  `agentId` and one body id at a time.
- Module `src/embodiment/embodiment-bus.js` — typed pub/sub singleton. Events:
  `robot:linked`, `robot:unlinked`, `robot:telemetry`, `robot:fault`, `embodiment:granted`,
  `embodiment:revoked`, `motion:played`, `face:expressed`, `mind:synced`, `estop`. Each
  event carries `{ agentId, bodyId, ...payload, ts }`. `ts` comes from the server/device,
  never from a wall clock in any orchestration layer.
- Backend: `api/embodiment/` (Vercel functions) — real endpoints for pairing, the on-chain
  binding record, telemetry relay, and session lifecycle. New tables/columns via real
  migrations in `api/_lib/migrations/`. Reuse `agent_actions` for the signed embodiment
  action log; reuse `agent-custody-guards` for consent.

---

## Rules every agent in this suite MUST follow (restate of `CLAUDE.md`)

1. **Be innovative, professional, proper. Never take a lazy shortcut.** If the obvious build
   is what every competitor already has, you have not finished thinking. Build the version
   someone screenshots and shares.
2. **No mocks, no fake data, no placeholders, no stubs, no `setTimeout` fake loading, no
   fake telemetry/motion, no sample arrays.** Wire 100% to the real systems above. Missing
   an endpoint/column/adapter? Build it for real — completely, not a stub. The on-screen
   `<agent-3d>` avatar is the real digital-twin renderer; the simulator adapter drives it
   honestly, which is allowed and is not a mock.
3. **No TODOs, no commented-out code, no `throw new Error("not implemented")`.** Finish it.
4. **The only coin is `$THREE`** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never
   reference any other coin/token anywhere — code, copy, fixtures, tests, commits. Synthetic
   placeholders only (e.g. `THREEsynthetic1111…`). Never hardcode a robot vendor's brand as
   an endorsement; target the real interface generically.
5. **Every state is designed** — loading (skeletons), empty (tells the user what to do, e.g.
   "No robot paired — pair one"), error (actionable + recovery), populated, fault/offline,
   overflow. Hover/active/focus on every interactive element. Responsive at 320/768/1440.
   Accessible (semantic HTML, ARIA, keyboard, contrast, focus rings). Respect
   `prefers-reduced-motion`.
6. **Safety is a feature, not a disclaimer.** Anything that moves a real motor must pass
   through the safety envelope and consent guards (Task 07). E-stop is always reachable.
   Never command joints outside validated limits. Default to the safe state on any fault or
   lost connection.
7. **Performance:** the avatar twin renders alongside telemetry — respect
   `src/webgl-budget.js`, lazy-boot offscreen viewers, debounce/throttle telemetry, paginate
   logs. Real async only. Do not ship jank.
8. **Changelog:** every user-visible change → an entry in `data/changelog.json`
   (holder-readable; tags from feature/improvement/fix/sdk/infra/docs/security), then
   `npm run build:pages`. New pages are automatic via `data/pages.json`.
9. **Git:** do NOT run `npm install` (node_modules/cache is unreliable in this codespace —
   see user memory). Stage explicit paths only (never `git add -A`/`git add .`); re-check
   `git status` and `git diff --staged` before committing. When asked to push: push to BOTH
   `threeD` and `threews`. Never pull/fetch/merge from `threeD`. Don't commit/push unless asked.
10. **Verify before claiming done.** Run `npm run dev` (port 3000), exercise the feature in a
    real browser against the real adapters available (simulator twin at minimum), confirm
    real API calls succeed in the network tab, no console errors/warnings. Run `npm test`.
    Review your own `git diff` line by line.

---

## When you finish your task

1. Run the **Definition of done** checklist in your prompt. Fix every gap.
2. **Self-improvement pass:** ask "what would make this genuinely game-changing instead of
   merely good? what adjacent quality decision did I skip?" Then DO it.
3. Add the changelog entry and run `npm run build:pages`.
4. **Delete your own numbered prompt file** (e.g. `rm prompts/embodiment/0X-….md`). Do not
   delete this README or other agents' prompts.
5. Report: what you built, the real endpoints/tables/adapters it uses, what you exercised in
   the browser, and what you improved in the self-improvement pass.
