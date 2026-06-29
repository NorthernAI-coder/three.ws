# three.ws Agent Computer — Production Build Plan & Task Prompts

> Internal planning doc. Goal: ship **Agent Computer** — give any three.ws agent a real
> browser/desktop it operates autonomously while users watch live in the 3D scene, gated
> behind our existing hire → pay → provenance rails. Every layer is independently sellable
> to developers, and the whole thing ships as one product.

---

## 1. Strategy

We do **not** build a browser-driving or desktop-streaming engine from scratch — that is a solved
problem and our own "open source first" rule forbids it. We assemble best-of-breed **permissive**
engines (MIT / Apache-2.0 only) behind a single three.ws API, and we own the layer nobody else has:
**identity + payments + 3D embodiment**.

### Engine choices (all clone/rebrand-safe)

| Layer | Engine | License | Why |
|---|---|---|---|
| Browser runtime | **Steel Browser** (`steel-dev/steel-browser`) | Apache-2.0 | Browser API + built-in session viewer + one-line Docker. Our browser-tier backend. |
| Browser brain | **Stagehand** (`browserbase/stagehand`) | MIT | TS/JS-native `act/extract/observe` loop — fits our Node monorepo with zero language bridge. |
| Browser brain (alt lane) | **browser-use** | MIT | Python; runs as an optional sidecar in the session container for heavier web tasks. |
| Desktop runtime | **cua** (`trycua/cua`) | MIT | Full desktop sandboxes (macOS/Linux/Win), local QEMU. The premium tier. |
| Desktop brain | **UI-TARS** (`bytedance/UI-TARS`) | Apache-2.0 | Best open native-GUI agent for the desktop tier. |
| Isolation | **E2B / Firecracker** | Apache-2.0 | microVM isolation for the desktop tier. |
| Low-latency stream | **neko** (`m1k1o/neko`) | Apache-2.0 | WebRTC virtual-browser stream; the upgrade path past our SSE frame pipeline. |

**Never bring in:** Daytona (AGPL — network copyleft would force us to open-source the platform),
Wide-Moat/open-computer-use (FSL — commercial-use restricted for 2 years).

### What we already own (do NOT rebuild — wire into it)

- Headless Chromium: `puppeteer-core` + `@sparticuz/chromium-min` (already in `package.json`).
- Frame streaming: [src/shared/agent-screen-client.js](../../src/shared/agent-screen-client.js) (SSE `frame` events, base64 PNG) → canvas in [src/agent-screen.js](../../src/agent-screen.js).
- Screen-on-3D-plane: [src/walk-agent-desk.js](../../src/walk-agent-desk.js) (CanvasTexture → PlaneGeometry) and the `ContentBillboard` class in [src/walk.js](../../src/walk.js) (~L5097–5175).
- WebRTC: `livekit-client` + `livepeer`; LiveKit voice already wired in [src/runtime/livekit-voice.js](../../src/runtime/livekit-voice.js).
- Avatars: `AnimationManager` ([src/animation-manager.js](../../src/animation-manager.js)), `glb-canonicalize`, `animation-retarget`.
- Commerce spine:
  - Paid endpoint helper: [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js) (`paidEndpoint(spec)`), core [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js).
  - Spend caps (atomic, TOCTOU-safe): [api/_lib/agent-trade-guards.js](../../api/_lib/agent-trade-guards.js) — `reserveSpendUsd`, `releaseSpendReservation`, `updateCustodyEvent`.
  - Hire flow: [api/agents/a2a-hire.js](../../api/agents/a2a-hire.js), `agent_hire` / `agent_hire_discover` in [mcp-server/src/tools/](../../mcp-server/src/tools/), `paid()` wrapper [mcp-server/src/payments.js](../../mcp-server/src/payments.js).
  - Provenance: `buildProvenance` in [mcp-server/src/lib/agent-commerce.js](../../mcp-server/src/lib/agent-commerce.js), `append_agent_action` → `/api/agent-actions`.
  - AgenC tasks: [api/agenc/[action].js](../../api/agenc/), [packages/agenc/](../../packages/agenc/).
- Infra: Neon (`api/_lib/db.js`), Upstash Redis with auth-breaker + in-memory fallback ([api/_lib/redis.js](../../api/_lib/redis.js)), worker pattern ([workers/agent-orders/](../../workers/agent-orders/)).

### The sellable units (each ships standalone + as the bundle)

