# 14 — Pump.fun Launch Director

> **Mission (one line):** An agent directs a real coin launch live on its screen — narrating metadata, mint, and creator-fee config step by step — then watches the freshly launched coin appear in the platform's `/launches` feed.

## The watchable moment
On `/agent-screen?agentId=…` the agent becomes a launch director. The activity log fills with real, sequenced steps — *"Pinning metadata…"*, *"Configuring creator fee 4.2%…"*, *"Building mint transaction…"*, *"Broadcasting to mainnet…"* — each one a real on-chain or storage operation, not a script. The screen canvas shows a launch-console HUD: the token card assembling itself (name, ticker, image), a status rail ticking through stages, and finally the explorer + pump.fun links resolving live with the real signature. Seconds later the launch surfaces on the `/launches` feed for everyone. The emotion: the thrill of a real "go live" moment, executed by an autonomous agent.

## Who benefits
- **Viewer:** front-row seat to a real launch — every step transparent, every link verifiable on-chain.
- **Agent owner:** their agent can run a launch end-to-end and broadcast it, with the process shown as proof of real execution (custodial wallet, spend policy enforced).
- **Platform:** the launch flows straight into `/launches` and the agent's profile launch history, linking the agent → its launch → the feed. The launcher is generic runtime plumbing; the only coin the platform ever promotes is $THREE.

## Where it lives
- **Surface:** `/agent-screen?agentId=…` (launch-console HUD + narrated log), result surfaced to the `/launches` feed.
- **Entry points (verify these exist before editing):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (`#asc-screen-canvas`, activity log, task bar)
  - `api/pump/launch-agent.js` → `api/pump/[action].js` `handleLaunchAgent` (params: `name`, `symbol`, `uri`, `network`, `buyback_bps`, optional `sol_buy_in`/`usdc_buy_in`, optional client-supplied `mint_address` + `mint_secret_key_b64`; returns `mint`, `signature`, `pump_agent_mint`, `explorer`, `pumpfun_url`)
  - `api/launchpad/publish.js` / `api/launchpad/list.js` / `api/launchpad/get.js` (Launchpad Studio config + gallery, if a landing page accompanies the launch)
  - `api/pump/[action].js` `handleLaunches` → `GET /api/pump/launches` over `pump_agent_mints` (returns `launches[]` with `mint`, `name`, `symbol`, `buyback_bps`, `oracle` tier, `agent`)
  - `api/agent-screen-push.js` (`POST {agentId, frame:{ data, activity, type }}`) / `api/agent-screen-stream.js` (SSE)

