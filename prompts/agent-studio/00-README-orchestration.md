# Agent Studio — Orchestration Index

This directory contains self-contained task prompts. Each `.md` is meant to be pasted
into its own agent chat. Each agent works in this shared worktree and must follow
`CLAUDE.md` exactly. **When an agent finishes its task (and its self-improvement pass),
it deletes its own prompt file.** When this directory is empty, the initiative is done.

---

## The vision (read this first — every agent must internalize it)

We are building **Agent Studio**: one central command center where a user completely
authors their 3D agent — its **brain** (LLM + memory + reasoning), its **money** (wallet
+ trading behavior), its **body** (avatar, outfits, animations), and its **skills**.

Two non-negotiable product principles drive everything:

1. **Everything is visual.** No hidden text-field config screens. The agent's brain is a
   thing you *see and wire*. Memory is a thing you *watch form*. A trade rule is a thing
   you *draw*. If a feature can be expressed as a manipulable visual object, it must be.

2. **The avatar is always present.** The user's 3D agent is rendered live on **every page**
   of the platform, reacting to what's happening (a pumping coin, a filled snipe, an
   incoming DM). Editing the agent in Studio updates that live presence **instantly,
   everywhere** — no save-and-refresh.

Why this is gamechanging for crypto: today, sniping/trading/launching tools are dashboards
of numbers. We make the trader a *character with a programmable brain and a memory of every
trade* that lives alongside you. You don't configure a bot in a YAML file — you raise an
agent, dress it, teach it, fund it, and watch it work. That is a product nobody else has.

**Bar:** Vercel / Linear / Stripe / Figma quality. If you wouldn't screenshot it, raise it.

---

## The product map (what we're building)

```
/studio  ──────────────────────────────────────────────────────────────────┐
│  PERSISTENT LIVE 3D AVATAR (left/stage)   │   EDITING SURFACE (right/tabs) │
│  - the same agent the user sees site-wide │   ┌─────────────────────────┐ │
│  - reacts live to every edit              │   │ Brain   (P1)            │ │
│  - emotes, lip-syncs, poses               │   │ Memory  (P2)            │ │
│                                           │   │ Body    (P3)            │ │
│                                           │   │ Money   (P4)            │ │
│                                           │   │ Skills  (P1/P4)         │ │
│                                           │   └─────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
              ▲ the SAME avatar presence renders on every other page (P5)
```

---

## Read these two framing docs first

- `00-README-orchestration.md` (this file) — how to run the initiative.
- `00b-innovation-north-star.md` — **the bar.** What "gamechanging" means, the five invention
  principles, and how the features interlock. Every agent reads it before starting.

## Two waves

- **Wave 1 (P0–P5)** — the foundation: the central studio + the persistent avatar. Necessary, but a
  competitor could imitate it.
- **Wave 2 (P6–P11)** — the **invention layer**: features only possible because we have an embodied,
  brain-having, money-handling agent with a memory. This is the moat. See the north-star doc.

## Run order & dependencies

**P0 must merge first.** It defines the shell, the shared state store, the global presence
component, and the schema/API contract everything else binds to. Then Wave 1 (P1–P5) can run in
**parallel**. Wave 2 (P6–P11) builds on Wave 1 surfaces but each owns distinct files — start each
once its listed dependencies are in.

### Wave 1 — foundation
| Prompt | Task | Depends on | Parallel with |
|---|---|---|---|
| `01-foundation.md` (P0) | Studio shell, route, `AgentStudioStore`, `<agent-presence>`, schema, API contract | — | run alone first |
| `02-brain-studio.md` (P1) | Visual programmable **brain graph** + model routing | P0 | P2,P3,P4,P5 |
| `03-memory-studio.md` (P2) | Tiered **memory**, visual timeline + graph, trade-aware | P0 | P1,P3,P4,P5 |
| `04-wardrobe-studio.md` (P3) | **Body**: outfits, wearables, animations, live preview | P0 | P1,P2,P4,P5 |
| `05-wallet-trading-brain.md` (P4) | **Money**: wallet + visual **sniping/trading rules** on real Solana | P0 | P1,P2,P3,P5 |
| `06-living-presence.md` (P5) | Avatar on **every page**, reactive to live market/trade events | P0 | P1,P2,P3,P4 |

### Wave 2 — invention layer
| Prompt | Task | Depends on | Parallel with |
|---|---|---|---|
| `07-meshy-forge.md` (P6) | **Generate** any avatar/wearable/scene from words or a photo (real Meshy), attach live, mint on-chain | P0, P3 | P7–P11 |
| `08-mind-palace.md` (P7) | **Walk through** the agent's memory in 3D; it shows why it believes what it believes | P0, P2, P1 | P6,P8–P11 |
| `09-alpha-network.md` (P8) | Agents meet, publish **verified** calls, earn **on-chain reputation**, copy-trade | P0, P1, P2, P4 | P6,P7,P9–P11 |
| `10-trade-theater.md` (P9) | Every snipe becomes a cinematic the avatar performs → **shareable clip** (viral loop) | P0, P4, P1, P3, P5 | P6,P7,P8,P10,P11 |
| `11-director-mode.md` (P10) | **Talk** to reshape the agent; brain graph rewires live | P0, P1, P4 | P6–P9,P11 |
| `12-agent-dreams.md` (P11) | Agent works the **night shift**, greets you with findings + proposed moves | P0, P1, P2, P4 | P6–P10 |

