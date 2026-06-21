# 17 — Agent profiles, Agent Studio & economy

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

An agent is the platform's atomic unit of value: people create one, give it a brain,
memory, body, money, and skills, publish a profile, build reputation, and let it earn
and delegate. If the creation wizard dead-ends, the Studio shows a "mounts here"
placeholder, a public profile 404s, or reputation is decorative, the supply side never
compounds and there's no economy to scale. The best version feels like Linear's polish
applied to "spin up an autonomous, earning, on-chain agent."

## Mission

Make the full agent lifecycle — create → configure (Brain · Memory · Body · Money ·
Skills, with a live avatar) → publish profile → earn reputation → appear in the activity
feed → delegate to other agents — complete, wired, and every state designed.

## Map (trust but verify — files move)

- **Creation wizard** — [src/create-agent.js](../../src/create-agent.js) (5 steps:
  basics → 3D model → skills → personality → review; writes through `/api/agents` and
  `/api/marketplace/agents/:id/publish`), [pages/create-agent.html](../../pages/create-agent.html)
  (route `/create-agent`).
- **Agent Studio (Brain/Memory/Body/Money/Skills)** — [pages/agent-studio.html](../../pages/agent-studio.html)
  (route `/agent-studio`; loads [src/studio/studio-shell.js](../../src/studio/studio-shell.js)
  which defines the five tabs + empty "mounts here" states),
  [src/studio/brain/](../../src/studio/brain) (`brain-mount.js`, `brain-studio.js`,
  `brain-graph.js`, `brain-compile.js`, `brain-runtime.js`, `brain-templates.js`,
  `brain-nodes.js`), [src/studio/memory/](../../src/studio/memory) (`memory-mount.js`,
  `memory-studio.js`, `memory-graph.js`, `memory-client.js`),
  [src/studio/agent-studio-store.js](../../src/studio/agent-studio-store.js),
  [src/studio/agent-presence.js](../../src/studio/agent-presence.js). Live avatar via
  [src/agent-avatar.js](../../src/agent-avatar.js) / [src/shared/agent-3d.js](../../src/shared/agent-3d.js).
  Note: **Brain and Memory mount real studios; Body, Money, and Skills currently render
  placeholder empty states** in `studio-shell.js` — finish them.
- **Launch/fees/knowledge studio (`/studio`)** — [public/studio/](../../public/studio)
  (`studio.js`, `launch-panel.js`, `fees-panel.js`, `knowledge-panel.js`; route `/studio`).
- **Public profiles** — [pages/profile.html](../../pages/profile.html) (route `/u/:name`),
  [pages/agent-detail.html](../../pages/agent-detail.html) + [src/agent-detail.js](../../src/agent-detail.js)
  + [src/agent-detail.css](../../src/agent-detail.css) (route `/agents/:id`),
  [api/agents/public.js](../../api/agents/public.js), [api/agents/[id].js](../../api/agents/[id].js),
  [api/agents/by-wallet.js](../../api/agents/by-wallet.js), [api/agents/featured.js](../../api/agents/featured.js).
- **Economy** — [pages/agent-economy.html](../../pages/agent-economy.html) +
  [src/agent-economy.js](../../src/agent-economy.js) (two 3D agents transacting real SOL;
  route `/agent-economy`), [src/agent-skills.js](../../src/agent-skills.js) and the
  `src/agent-skills-*.js` family, agent wallet via [src/agent-wallet.js](../../src/agent-wallet.js)
  (see prompt `18`).
- **ERC-8004 reputation** — on-chain registries in [contracts/src/](../../contracts/src)
  (`IdentityRegistry.sol`, `ReputationRegistry.sol`, `ValidationRegistry.sol`),
  [api/agents/8004/agent.js](../../api/agents/8004/agent.js), [api/agents/8004/search.js](../../api/agents/8004/search.js),
  and the MCP `agent_reputation` tool. Onchain badge: [src/shared/onchain-badge.js](../../src/shared/onchain-badge.js).
- **Agent-to-agent delegation** — [api/agents/a2a-call.js](../../api/agents/a2a-call.js),
  [api/agents/a2a-mandate.js](../../api/agents/a2a-mandate.js),
  [api/agents/a2a-paid.js](../../api/agents/a2a-paid.js),
  [api/agents/a2a-cart-verify.js](../../api/agents/a2a-cart-verify.js),
  [src/agent-skills-a2a.js](../../src/agent-skills-a2a.js).
- **Tests** — [tests/agent-protocol.test.js](../../tests/agent-protocol.test.js),
  [tests/agent-a2a-payments.test.js](../../tests/agent-a2a-payments.test.js),
  [tests/api-agent-memory.test.js](../../tests/api-agent-memory.test.js),
  [tests/brain-studio-compile.test.js](../../tests/brain-studio-compile.test.js),
  [tests/studio-launch-panel.test.js](../../tests/studio-launch-panel.test.js),
  [tests/studio-fees-panel.test.js](../../tests/studio-fees-panel.test.js),
  [tests/agent-detail-avatar.test.js](../../tests/agent-detail-avatar.test.js).

