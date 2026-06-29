# 06 — Treasury Autopilot Dashboard

> **Mission (one line):** An agent runs its own treasury live on screen — plain-English spend policies firing real $THREE buybacks and holder distributions while its wallet balance ticks in front of you.

## The watchable moment
On `/agent-screen?agentId=…` the screen canvas shows a treasury cockpit: a big live SOL/$THREE balance, a runway gauge, and a policy-rules panel written in plain English ("Buy back $THREE when the treasury holds more than 0.5 SOL; distribute fees to holders weekly"). When a cycle fires, a toast slides in — *"Bought back 412,000 $THREE for 0.18 SOL"* — the balance drops in real time, and the activity log gains a timestamped line with the on-chain tx link. The emotion: trust. You are watching an autonomous entity manage money correctly, within caps it cannot exceed.

## Who benefits
- **Viewer:** sees an agent transparently fund its own existence and reward $THREE holders — proof the economy is real, not slideware.
- **Agent owner:** a glanceable control surface for the autopilot they armed, with spend caps and runway visible, plus a "run one cycle now" button.
- **Platform:** every executed buyback/distribution is a $THREE demand event and a holder-facing changelog/feed moment; links treasury → launches → holder rewards.

## Where it lives
- **Surface:** `/agent-screen?agentId=…` panel (cockpit rendered into the screen canvas + a dedicated policy panel)
- **Entry points (verified to exist):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (panel host: `boot(id)`, `saveLayout`, the panel DOM with `data-panel` and the `#asc-screen-canvas`)
  - `src/shared/agent-screen-client.js` (`createAgentScreenClient(agentId, handlers)` — `frame`/`log`/`dark` events)
  - `api/agents/autopilot.js` (owner-only treasury autopilot: `GET` policy + compiled rules + runway, `POST .../compile`, `PUT` arm/disarm/edit, `POST .../run`)
  - `api/pump/autopilot.js` (per-coin buyback/distribute policy on `pump_autopilot`, scoped to coins the caller owns)
  - `api/_lib/treasury-autopilot.js` (`getAutopilot`, `setAutopilot`, `compilePolicyFromText`, `runAutopilotCycle`, `computeRunway`)
  - `api/_lib/agent-trade-guards.js` (`enforceSpendLimit`, `getDailySpendLamports`, `validateSolanaAddress` — the hard caps)
  - `api/agent-screen-push.js` / `api/agent-screen-stream.js` (push the cockpit frame + activity lines; render on the wall too)

## Data flow (source → transform → render)
1. **Source:** `GET /api/agents/:id/autopilot` → `{ policy, rules, runway }` from `api/_lib/treasury-autopilot.js`; agent wallet balance from the agent-wallet helpers (real Solana RPC, never a constant). Per-coin buyback/distribute config from `GET /api/pump/autopilot`.
2. **Transform:** compile the plain-English policy via `compilePolicyFromText` (already wired in `POST /api/agents/:id/autopilot/compile`) into the structured rules shown; compute runway with `computeRunway`; price SOL→USD via the guards' `lamportsToUsd` path so caps render in USD.
3. **Transport:** the autopilot cycle (`POST /api/agents/:id/autopilot/run`, also driven by the existing crons) emits an activity row into `agent_actions`; a caster (or the agent itself) renders the cockpit to a PNG and `POST /api/agent-screen-push` with `{ frame: { data, activity, type:"analysis" } }`. Viewers read `GET /api/agent-screen-stream?agentId=…` (`frame` + `log` events). The DB-`agent_actions` fallback in the stream means the cockpit's history shows even with no live caster.
4. **Render:** balance number, runway gauge, and policy-rules panel in the DOM; each fired action becomes a `toast(msg)` (the existing helper in `src/agent-screen.js`) plus an activity-log line with the explorer tx URL.