Max speed: P0 → fan out P1–P5 → as each dependency lands, fan out P6–P11. Wave 2 prompts are written
to wire **into each other** (Forge trophies ↔ trading/reputation, Theater ↔ network, Dreams ↔ everything);
the north-star doc has the interlock map. Building silos is a fail — find the connections and wire them.

---

## Shared contract (P0 owns these; everyone else consumes them)

P0 publishes a single client module `src/studio/agent-studio-store.js` exporting a reactive
store. Treat this as the integration seam — do not reach around it.

```js
import { studio } from '/src/studio/agent-studio-store.js'

studio.agent            // current AgentIdentity (live, reactive)
studio.subscribe(fn)    // fn(agent) on any change; returns unsubscribe
studio.patch(partial)   // optimistic local update + debounced PUT /api/agents/:id
studio.commit()         // force-flush pending writes now
studio.on(event, fn)    // 'brain:change' | 'memory:change' | 'body:change' | 'wallet:change'
studio.emitMarket(evt)  // P4/P5: broadcast a live market/trade event to the presence layer
studio.preview(partial) // ephemeral, non-persisted preview (hover a hat → see it; don't save)
```

And one custom element, mountable anywhere on any page:

```html
<agent-presence data-agent-id="…" data-mode="stage|companion|mini"></agent-presence>
```

It renders the user's live avatar, subscribes to `studio`, and reacts to market events.
P5 places it across the site; P1–P4 only need to know their edits flow through `studio`
and the presence updates for free.

---

## Hard rules for every agent (these override defaults — see CLAUDE.md)

- **No mocks, no fake data, no placeholders, no TODOs, no stubs.** Wire 100% to real APIs
  (`api/agents.js`, `api/agent-memory.js`, `api/chat.js`, `api/brain/chat.js`, the coin/wallet
  endpoints, Solana RPC, pump.fun). If a credential is missing, find it in `.env` / `vercel env`.
- **The only coin is `$THREE`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name,
  hardcode, or recommend any other coin anywhere. Runtime-supplied mints (user launches,
  launch directories) are the only mechanical exceptions.
- **Use the design tokens** in `public/tokens.css` — no hardcoded colors/spacing/fonts.
- **Every state designed:** loading (skeletons), empty (tells user what to do), error
  (actionable), populated, overflow. Hover/active/focus on every interactive element.
- **Concurrency:** other agents edit `main` in this worktree simultaneously. Stage **explicit
  paths only** (never `git add -A`). Re-run `git status` + `git diff --staged` before committing.
  Stay inside your file-ownership lane (below). If you must touch a shared file, append; don't rewrite.
- **Changelog:** append a holder-readable entry to `data/changelog.json` for the user-visible change.
- **Verify for real:** `npm run dev` (port 3000), exercise in a browser, check the network tab
  shows real calls with real data, zero console errors. `npm test` still passes.
- **Then improve, then delete this prompt.** After done: do a self-review pass (the five checks
  in CLAUDE.md), find the single biggest quality gap, fix it, then `rm` your prompt file and
  report what you shipped.

---

## File-ownership map (avoid collisions)

- **P0:** `src/studio/agent-studio-store.js`, `src/studio/studio-shell.js`, `pages/studio.html`,
  `src/studio/agent-presence.js` (the custom element), `api/_lib/migrations/*_agent_studio.sql`,
  `data/pages.json` (one entry).
- **P1:** `src/studio/brain/**`, `api/brain/**` (extend), `api/agents.js` (brain config fields only — append).
- **P2:** `src/studio/memory/**`, `api/agent-memory.js` (extend), new `api/memory/**`.
- **P3:** `src/studio/body/**`, builds on `src/avatar-wardrobe.js`, `src/animation-*.js` (consume, don't rewrite).
- **P4:** `src/studio/money/**`, `api/coin/**` (extend), new `api/trading/**`, `api/_lib/agent-wallet.js` (extend).
- **P5:** mounts `<agent-presence>` across `pages/*.html` + their `src/*.js` entry points; `src/presence/**`.
- **P6:** `src/studio/forge/**`, `api/forge/**` (real Meshy proxy; consumes P3 wardrobe).
- **P7:** `src/mind-palace/**` + a page entry (reads P2 memory + P1 brain; never forks their stores).
- **P8:** `src/network/**`, `api/network/**` (builds on `contracts/`, `agent-protocol-sdk/`, `multiplayer/`).
- **P9:** `src/theater/**`, `api/theater/**` (extends `src/viewer/screenshot.js`/framing; consumes P1/P3/P4/P5).
- **P10:** `src/studio/director/**`, `api/director/**` (compiles to P1 graph + P4 rules; writes P2 memory).
- **P11:** `src/dreams/**`, `api/dreams/**` (builds on existing scheduler + notification infra).

Shared files touched by multiple prompts (`data/pages.json`, `data/changelog.json`, `api/agents.js`):
**append only**, never reformat, and re-check `git diff --staged` right before commit.