1. `@three-ws/session-runtime` — spawn/track/destroy isolated browser & desktop sessions (Steel + puppeteer + cua).
2. `@three-ws/session-brain` — the GUI agent loop (Stagehand / browser-use / UI-TARS), BYO model.
3. `<agent-session>` web component — embeddable live-view (SSE today, WebRTC upgrade).
4. 3D embodiment — live session rendered onto a surface in the agent scene, avatar reacting.
5. Commerce — per-minute x402 metering + spend caps + provenance + AgenC task + hire.
6. `@three-ws/computer-mcp` — `session_start` / `session_act` / `session_watch` / `session_stop`, priced in USDC.
7. `@three-ws/computer` SDK + Sessions API + dev dashboard + docs.

### Architecture (data flow)

```
Hirer (user/agent) ──hire+pay(x402)──▶ /api/sessions (Vercel, thin control plane)
                                            │  reserveSpendUsd() spend-cap gate
                                            ▼
                              session-runtime worker (long-running, workers/)
                                  ├─ Steel/puppeteer browser context (browser tier)
                                  └─ cua/Firecracker sandbox (desktop tier)
                                            │  brain loop (Stagehand/UI-TARS) drives it
                                            ▼
              screencast frames ──▶ stream relay ──▶ SSE today / LiveKit WebRTC upgrade
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                        ▼                        ▼
          <agent-session> embed     /live page (flat viewer)   3D scene surface + avatar
                                            │
                              on stop ──▶ updateCustodyEvent() + buildProvenance()
                                            + append_agent_action() + AgenC complete
```

---

## 2. How to use these task prompts

Each task below is a **complete, copy-pasteable prompt** for one agent. They are ordered by phase;
dependencies are stated explicitly. Run independent tasks in parallel, dependent ones in sequence.
Every prompt assumes the three.ws CLAUDE.md operating rules are in force (no mocks, no stubs, real
wiring, full Definition of Done, changelog entry for user-visible work, $THREE is the only coin).

**Leadership contract baked into every task:** read the named anchor files first; reuse existing
patterns rather than inventing; wire end-to-end (no dead paths); design every UI state; add tests;
verify in a real browser/run before claiming done; review your own `git diff`; report what you did
and what you observed.

---

# PHASE 0 — Foundation

## TASK 0.1 — Vendor the engines (Steel + Stagehand + neko) under permissive licenses