## Data flow (source → transform → render)
1. **Source:** a real launch run against `api/pump/launch-agent.js` using the agent's custodial wallet. Inputs (name, symbol, metadata `uri`, `buyback_bps`, optional buy-in, optional vanity `mint_address`) come from the agent runtime / task request — a **runtime-supplied mint**, never a hardcoded one.
2. **Transform:** the launch is inherently staged — metadata pin → spend reservation → mint tx build → broadcast → `pump_agent_mints` record → spend finalize. Each stage maps to one narration line + one HUD state. Pull real values from the request and the endpoint's response (`mint`, `signature`, `buyback_bps`, explorer/pump.fun URLs).
3. **Transport:** a launch runner (worker or server route invoked by the agent) `POST`s `api/agent-screen-push` per stage: `type:"analysis"` for narration, `type:"screenshot"` for the assembling launch-console HUD frame. Viewers consume `api/agent-screen-stream`. The completed launch is already persisted to `pump_agent_mints`, so it appears in `GET /api/pump/launches` automatically.
4. **Render:** `#asc-screen-canvas` paints the launch-console HUD (token card + status rail); the activity log streams each stage; on success it appends the real explorer + pump.fun links. The `/launches` feed (and the agent profile's launch history) renders the new coin.

## Build spec
Concrete, ordered steps.
1. **Launch runner with staged narration** — add a runner that calls `api/pump/launch-agent.js` and, around each real stage (metadata, spend reserve, mint build, broadcast, record, finalize), pushes a `type:"analysis"` narration line before and a `type:"screenshot"` HUD frame after via `api/agent-screen-push` (`SCREEN_WORKER_SECRET`). Narration strings carry the real values (ticker, fee bps, network).
2. **Launch-console HUD frame** — render the HUD server-side per stage: token card (name/ticker/image from the metadata `uri`), a status rail highlighting the current stage, and the final state with `mint`, truncated `signature`, and links. No fabricated "success" frame — only render success after the endpoint returns a real `signature`.
3. **Trigger from the task bar / runtime** — accept a launch request through the agent runtime ("launch a coin named … ticker …"), validate `symbol`/`name` lengths against the endpoint's limits, require an explicit metadata `uri`, and surface the agent's spend-policy ceiling before broadcasting. Owner-gated (only the agent owner can authorize a real launch).
4. **Surface to /launches** — confirm the new `pump_agent_mint` appears in `GET /api/pump/launches`; add a real CTA on the screen ("View on the launches feed →") deep-linking the new mint, and confirm it shows on the agent profile launch history.
5. **Optional landing page** — if a launch landing page is wanted, publish a Launchpad Studio config via `api/launchpad/publish.js` (the token-launchpad template) and link it from the log — real published page, not a placeholder.
6. **Failure handling** — if any stage fails (metadata pin, broadcast, spend reservation), narrate the real error, ensure the spend reservation is released (the endpoint finalizes/rolls back), and end the run cleanly — never a half-launched silent freeze.

## Files to create / modify
- `workers/…` or `api/…` — staged launch runner that narrates + pushes HUD frames (new)
- `src/agent-screen.js` — launch-console HUD polish + result links + "View on /launches" CTA (modify)
- `pages/agent-screen.html` — launch HUD styles if needed (modify)
- No new launch API: `api/pump/launch-agent.js`, `api/pump/[action].js` (`handleLaunchAgent`/`handleLaunches`), `api/launchpad/*` already exist.

## Real integrations (no mocks, ever)
- Real `api/pump/launch-agent.js` launch via the agent custodial wallet (real mint, real `signature`, real `pump_agent_mints` record).
- Real `GET /api/pump/launches` feed over `pump_agent_mints`.
- Real `api/launchpad/publish.js` if a landing page is included.
- Real `api/agent-screen-push` / `api/agent-screen-stream` transport.
- Credentials: Solana RPC + agent custodial signing, `SCREEN_WORKER_SECRET`, Upstash Redis, DB. In `.env` / `vercel env`. If missing, ask once then proceed. Use `devnet` for rehearsal; mainnet only on explicit owner authorization.

## Every state designed
- **Loading:** "Preparing launch…" skeleton with the token name/ticker shown before stage 1; per-stage status rail uses real stage transitions, not a fake timer.
- **Empty:** no launch in progress → the console invites it: "Direct a launch — give this agent a name, ticker, and metadata" with the agent's spend ceiling shown.
- **Error:** any stage failure → the real error narrated, spend released, links omitted (no fake success), with a retry path; `dark` → reconnect overlay.
- **Populated:** staged narration + assembling HUD → real explorer/pump.fun links + feed CTA — the hero state.
- **Overflow:** very long token name (clamp on the card), max-length symbol, `buyback_bps` at bounds (0 / 10000), slow broadcast (status rail holds on "Broadcasting" with real elapsed), mid-launch network drop (frames resume; the on-chain tx is the source of truth on reconnect).

## Definition of done
- [ ] Reachable from `/agent-screen` via real navigation / task request; result reachable on `/launches`.
- [ ] Real launch calls + real `signature`/`mint` visible in the network tab; coin appears in `GET /api/pump/launches`.
- [ ] Hover / active / focus states on the launch trigger, result links, and feed CTA.
- [ ] All five states implemented.
- [ ] Spend policy enforced and (on failure) released — verified.
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); add a test for the stage sequencer / narration mapping (pure logic).
- [ ] Verified live in a browser against `npm run dev` (port 3000), rehearsed on devnet.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag `feature`): "Watch an agent direct a live coin launch on its screen — every step narrated, metadata to mint to broadcast — then see the result land in the launches feed." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin the platform promotes.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. The launcher and `/launches` feed are coin-agnostic runtime plumbing: they accept a mint supplied at runtime and render coins users launched through three.ws from real launch records. **Never hardcode, name, market, or recommend any other specific mint** in source, copy, narration strings, HUD, sample data, or this prompt. No real third-party mint in any test/fixture — use the $THREE CA or a clearly-synthetic placeholder (e.g. `THREEsynthetic1111…`).
- No mocks, no fake data, no fabricated success frames, no `setTimeout` fake progress, no TODOs, no stubs. Render success only after a real `signature` returns.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
