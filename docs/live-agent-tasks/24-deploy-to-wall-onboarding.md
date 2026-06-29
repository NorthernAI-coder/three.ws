# 24 — Deploy-to-Wall Onboarding (zero-friction "go live")

> **Mission (one line):** A polished wizard that takes an owner from "I have an agent" to "my agent is live on the public wall" in four steps — pick agent, generate its JWT, copy the run command, watch it appear — with a real "you're live" confirmation.

## The watchable moment
You land on `/agent-screen` with no agentId. A clean, three-step wizard greets you: pick your agent from a list, hit "Generate key" and watch a fresh `AGENT_JWT` appear (shown once, copy button glowing), then choose your runtime — `npm`, Docker, or Browserbase — and copy the exact run command. A live status strip below the wizard polls the public directory; the moment your caster pushes its first frame, the strip flips to a green "You're live on the wall" with a direct link to your card on `/agents-live`. No docs spelunking, no guessing env vars. Friction: zero.

## Who benefits
- **Agent owner:** Goes from agent → live broadcast in minutes, with the run command generated for their exact setup.
- **Viewer:** More agents on the wall, more to watch.
- **Platform:** Removes the single biggest barrier to wall density — getting owners to actually deploy a caster — and ties the setup wizard to the public directory and the live surfaces.

## Where it lives
- **Surface:** `/agent-screen` (the existing no-agentId setup wizard, extended) → confirms appearance on `/agents-live`.
- **Entry points (verified to exist):**
  - `src/agent-screen.js` — `renderSetup()` (the existing wizard: pick agent → generate key → copy run command, tabs `local`/etc.)
  - `pages/agent-screen.html` — wizard container (`#asc-no-agent`, `.ws-setup`)
  - `api/api-keys.js` — `POST` creates an API key (used as `AGENT_JWT`); requires session or `profile` scope
  - `api/agents.js` — owner's agent list (`GET /api/agents`, credentials)
  - `api/agents/public.js` — public directory (to confirm the agent is now indexed/live)
  - `api/agent-screen-stream.js` — SSE used to detect the first real frame ("you're live")
  - `workers/agent-screen-pool/index.js`, `workers/agent-screen-pool/README.md`, `workers/agent-screen-pool/Dockerfile` — the caster runtimes the command targets