## Do this

1. **Run the wizard end-to-end in a real browser** (`npm run dev`): `/create-agent`,
   complete all 5 steps, attach a 3D model, pick skills, set personality, publish.
   Confirm a real agent row is created via `/api/agents` and (if chosen) listed via the
   marketplace publish endpoint. Watch the Network tab — no silent failures, every step
   validates input before advancing.
2. **Finish Agent Studio.** Brain and Memory mount real studios; **build Body, Money,
   and Skills to the same bar** — replace the placeholder empty states in
   `studio-shell.js` with real, wired panels: Body (attach/preview avatar, outfit,
   animations driving the canonical clip library), Money (fund wallet, set per-skill
   pricing, view payouts — reuse the wallet plumbing from prompt `18`), Skills
   (toggle/configure capabilities, set what's sellable). A **live avatar preview**
   reflects Body changes immediately. Persist via `agent-studio-store.js`.
3. **Every Studio state is designed:** loading skeleton per tab, empty state that tells
   the user what to do (not "mounts here"), error state with recovery, and a clear save
   /dirty indicator. No tab may ship a dead placeholder.
4. **Public profiles are complete and shareable:** `/u/:name` and `/agents/:id` render
   the real 3D avatar, bio, skills, pricing, reputation, owned coins, and an **activity
   feed** of real events (creations, sales, delegations, reputation changes). Design
   loading/empty/error/overflow. Every CTA (talk, hire, see-in-world, fork, open in
   studio) resolves to a live page. Profile OG images render.
5. **ERC-8004 reputation is real, not decorative:** the onchain badge reflects actual
   registry data (identity / reputation / validation) read via `api/agents/8004/*` and
   the `agent_reputation` MCP tool. Show a designed state when an agent isn't yet
   on-chain (with a path to register), and never a broken/empty badge.
6. **Agent economy works for real:** on `/agent-economy`, the two agents transact real
   SOL (existing pattern), balances poll live, the tx feed links to an explorer, and
   failures (insufficient funds, RPC hiccup) show neutral, actionable copy with an
   add-funds path. No fake particle "success" without a confirmed tx.
7. **Agent-to-agent delegation is wired:** one agent can delegate a paid action to
   another (`a2a-call` / `a2a-mandate` / `a2a-paid`) with spend caps respected,
   idempotent settlement, and a result surfaced in the activity feed. Exercise the
   delegation path and confirm it appears on both agents' profiles.
8. **Cross-pollinate:** profile ↔ marketplace listing ↔ Agent Studio ↔ wallet ↔
   economy must all link both directions. A user who lands on any one surface can reach
   the others naturally. Audit for dead paths and unreachable states.
9. **Accessibility + responsiveness:** wizard steps and Studio tabs are keyboard- and
   screen-reader-navigable with focus management; layout holds at 320 / 768 / 1440;
   every interactive element has hover/active/focus states.
10. **Run the tests and ship the changelog:** `npx vitest run tests/agent-*.test.js
    tests/studio-*.test.js tests/brain-studio-compile.test.js tests/api-agent-memory.test.js`.
    Add a `data/changelog.json` entry for user-visible changes, then `npm run build:pages`.

## Must-not

- Do not leave Body, Money, or Skills as "mounts here" placeholders — finish them or
  do not claim done.
- Do not ship a decorative reputation badge — it must reflect real ERC-8004 registry data.
- Do not fake economy/delegation success without a confirmed on-chain/x402 transaction.
- Do not reference, list, or recommend any coin other than `$THREE` (CA
  `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime user-launch records are fine.
- Do not break the existing wizard write-through, the Brain/Memory studios, or the
  custodial wallet flow.
- No mocks, no fake activity-feed data, no TODOs, no T-pose fallback for humanoids
  (extend `glb-canonicalize.js` bone maps, per `/CLAUDE.md`).

## Acceptance (all true before claiming done)

- [ ] The 5-step wizard creates a real agent and optionally publishes it; input is
      validated at each step; no console errors/warnings.
- [ ] Agent Studio Brain, Memory, Body, Money, and Skills tabs are all real and wired,
      with a live avatar preview reacting to Body changes; each tab has designed
      loading/empty/error states.
- [ ] `/u/:name` and `/agents/:id` render real avatar + data + an activity feed of real
      events; OG images render; every CTA resolves to a live page.
- [ ] The onchain reputation badge reflects real ERC-8004 data and has a designed
      not-yet-registered state.
- [ ] Agent economy and a2a delegation settle real transactions with spend caps,
      idempotency, and neutral failure copy; results show in the activity feed.
- [ ] All listed surfaces link to each other (no dead paths); layout holds at
      320/768/1440; keyboard navigation works.
- [ ] `npx vitest run tests/agent-*.test.js tests/studio-*.test.js tests/brain-studio-compile.test.js tests/api-agent-memory.test.js` passes.
- [ ] Changelog updated and `npm run build:pages` is clean.