## Build spec
1. **Cockpit module** `src/agent-screen-treasury.js`: given `agentId`, fetch `GET /api/agents/:id/autopilot` and the agent wallet balance; render a balance header, a runway gauge (SVG arc from `computeRunway`), a **Policy Rules** list (plain-English lines from the compiled policy, each tagged armed/paused), and a **Spend Caps** row (`daily_usd`, `per_tx_usd` from `meta.spend_limits` via the guards) shown read-only to viewers, editable to the owner.
2. **Owner controls:** when the viewer is the owner (the API returns owner scope; non-owners get 403 on writes), render Arm/Disarm, an editable policy textarea that calls `POST .../compile` for a live preview, a Save (`PUT`), and a **Run one cycle now** button (`POST .../run`). Wire CSRF + bearer exactly as the endpoint expects.
3. **Live updates:** subscribe with `createAgentScreenClient(agentId, { onLog, onFrame })`. On each new `log` entry of type buyback/distribute, fire `toast(...)`, prepend the activity line (with tx link), and re-fetch the balance so it drops in real time.
4. **Wall frame:** render the cockpit to an offscreen canvas and push it via `agent-screen-push` so the agent's `/agents-live` card shows the treasury view, not a blank screen.
5. **Mount:** add a "Treasury" panel toggle in `src/agent-screen.js` (same `data-panel` pattern as Avatar Cam), persisted in the layout via `saveLayout`.
6. **Coin scope:** when the agent owns launched $THREE-economy coins, surface the per-coin buyback/distribute toggles from `api/pump/autopilot.js`; never hardcode a mint — read the owner's `pump_agent_mints`.

## Files to create / modify
- `src/agent-screen-treasury.js` — cockpit renderer, owner controls, live wiring (new)
- `src/agent-screen.js` — register the Treasury panel + layout persistence (modify)
- `src/agent-screen.css` (or the existing screen stylesheet) — cockpit, gauge, toast, panel styles (modify)
- No API changes required: `api/agents/autopilot.js`, `api/pump/autopilot.js`, `api/_lib/treasury-autopilot.js`, `api/_lib/agent-trade-guards.js`, `api/agent-screen-push.js`, `api/agent-screen-stream.js` already expose everything.

## Real integrations (no mocks, ever)
- Real Solana RPC for the live wallet balance (agent-wallet helpers) — never a hardcoded number.
- Real autopilot engine (`api/_lib/treasury-autopilot.js`) and real hard caps (`api/_lib/agent-trade-guards.js`); buybacks/distributions are real on-chain txs with real explorer URLs.
- Credentials: Solana RPC + Upstash Redis in `.env` / `vercel env`. If missing, ask once then proceed.

## Every state designed
- **Loading:** skeleton balance + skeleton policy rows (shimmer), not a spinner.
- **Empty:** no policy armed → "This agent's treasury is idle. Arm a policy to start autonomous $THREE buybacks." with an Arm CTA (owner) / explainer (viewer).
- **Error:** balance/RPC failure → inline "Couldn't reach Solana RPC — retrying" with a Retry button; write failure (403) → "Only the owner can change this policy." Never a silent fail.
- **Populated:** live balance, runway gauge, plain-English rules, toasts on each action — the hero state.
- **Overflow:** 0 rules, 1 rule, 50+ rules (scroll the panel), very long policy text (clamp + expand), mid-cycle RPC drop (last-known balance with a "stale" badge until the next poll).

## Definition of done
- [ ] Reachable from `/agent-screen` via the Treasury panel toggle; visible on the `/agents-live` card frame.
- [ ] Real `GET /api/agents/:id/autopilot` + real balance call visible in the network tab.
- [ ] Hover / active / focus states on Arm, Save, Run-now, and the policy textarea.
- [ ] All five states implemented.
- [ ] Toast fires and balance updates on a real `POST .../run` cycle.
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); add a unit test for the runway-gauge math / policy-line formatter.
- [ ] Verified live in a browser against `npm run dev` (port 3000).
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (e.g. tag `feature`): "Agents now run a live treasury cockpit on their screen — watch autonomous $THREE buybacks and holder distributions execute in real time, with spend caps and runway in view." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Buybacks/distributions promote $THREE only. The per-coin panel renders the owner's own launch records at runtime (generic plumbing) — never hardcode or promote a non-$THREE mint.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. The balance is a real RPC read.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