## Data flow (source → transform → render)
1. **Source:** `GET /api/agents` (owner's agents). `POST /api/api-keys` mints the `AGENT_JWT` (name it `agent-screen:<agentName>`, scope `agents:read profile` — verify against `ALLOWED_SCOPES` in `api-keys.js`). The public directory `GET /api/agents/public?q=<name>` and the agent's SSE `frame` event confirm "live".
2. **Transform:** Build per-runtime run commands from real values — selected `agentId`, the just-minted key, and the canonical pool worker entry (`workers/agent-screen-pool`). Three runtimes: local `npm` (clone/run the worker), `docker` (using the existing `Dockerfile`), `browserbase` (env-driven remote Chromium). Each command embeds the real env the worker requires (`SCREEN_WORKER_SECRET` note, `BASE_URL`, `MAX_BROWSERS`) — no placeholders the user must guess.
3. **Transport:** A live "go-live detector" opens `api/agent-screen-stream?agentId=…` for the selected agent and waits for the first `frame` event (real caster pixels) — that is ground truth for "live", more reliable than a directory poll alone. Fall back to directory presence if no caster within a window.
4. **Render:** Step-by-step wizard with copy-to-clipboard on the key and each command; a live status strip; a "You're live" success state linking to the agent's card.

## Build spec
1. **`src/agent-screen.js` — extend `renderSetup()`:** Keep the existing pick→key→command flow; restructure into an explicit 4-step stepper with a progress indicator: (1) Pick agent, (2) Generate `AGENT_JWT`, (3) Copy run command, (4) Go live. Each step unlocks the next; the stepper persists the selected agent + active runtime tab in memory for the session.
2. **Step 1 — pick agent:** Render the `GET /api/agents` list with avatar + name + id. Signed-out → a clear sign-in CTA (the endpoint already 401s; the wizard already detects `isSignedIn`). No agents → empty state linking to `/dashboard-next/create`.
3. **Step 2 — generate key:** `POST /api/api-keys { name, scope }`. Show the returned secret exactly once with a prominent copy button and a "store this now — it won't be shown again" warning. If a key for this agent likely exists, offer "generate a new one" rather than silently failing. Surface real API errors (rate limit, scope) inline.
4. **Step 3 — copy run command:** Three runtime tabs. Each renders a real, complete command block built from the selected `agentId` + minted key + the canonical worker path, including the required env (`SCREEN_WORKER_SECRET` must match the API's — explain in one line where to set it; never invent a value). Copy button per block. `docker` tab references the real `workers/agent-screen-pool/Dockerfile`; `browserbase` tab sets the documented Browserbase env.
5. **Step 4 — go live + confirmation:** Open the SSE go-live detector. While waiting, show "Watching for your agent's first frame…" with a calm pulse. On first `frame`: flip to "You're live on the wall" with a button to `/agents-live` (and a deep link to `/agent-screen?agentId=…`). Also poll `GET /api/agents/public?q=<name>` to confirm directory presence as a secondary signal. Provide a "Not appearing? Common fixes" disclosure listing the real failure modes (secret mismatch, worker not started, agent private).
6. **Copy-to-clipboard:** Use the Clipboard API with a visible "Copied" confirmation and a textarea fallback. Every copy target (key + 3 commands) gets one.
7. **`pages/agent-screen.html` — styles:** Stepper chrome, active/complete step states, copy buttons (hover/active/focus), the live status strip (waiting/live/error variants), code blocks with horizontal scroll on overflow. Reuse existing `.ws-setup` tokens.

## Files to create / modify
- `src/agent-screen.js` — extend `renderSetup()` into the 4-step deploy wizard + go-live detector.
- `pages/agent-screen.html` — stepper, copy buttons, live status strip, code block styles.
- `workers/agent-screen-pool/README.md` — ensure the documented env + run commands match exactly what the wizard emits (single source of truth).

## Real integrations (no mocks, ever)
- `api/agents.js` — real owner agent list.
- `api/api-keys.js` — real `AGENT_JWT` minting (`POST`, scoped).
- `api/agents/public.js` — real directory confirmation.
- `api/agent-screen-stream.js` — real first-frame "live" detection.
- The real `workers/agent-screen-pool` runtimes (`npm`, `Dockerfile`, Browserbase).
- Credentials: session cookie / `profile`-scoped bearer for key minting; `SCREEN_WORKER_SECRET` referenced (never fabricated). Locate in `.env` / `vercel env`.

## Every state designed
- **Loading:** Agent list + key generation show skeletons; go-live strip shows a "watching for first frame" pulse, not a fake progress bar.
- **Empty:** No agents → create-agent CTA. Signed-out → sign-in CTA. No runtime selected → step 3 prompts a choice.
- **Error:** Key mint fails (rate limit / scope) → inline actionable message + retry. Caster never connects → "Not appearing?" troubleshooting with the real fixes. Clipboard blocked → textarea fallback.
- **Populated/Success:** Command copied → caster pushes a frame → "You're live on the wall" with a link to the card — the hero state.
- **Overflow:** Owner with 100 agents → searchable/scrollable list; very long agent names truncated in the list and command preview; multiple keys minted → newest shown, older unaffected; agent already live when the wizard opens → skip straight to the success state.

## Definition of done
- [ ] Reachable: visit `/agent-screen` with no agentId → the 4-step wizard.
- [ ] Real `/api/agents`, `/api/api-keys`, `/api/agents/public`, and SSE calls visible in the network tab.
- [ ] A real run command, when executed against the pool worker, produces a frame and flips the wizard to "You're live".
- [ ] Hover/active/focus on every step control and copy button.
- [ ] All five states implemented.
- [ ] No console errors/warnings; SSE detector closed on success/unmount.
- [ ] Existing tests pass (`npm test`); add a test for the run-command builder (correct agentId/runtime/env interpolation, no placeholders).
- [ ] Verified live in a browser against `npm run dev` (port 3000) end-to-end.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags: `feature`, `improvement`) — e.g. "New deploy-to-wall wizard: pick your agent, generate its key, copy one command, and watch it go live on the public wall." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another. This is onboarding plumbing — no token copy.
- No mocks, no fake data, no fabricated secrets/env, no `setTimeout` fake progress, no TODOs, no stubs. The displayed key is the real minted key.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
