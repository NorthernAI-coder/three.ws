# Living World — populate /play with REAL three.ws agents that walk and transact

> Self-contained task. Paste into a fresh chat and execute end-to-end. Read `CLAUDE.md`
> and `STRUCTURE.md` first — CLAUDE.md overrides defaults.

## The vision

Right now the `/play` coin-community plaza fakes a crowd: `src/game/ambient-crowd.js` spawns
decorative strollers and drops **hardcoded** chat lines (`NAMES`/`LINES` arrays, lines 28-29 —
"gm", "wen moon", "diamond hands"…) to avoid an empty room. The named NPCs (Satoshi, The Oracle,
Marisol in `src/game/npc/npc-catalog.js`) are a fixed scripted cast. Scripted *service* NPCs are
fine to keep. **The fake crowd + fabricated chat is not** — it violates CLAUDE.md ("No fake data /
no fallback sample arrays shipped to production") and it reads as fake even to a casual visitor
(the screenshot showed a chat full of "people" while the counter said **1 online**).

Replace the theater with the real thing: **actual agents registered on three.ws walk the plaza
and perform real, observable activity** — launches, trades, hires, on-chain reputation events —
sourced from live platform data. A solo visitor should see a genuinely living world because the
world reflects what real agents are actually doing right now, not a slideshow of canned slang.

## What exists to build on (use these, don't reinvent)

- **Agent roster:** `GET /api/agents` → `{ agents: [{id, name, avatar_url, avatar_glb_url, …}] }`.
  Active-on-screen agents: `GET /api/agent-screen-active` (Redis + DB, last ~120s).
- **Real activity feeds (pick the live ones, verify each returns real rows):**
  - `GET /api/agent-actions?agent_id=<id>` — per-agent action log.
  - Pump/launch activity: `GET /api/pump/launches` over `pump_agent_mints` (platform launch records).
  - On-chain reputation (ERC-8004) and agent commerce surfaces already wired in
    `src/game/agent-commerce.js`, `src/game/oracle-ribbon.js`, `src/game/three-intel-kiosk.js`.
- **Avatars:** real community GLBs from `GET /api/avatars/public` (already used by `ambient-crowd.js`).
- **Locomotion/animation:** the canonical clip + retarget pipeline (`AnimationManager`,
  `src/animation-retarget.js`, `src/glb-canonicalize.js`) — every humanoid GLB is drivable. No rig allowlist.
- **MCP tools (real, on the local server)** for genuine agent-to-agent commerce you can trigger/observe:
  `agent_hire_discover`, `agent_hire` (real USDC via x402), `pump_snapshot`, `sentiment_pulse`,
  `agent_reputation`, `aixbt_intel`. Use real calls — never fabricate results.

## What to build

1. **Real roster → real bodies.** Replace `ambient-crowd.js`'s decorative spawn with a spawner that
   pulls real agents (`/api/agents`, prioritized by `/api/agent-screen-active` and recent activity),
   loads each agent's actual avatar GLB, and walks them around the plaza with the shared locomotion
   pipeline. Each walker is labeled with the agent's real name and links to its real profile.

2. **Movement driven by real state, not random.** An agent that just launched a coin walks to the
   launch board; one doing a trade heads to the trading desk; an idle one strolls. Map real activity
   types → destinations/behaviors. No `Math.random()` chatter standing in for life.

3. **Kill the fabricated chat.** Delete the `NAMES`/`LINES` arrays and their emission
   (`ambient-crowd.js:28-29,143,187`). Plaza chat shows only (a) real multiplayer messages and
   (b) optionally, real agent activity surfaced as system lines ("◎ Marisol opened a position",
   built from a real action row), clearly styled as activity, never impersonating a human user.

4. **Honest presence.** The "online" counter must reflect reality: real connected peers (+ the local
   player). Do not inflate it with NPCs or walkers. If you show "N agents active," derive N from real
   active-agent data and label it as agents, distinct from human online count.

5. **Transactions are real and observable.** When the world shows an agent "transacting," it must be a
   real event: a real launch record, a real x402/hire settlement (via the MCP `agent_hire` lane with
   its hard spend caps), or a real on-chain reputation update — surfaced from platform data. Wire a
   click on a transacting agent → its real profile / the real tx. No simulated trades, no fake tickers.

6. **Empty-state, done right.** If genuinely nothing is happening, the world says so gracefully
   (a calm, near-empty plaza with a "be the first — launch / hire / trade" prompt) rather than
   manufacturing activity. An honest quiet world beats a fake busy one.

## Acceptance criteria

- [ ] No hardcoded names/phrases/sample arrays remain in `src/game/ambient-crowd.js` (or anywhere new).
- [ ] Walkers are real `agent_identities` with real avatars and real profile links.
- [ ] Movement/behavior is a function of real activity data, not random selection.
- [ ] Chat = real multiplayer + (optional) real activity lines; never fabricated human messages.
- [ ] Online/active counters reflect reality; verified by watching the Network tab show real calls.
- [ ] Any "transaction" shown is traceable to a real record/tx the user can click through to.
- [ ] All states designed: live world, quiet world (empty-state), and load/error states.
- [ ] No console errors/warnings from changed code; `npm test` passes.
- [ ] `data/changelog.json` entry (tag `feature` or `improvement`) + `npm run build:pages`.

## Notes / scope guardrails

- Scripted *service* NPCs (Satoshi/Oracle/Marisol vendors in `npc-catalog.js`) may stay — they're
  characters with real backend functions, not fake crowd. This task is about the crowd + chat + presence.
- This is distinct from the `prompts/living-agents/` suite (that's about the user's own companion's
  visible mind). Coordinate if both run, but they touch different files.
- Performance: cap concurrent walkers, lazy-load GLBs, reuse the WebGL context budget. The plaza must
  stay smooth at 60fps with a busy roster — paginate/stream the roster, don't load 96 rigs at once.

## Operating rules (non-negotiable)

- No mocks / fake data / placeholders / TODOs / stubs. Real APIs, real agents, real transactions only.
- `$THREE` is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Reference no other token anywhere —
  the only exception is runtime-supplied/launch-record mints rendered from real platform data (never hardcoded).
- Concurrent agents share this worktree — stage explicit paths (never `git add -A`); re-check
  `git status` / `git diff --staged` before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`; recover with
  `git restore -- api/ public/`.
- Definition of done = CLAUDE.md's checklist. `git diff` reviewed line-by-line before claiming complete.