```
You are a senior platform engineer on three.ws. We are building "Agent Computer": agents that
operate a real browser/desktop while users watch live. Read CLAUDE.md and STRUCTURE.md first.

Goal: vendor the three permissively-licensed engines we will build on, with clean licensing and a
clear isolation boundary, WITHOUT pulling them into the Vercel/Vite build.

Do:
1. Create a top-level `vendor/` directory (add to STRUCTURE.md surface map). Inside it add, each as a
   git subtree or pinned dependency with its LICENSE + NOTICE preserved and a `VENDORED.md` recording
   upstream repo, commit/tag, license, and the exact changes we made:
   - `vendor/steel-browser` — steel-dev/steel-browser (Apache-2.0). The browser-session backend.
   - `vendor/neko` — m1k1o/neko (Apache-2.0). Future WebRTC stream backend (vendor now, wire later).
   - Add `stagehand` (browserbase/stagehand, MIT) as a normal npm dependency of the session-runtime
     package created in Task 1.1 (not a subtree).
2. Confirm none of Daytona (AGPL) or Wide-Moat/open-computer-use (FSL) are introduced anywhere.
3. Add a root-level `THIRD_PARTY_LICENSES.md` (or extend the existing attribution list referenced in
   STRUCTURE.md "See also") listing every vendored engine, its license, and a link to its upstream
   LICENSE file. Follow the existing attribution style used for character-studio and scene-studio.
4. Ensure `vendor/` is excluded from `vite build` and from the esbuild bundling traps noted in
   CLAUDE.md "Known traps" — add the path to the relevant ignore/config so it never gets bundled into
   `api/*.js` or `dist/`.
5. Do NOT run the engines yet. This task only establishes the vetted, attributed source.

Definition of done: licenses preserved and attributed; STRUCTURE.md + THIRD_PARTY_LICENSES.md updated;
nothing AGPL/FSL added; `npm run build` still succeeds and does not pull vendor/ into the bundle;
`git diff` reviewed. No changelog entry (internal infra).
```

## TASK 0.2 — Data model + migration for sessions

```
Senior backend engineer on three.ws. Read CLAUDE.md, then study the DB conventions:
- api/_lib/db.js (Neon `sql` tagged template), scripts/apply-migrations.mjs, `npm run db:migrate`,
  and the existing migration files (find the migrations dir) to match naming + style exactly.
- The existing tables agent_hires, agent_custody_events, agent_identities (referenced in
  api/agents/a2a-hire.js and api/_lib/agent-trade-guards.js) so the new tables join cleanly.

Goal: add the schema for live agent computer sessions. Create a migration adding:
1. `agent_sessions`:
   - id (uuid pk), agent_id (fk agent_identities), hirer_user_id, hirer_agent_id (nullable),
     tier ('browser'|'desktop'), status ('provisioning'|'live'|'completed'|'failed'|'killed'),
     runtime_node (which worker/container holds it), stream_kind ('sse'|'webrtc'),
     reservation_id (fk into the spend ledger / agent_custody_events), price_atomics_per_min,
     network ('solana'|'base'), task_prompt (text), max_duration_s, started_at, ended_at,
     last_heartbeat_at, recording_url (nullable), provenance_action_id (nullable),
     agenc_task_pda (nullable), created_at, updated_at, error_code (nullable), error_detail (nullable).
   - Indexes: (agent_id), (hirer_user_id), (status), (last_heartbeat_at) for reaping stale sessions.
2. `agent_session_events`: id, session_id (fk), ts, kind ('action'|'nav'|'log'|'screenshot'|'error'|
   'lifecycle'), payload (jsonb), signed (bool default false). Append-only audit trail for replay.
3. `agent_session_minutes`: id, session_id, minute_index, charged_atomics, custody_event_id, charged_at
   — one row per billed minute so metering is idempotent and auditable.

Make the migration reversible. Update db:status/db:migrate docs if a README exists. Add a short
note to STRUCTURE.md if a schema/migrations surface is listed there.

Definition of done: `npm run db:status` shows the migration pending, `npm run db:migrate` applies it
cleanly against a real Neon branch, re-running is idempotent, down-migration works. No fake data.
`git diff` reviewed. No changelog entry (internal infra).
```

---

# PHASE 1 — Session runtime (browser tier)

## TASK 1.1 — `@three-ws/session-runtime`: browser session manager (the runtime engine)

```
Senior systems engineer on three.ws. Read CLAUDE.md, STRUCTURE.md §"npm workspaces", and study:
- The worker pattern in workers/agent-orders/ (index.js, config.js, package.json) and how
  npm run worker:* launches it; how it reads env and connects to Neon (api/_lib/db.js) and Redis
  (api/_lib/redis.js — note the auth-breaker + in-memory fallback contract).
- Existing headless-browser usage: grep for puppeteer-core and @sparticuz/chromium-min to match how
  we already launch Chromium.
- vendor/steel-browser from Task 0.1.
- The agent_sessions / agent_session_events tables from Task 0.2.
DEPENDS ON: 0.1, 0.2.

Goal: build a long-running session-runtime service that owns the lifecycle of isolated browser
sessions. Create `packages/session-runtime/` as an npm workspace (add to package.json workspaces and
STRUCTURE.md). It exposes a small internal HTTP control API (used only by our control plane, secured
with a shared secret env var, NOT public) plus a worker entry:

API (internal):
- POST /sessions  {sessionId, agentId, tier:'browser', taskPrompt, maxDurationS} → provisions an
  isolated browser context (Steel-backed; fall back to direct puppeteer-core + chromium-min if Steel
  is unavailable). Marks agent_sessions.status='live', records runtime_node, starts heartbeat.
- POST /sessions/:id/stop → graceful teardown, sets status, flushes final event.
- GET  /sessions/:id → live status + metrics.
The worker loop: heartbeats live sessions to agent_sessions.last_heartbeat_at, reaps sessions past
max_duration_s or with stale heartbeats (status='killed', reason recorded), and enforces a global
concurrency cap from env. One browser context per session — full isolation, no shared cookies/state.

Real implementations only: real Chromium, real CDP. No mocks. Errors handled at the network boundary;
a failed provision sets status='failed' with error_code/error_detail and releases resources.

Add launch scripts to root package.json: `worker:sessions` and `worker:sessions:dev`.

Definition of done: `npm run worker:sessions` starts; hitting the internal API provisions a real
Chromium context you can confirm via a screenshot saved to the scratchpad; stop tears it down with no
orphaned processes; reaper kills an over-duration session; concurrency cap enforced; unit tests for
the lifecycle state machine and reaper (tests/ — vitest, follow tests/api/ naming). `git diff`
reviewed. Changelog: none yet (no user-visible surface until Phase 5 wires it).
```

## TASK 1.2 — Screencast capture → stream relay (reuse the existing frame pipeline)

```
Senior engineer on three.ws. Read CLAUDE.md and study the EXISTING streaming pipeline so you extend
it instead of inventing a parallel one:
- src/shared/agent-screen-client.js (SSE client; `frame` events carry {ts, data(base64 png), activity,
  type, agentId}).
- src/agent-screen.js (how frames are decoded and drawn to a canvas).
- Find the server endpoint that currently emits those SSE frames (grep for agent-screen-stream / the
  route the client connects to) and match its shape exactly.
DEPENDS ON: 1.1.

Goal: capture the live browser via CDP Page.startScreencast in the session-runtime, and relay frames
through the SAME SSE contract the frontend already understands, keyed by sessionId. Specifically:
1. In session-runtime, subscribe to CDP screencast for each live session; throttle to a configurable
   fps (default 8–12) and JPEG quality to stay within payload limits; ack frames to keep CDP flowing.
2. Publish frames to a relay the frontend can read: extend/clone the existing agent-screen SSE
   endpoint to serve `/api/sessions/:id/stream` (Vercel function) backed by the runtime (via Redis
   pub/sub or the runtime's internal API — pick the approach already used by the current screen
   stream and reuse it). Reconnect/backpressure handled.
3. Also emit lifecycle/action events on the same stream (nav, click, type, error) so viewers see what
   the agent is doing, not just pixels — write them to agent_session_events too.

No fake frames, no setTimeout fake progress. Real CDP frames or an explicit "provisioning" state.

Definition of done: opening the SSE stream for a live session in a browser shows the real screencast
updating; events appear; reconnect works; payloads stay within limits; existing agent-screen viewer
still works unchanged. Test the stream contract (shape of frame/event objects). `git diff` reviewed.
```

---

# PHASE 2 — The brain (browser agent loop)

## TASK 2.1 — `@three-ws/session-brain`: the GUI agent loop (Stagehand, BYO model)

```
Senior AI-systems engineer on three.ws. Read CLAUDE.md. This is an LLM-shaped task using
Anthropic/Claude as the default model — BEFORE coding, consult the claude-api skill for current model
ids, tool-use, and the @ai-sdk/anthropic usage already in this repo (it is a dependency). Study:
- How the repo already talks to Claude/OpenAI (grep for @ai-sdk/anthropic, worker proxies — CLAUDE.md
  says model calls go through worker proxies; reuse that, never hardcode keys).
- packages/session-runtime browser sessions (Task 1.1) and the CDP/Steel handle they expose.
DEPENDS ON: 1.1.

Goal: build the action loop that drives a session toward a natural-language task. Create
`packages/session-brain/` (npm workspace). Wrap Stagehand (MIT) over the session's browser handle to
provide act/observe/extract. The loop:
1. Takes {sessionId, taskPrompt, model?} — model is pluggable; default to the latest Claude via our
   existing proxy; allow BYO (caller supplies provider+key, used server-side only, never logged).
2. Plans → acts → observes in a bounded loop with a step cap and per-step timeout. Each step emits an
   action event into the Task 1.2 stream (so watchers see "navigating to…", "clicking Submit", etc.).
3. Stops on success criteria, step cap, or error; returns a structured result {status, summary,
   artifacts[], steps}.
4. Safety: respects an allowlist/denylist of domains from env/session config; refuses to enter
   credentials it wasn't given; never exfiltrates secrets to logs.

Real model calls only (no canned responses). Handle provider errors at the boundary with retries +
clear terminal failure.

Definition of done: given a real task ("find the top story on Hacker News and return its title+URL")
against a live session, the loop completes and returns the correct structured result, and the action
events are visible on the stream. Unit-test the loop control (step cap, timeout, denylist) with the
model call mocked at the provider boundary only. `git diff` reviewed.
```

---

# PHASE 3 — Live view + embeddable component

## TASK 3.1 — `<agent-session>` web component (embeddable live viewer)

```
Senior frontend engineer on three.ws. Read CLAUDE.md and study how existing web components ship as
SDKs (avatar-sdk `<agent-3d>`, page-agent-sdk `<page-agent>` — STRUCTURE.md). Study the SSE client
src/shared/agent-screen-client.js and the canvas-draw pattern in src/agent-screen.js.
DEPENDS ON: 1.2.

Goal: a drop-in `<agent-session session-id="…">` custom element that renders the live session for any
developer to embed. Create it under a publishable package (e.g. packages/session-viewer/ →
@three-ws/session-viewer, zero-dependency pure-ESM like the other SDK packages; follow their
src/http.js + node --test convention).
Requirements:
- Connects to /api/sessions/:id/stream, renders frames to a canvas, overlays the live action log.
- Every state designed: provisioning (skeleton), live, paused, completed (with summary + replay link),
  error (actionable), and a "session ended" empty state.
- Controls: pause/resume view, fullscreen, copy session link, and (if the viewer is the owner) a
  "stop session" button that calls the control plane.
- Accessible: semantic markup, ARIA on controls, keyboard nav, focus rings. Responsive 320→1440.
- Microinteractions: hover/active/focus states, smooth transitions, no jank.

Definition of done: embeddable in a plain HTML page (add an example under examples/), renders a real
live session, all states reachable and demoed in a real browser with no console errors. `git diff`
reviewed. Changelog: add an entry (feature) once the /live page in Task 3.2 makes it user-reachable —
coordinate so there is exactly one entry.
```

## TASK 3.2 — `/live` page: public gallery + single-session theater

```
Senior product engineer on three.ws. Read CLAUDE.md. Study page routing (data/pages.json +
scripts/build-page-index.mjs, `npm run build:pages`), the recent "live agents wall" work (git log),
and the <agent-session> component from Task 3.1.
DEPENDS ON: 3.1.

Goal: ship the user-facing surface where people watch agents work.
- `/live` — a gallery of currently-live sessions (real data from agent_sessions where status='live'),
  each tile a small live preview (thumbnail frame + agent name + task + elapsed + watcher count).
  Designed empty state ("No agents are working right now — hire one") linking to the hire flow.
- `/live/:sessionId` — full theater: the <agent-session> viewer, the action log, agent profile link,
  the provenance receipt once completed, and a "hire this agent" CTA.
- Register both routes in data/pages.json and run build:pages. Wire navigation in/out (no dead paths):
  link from agent profiles to their live/past sessions and back.

Real fetches only, no sample arrays. Loading = skeletons. Handle 0/1/many sessions and very long task
strings.

Definition of done: both routes load with real data, navigation is bidirectional, all states designed
and demoed in a real browser, no console errors, network tab shows real API calls. Add ONE changelog
entry (feature) covering the live-watch experience. `git diff` reviewed.
```

---

# PHASE 4 — 3D embodiment (the differentiator)

## TASK 4.1 — Render the live session onto a surface in the 3D scene, avatar reacting

```
Senior 3D/graphics engineer on three.ws. Read CLAUDE.md and study the proven patterns:
- src/walk-agent-desk.js (desk + monitor: CanvasTexture → PlaneGeometry, fed by the screen SSE client).
- The ContentBillboard class in src/walk.js (~L5097–5175) and paintContentTexture (~L5024–5086).
- Avatar mount + animation: src/agent-screen.js mountAvatarWebcam (~L570–630), src/animation-manager.js.
DEPENDS ON: 1.2 (stream), and reuses 3.1's stream client.

Goal: in the agent scene, render the agent's LIVE session onto a screen surface the avatar is
visibly operating. Reuse walk-agent-desk's CanvasTexture-on-plane approach fed by
/api/sessions/:id/stream. Then:
1. Place a workstation (desk + monitor, or a floating panel) near the avatar; map the live frames onto
   the monitor surface with correct aspect + anisotropy (match paintContentTexture quality).
2. Drive avatar animation from session activity: typing/clicking → a "working" clip; idle between
   steps → idle; error → a reaction. Use AnimationManager; do not hardcode a rig allowlist (CLAUDE.md).
3. Keep it performant: throttle texture uploads to the stream fps, dispose old textures, no per-frame
   allocations, respect the existing RAF loop. Lazy-load this module so it doesn't bloat first paint.

Definition of done: in a real browser, the avatar stands at its workstation and the monitor shows the
live session updating in real time while the avatar animates in sync; 60fps held on a mid-range
machine; no texture leaks (verify memory stays flat over a few minutes); no console errors. `git diff`
reviewed. Fold into the Phase 3 changelog entry (one cohesive "watch your agent work" feature) or add
an "improvement" entry if shipped separately.
```

---

# PHASE 5 — Commerce (wire into hire → pay → provenance)

## TASK 5.1 — Sessions control plane: `/api/sessions` with x402 metering + spend caps

```
Senior backend engineer on three.ws. Read CLAUDE.md and study the commerce spine you MUST reuse
(do not reinvent):
- api/_lib/x402-paid-endpoint.js (paidEndpoint(spec)) and api/_lib/x402-spec.js.
- api/agents/a2a-hire.js (the full hire: owner-gate → resolve offer → reserveSpendUsd →
  pay over x402 → record receipt → finalize/ledger).
- api/_lib/agent-trade-guards.js (reserveSpendUsd, releaseSpendReservation, updateCustodyEvent — the
  atomic, TOCTOU-safe spend ledger).
- The api/ handler conventions (api/agent-delegate.js): wrap(), cors(), method(), getSessionUser /
  authenticateBearer, readJson, limits (rate-limit), json/error.
- packages/session-runtime internal API (Task 1.1) and agent_sessions / agent_session_minutes (0.2).
DEPENDS ON: 1.1, 2.1, 0.2.

Goal: the thin Vercel control plane that turns sessions into a paid product.
- POST /api/sessions — start a session. Owner/bearer auth + rate limit. Resolve per-minute price
  (price_atomics_per_min, in USDC; $THREE accepted via the same x402 challenge — never any other coin).
  reserveSpendUsd() for the FIRST minute BEFORE provisioning (closes TOCTOU); call session-runtime to
  provision; kick off the brain (Task 2.1). Return {sessionId, streamUrl}. On any failure, release the
  reservation and return an actionable error.
- Per-minute metering: a billing tick (in session-runtime's loop or a dedicated reaper) that, for each
  live minute, reserves+settles the next minute via the spend ledger and writes agent_session_minutes
  idempotently. If a minute can't be funded → graceful stop (status='completed', reason='budget'),
  never a silent overrun. Respect the hirer's daily/per-tx caps from agent-trade-guards.
- POST /api/sessions/:id/stop — owner stop; finalize ledger (updateCustodyEvent), set ended_at.
- GET /api/sessions and /api/sessions/:id — list/detail backing the /live page.

Follow x402-paid-endpoint conventions so the 402 challenge advertises USDC and $THREE exactly like
the rest of the platform. Real settlement only.

Definition of done: a real hire starts a real paid session; the first minute is reserved before any
Chromium spawns; subsequent minutes meter correctly and idempotently; exceeding the cap stops the
session cleanly with a clear reason; stop finalizes the ledger; both wallets reflect the spend. Tests:
metering idempotency, cap-stop, TOCTOU reservation ordering (vitest, tests/api/). `git diff` reviewed.
Changelog: add a feature entry for paid agent sessions.
```

## TASK 5.2 — Provenance receipt + AgenC task for every session

```
Senior backend engineer on three.ws. Read CLAUDE.md and study:
- buildProvenance in mcp-server/src/lib/agent-commerce.js and how agent_hire returns a receipt.
- append_agent_action → /api/agent-actions (packages/provenance-mcp) — the signed, append-only ledger.
- AgenC task lifecycle: api/agenc/[action].js and packages/agenc (create/claim/status/complete).
DEPENDS ON: 5.1.

Goal: make every session auditable and screenshot-worthy.
1. On session start, open an AgenC task representing the job (task_prompt, agent, price) and store its
   pda in agent_sessions.agenc_task_pda. On completion/failure, transition the task to its terminal
   state.
2. On completion, build a provenance receipt (buildProvenance) summarizing: agent, task, duration,
   minutes billed, total spend (USDC/$THREE), result summary, and a link to the replay. Sign + append
   it via the agent-actions ledger; store provenance_action_id on the session.
3. Surface the receipt on /live/:sessionId (Task 3.2) and in the session-runtime result.

Real signing + real on-chain/append writes (no fake hashes). Errors at the boundary; a provenance
write failure must not silently drop — retry then record the gap explicitly.

Definition of done: completing a real session produces a verifiable provenance record and a closed
AgenC task; the receipt renders on the theater page; signature verifies. Test the receipt builder and
the lifecycle transitions. `git diff` reviewed. Fold into the Task 5.1 changelog entry or add an
"improvement" entry for verifiable session receipts.
```

---

# PHASE 6 — Developer surface (MCP + SDK)

## TASK 6.1 — `@three-ws/computer-mcp`: session tools over MCP, priced in USDC

```
Senior engineer on three.ws. Read CLAUDE.md and study the MCP package template precisely:
- packages/x402-mcp/ (package.json with name/version/mcpName/bin; src/index.js McpServer +
  registerTool loop + StdioServerTransport; src/tools/*.js exporting `def` with name/title/annotations/
  inputSchema/handler; server.json; how scripts/publish-mcp-servers.mjs validates+publishes).
- The hosted HTTP MCP transport (api/mcp-3d.js + api/_lib/x402-spec.js settlePayment /
  encodePaymentResponseHeader; mcp-batch-price) and how a tool declares an x402 price and returns
  PaymentRequired structuredContent.
- The Sessions control plane (Task 5.1).
DEPENDS ON: 5.1, 5.2.

Goal: create packages/computer-mcp/ (npm workspace + add to publish-mcp-servers.mjs SERVERS) exposing:
- session_start {agentId, taskPrompt, tier?, maxDurationS?, model?} — paid (per the per-minute price);
  returns {sessionId, streamUrl, watchUrl}.
- session_watch {sessionId} — free read; returns current status + recent action events + streamUrl.
- session_act {sessionId, instruction} — paid; injects a follow-up instruction into a live session.
- session_stop {sessionId} — finalizes; returns the provenance receipt.
Pricing surfaces over both stdio (PaymentRequired structuredContent) and the hosted HTTP transport
(X-PAYMENT-RESPONSE) exactly like existing paid tools. USDC + $THREE only.

Add server.json (version matched), README, LICENSE, and register the remote in the hosted MCP surface
so it appears alongside agent_hire/forge_free.

Definition of done: `node scripts/publish-mcp-servers.mjs --dry-run` validates the new server; tools
work end-to-end against a real session via the MCP inspector; paid tools issue/settle real x402;
free reads need no payment. Tests under packages/computer-mcp/test/*.test.mjs. `git diff` reviewed.
Changelog: add an sdk entry for the Agent Computer MCP.
```

## TASK 6.2 — `@three-ws/computer` SDK (single-import client for developers)

```
Senior DX engineer on three.ws. Read CLAUDE.md and STRUCTURE.md §"SDK packages (published)" — match
that convention exactly: zero-dependency pure-ESM, shared src/http.js core (base-URL + typed
ThreeWsError/PaymentRequiredError with 402 carrying the x402 challenge), hand-written .d.ts, node
--test suite, ships src/ with no build step. Study an existing one (e.g. packages/agenc/ or
packages/forge/).
DEPENDS ON: 5.1, 5.2.

Goal: packages/computer/ → @three-ws/computer. A developer installs it and runs:
  const s = await computer.startSession({ agentId, task });
  for await (const ev of s.events()) { ... }   // streams action/frame events
  const receipt = await s.stop();
Cover: startSession, getSession, listSessions, act(instruction), stop, and an events() async iterator
over the SSE stream. Surface payment challenges as PaymentRequiredError so callers can pay via our
x402 client. Include the <agent-session> embed instructions in the README.

Definition of done: `cd packages/computer && node --test test/*.test.js` green; README quickstart works
against the real API; types accurate. Register in scripts/publish-packages.mjs. `git diff` reviewed.
Changelog: sdk entry (or fold into 6.1's entry).
```

---

# PHASE 7 — Desktop tier, hardening, launch

## TASK 7.1 — Desktop tier: cua/UI-TARS sandbox + neko stream (premium "full computer")

```
Senior systems engineer on three.ws. Read CLAUDE.md. Study packages/session-runtime (Task 1.1),
vendor/neko (0.1), and the tier='desktop' fields in agent_sessions (0.2). Reference cua (MIT) and
UI-TARS (Apache-2.0).
DEPENDS ON: 1.1, 1.2, 2.1, 5.1.

Goal: add a 'desktop' tier to session-runtime: a full isolated desktop (cua sandbox; Firecracker/E2B
or QEMU for isolation) driven by UI-TARS, streamed via neko (WebRTC) — falling back to the screencast
SSE relay if WebRTC isn't available. The control plane, metering, spend caps, provenance, MCP tools,
and 3D embodiment from earlier phases must work for desktop sessions with zero changes to their public
contracts (only the runtime backend differs by tier).

Strict isolation: one sandbox per session, no shared FS/network state, hard resource + time caps,
guaranteed teardown. No mocks.

Definition of done: a desktop session provisions a real isolated desktop, UI-TARS completes a real
multi-app task, the stream renders in the <agent-session> viewer AND on the 3D workstation, metering +
provenance work identically to the browser tier, and teardown leaves nothing orphaned. Tests for the
tier router + teardown. `git diff` reviewed. Changelog: feature entry for the desktop tier.
```

## TASK 7.2 — WebRTC stream upgrade (LiveKit/neko) for smooth low-latency viewing

```
Senior media engineer on three.ws. Read CLAUDE.md. Study the existing LiveKit wiring
(src/runtime/livekit-voice.js, the /api/agents/:id/livekit-token endpoint) and vendor/neko. Study the
stream_kind field on agent_sessions and the SSE relay from Task 1.2.
DEPENDS ON: 1.2, 3.1.

Goal: add a WebRTC stream path so live viewing is smooth video, not throttled JPEGs. Publish the
session's screencast as a WebRTC track (via LiveKit using our existing token infra, or neko for the
desktop tier) and teach <agent-session> (Task 3.1) and the 3D surface (Task 4.1) to consume a
VideoTexture/<video srcObject> when stream_kind='webrtc', transparently falling back to SSE frames
when WebRTC fails. One viewer-side API; the transport is an implementation detail.

Definition of done: a live session streams as smooth WebRTC video in the embed, the /live theater, and
the 3D workstation, with automatic SSE fallback verified by forcing a WebRTC failure; latency visibly
better than the SSE path; no console errors. Test the transport-selection + fallback logic. `git diff`
reviewed. Changelog: improvement entry (smoother live viewing).
```

## TASK 7.3 — Security, abuse, and isolation hardening (gate before public launch)

```
Senior security engineer on three.ws. Read CLAUDE.md and run /security-review against the whole
Agent Computer surface. Study every endpoint and worker added in Phases 1–7 and the existing guards
(api/_lib/agent-trade-guards.js, api/_lib/x402-spec.js SSRF guard, rate-limit, redis auth-breaker).
DEPENDS ON: all prior tasks.

Goal: make the system safe to expose publicly. Verify and fix:
- SSRF: an agent browser/desktop must not reach internal/metadata IPs (169.254.169.254, RFC1918,
  localhost). Enforce an egress allow/deny policy in the runtime; reuse the existing SSRF guard pattern.
- Isolation: confirm one-context/one-sandbox-per-session, no cross-tenant cookie/FS/network leakage;
  guaranteed teardown even on crash; resource + wall-clock caps enforced.
- Spend safety: no path starts or extends a session without a successful reserveSpendUsd; no metering
  double-charge; budget-exhaustion stops cleanly; kill switch (frozen) blocks new sessions.
- Secrets: BYO model keys and any credentials the agent is given are never logged, never sent to the
  client, never written to provenance/events.
- AuthZ: only the owner (or an authorized hirer) can view a private session, stop it, or read its
  events; public gallery shows only sessions explicitly marked public.
- Rate limits + global concurrency caps on session creation; abuse (crypto-mining, illegal content)
  policy + a kill path.
Document the threat model and mitigations in docs/internal/.

Definition of done: /security-review clean (or every finding fixed and re-verified); SSRF and
cross-tenant isolation proven with real tests; no secret leakage; spend safety proven. `git diff`
reviewed. Changelog: security entry.
```

## TASK 7.4 — Pricing, dev dashboard, docs, and launch

```
Senior product engineer on three.ws. Read CLAUDE.md. Study how other paid surfaces present pricing +
keys (api/x402-merchant.js, the SDK launch docs docs/sdk-launch.md, the existing dev/dashboard pages).
DEPENDS ON: 5.x, 6.x, 7.1–7.3.

Goal: package Agent Computer as a developer product.
- A `/computer` (or /sessions) marketing+docs page: what it is, the tiers (browser/desktop), per-minute
  pricing in USDC/$THREE, the embed snippet (<agent-session>), the SDK quickstart, and the MCP tools.
  Register in data/pages.json + build:pages.
- A dev dashboard view: a developer's sessions (live + past), spend, per-minute rate, API key, embed
  code, and replay links. Reuse the existing merchant/dashboard patterns.
- End-to-end docs in docs/: runtime self-hosting, the Sessions API, the SDK, the MCP server, and the
  embed component — each a real, copy-pasteable, working example.
- Every state designed; every link live; bidirectional navigation from agent profiles and /live.

Definition of done: a developer can land on /computer, read docs, copy the embed/SDK/MCP snippet, and
get a real working live session billed correctly; dashboard shows real data; demoed in a real browser
with no console errors. Changelog: feature entry announcing Agent Computer GA. Run
`npm run changelog:push` after deploy (skip if creds absent). `git diff` reviewed.
```

---

## 3. Dependency graph (quick reference)

```
0.1 ─┬─▶ 1.1 ─┬─▶ 1.2 ─┬─▶ 3.1 ─▶ 3.2
0.2 ─┘        ├─▶ 2.1 ──┤        └─▶ (feeds 4.1, 7.2)
              │         └─▶ 4.1
              └─▶ 5.1 ─▶ 5.2 ─┬─▶ 6.1 ─▶ 6.2
                              └─▶ 7.1, 7.2, 7.3, 7.4
```

Parallelizable early: 0.1 ∥ 0.2; then 1.2 ∥ 2.1 after 1.1; then 3.1, 4.1 after 1.2.
Phase 7 hardening (7.3) and launch (7.4) gate the public release.

## 4. Definition of done for the whole program

- A user hires an agent, pays per-minute in USDC/$THREE, and watches it operate a real browser/desktop
  live — flat (/live), embedded (<agent-session>), and embodied in the 3D scene with the avatar reacting.
- Every minute is metered idempotently under hard spend caps; budget exhaustion stops cleanly.
- Every session yields a verifiable provenance receipt and a closed AgenC task.
- Developers can consume each layer standalone (runtime, brain, viewer, SDK, MCP) or the whole product.
- Security-reviewed, SSRF-safe, tenant-isolated, secret-safe. No mocks anywhere. $THREE is the only coin.
```
