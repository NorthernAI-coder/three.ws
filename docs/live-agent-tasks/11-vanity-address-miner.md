# 11 — Vanity Address Miner

> **Mission (one line):** An agent grinds a real Solana vanity keypair live — keyspace burning past at thousands of attempts/sec — until the address that starts with the brand prefix snaps into existence on screen.

## The watchable moment
On `/agent-screen?agentId=…` the screen canvas fills with a base58 keyspace counter spinning so fast it blurs: *attempts 4,182,330 · 38,900/sec · expected ~6.5M for "pump"*. A progress ring creeps toward the statistical-expectation mark while candidate addresses flicker by, each one *almost* right. Then the log freezes for a half-beat — *"MATCH"* — and the winning address resolves character by character: `pumpXk…`. The tension is a slot machine you know will eventually pay out; the payoff is a real, usable branded wallet. The emotion: suspense, then the dopamine hit of the reveal.

## Who benefits
- **Viewer:** a live cryptographic search they can feel — real odds, real compute, a real reveal, not a loading bar.
- **Agent owner:** a branded wallet (e.g. a `pump`-prefixed mint or treasury address) minted on demand, with the grind shown transparently so the result is verifiably earned, not pre-baked.
- **Platform:** vanity addresses feed directly into the launcher (`api/pump/launch-agent.js` accepts a client-supplied `mint_address` + `mint_secret_key_b64`) and into agent identity — the grind is the on-ramp to a branded $THREE-marked launch.

## Where it lives
- **Surface:** `/agent-screen?agentId=…` panel (hero), with a compact attempts/sec ticker mirrored to the `/agents-live` card.
- **Entry points (verify these exist before editing):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (`#asc-screen-canvas`, activity-log panel, task bar)
  - `pages/agents-live.html` / `src/agents-live.js` (card mirror)
  - `mcp-server/src/tools/vanity-grinder.js` — tool `vanity_grinder` (params `prefix`/`suffix`/`ignoreCase`/`mnemonic`/`strength`/`maxIterations`; returns `address`, `privateKey64`, `iterations`, `estimatedIterations`, `durationMs`)
  - `api/agent-screen-push.js` (`POST {agentId, frame:{ data, activity, type }}`, `SCREEN_WORKER_SECRET`)
  - `api/agent-screen-stream.js` (SSE `frame`/`log`/`dark`/`ping`)
  - `src/shared/agent-screen-client.js` (`frame`/`log` handlers)

## Data flow (source → transform → render)
1. **Source:** the real `vanity_grinder` grind. The grinder in `mcp-server/src/tools/vanity-grinder.js` runs synchronous ed25519 keypair generation and yields periodically. To stream live, the runner instruments the grind loop to emit a progress sample every N iterations (real `iterations` + elapsed `Date.now()` delta → attempts/sec) — no synthetic counter.
2. **Transform:** compute live stats from real numbers: `attemptsPerSec = (iterations - lastIterations) / (now - lastTs)`; `expectedIterations = 58^prefixLength` (the grinder already computes `estimatedIterations`); `progress = min(1, iterations / expectedIterations)` for the ring (a probability indicator, clearly labeled "expected", never a guaranteed bar). Surface a few real candidate prefixes seen for texture.
3. **Transport:** the grind runs in a worker/MCP context (never the browser — keys must not touch the client). Every ~250ms it `POST`s `api/agent-screen-push` with `type:"analysis"` and an `activity` string (`"4.18M attempts · 38.9k/sec · expected ~6.5M"`); the canvas `data` is a rendered keyspace-visualization frame. On match it pushes one `type:"analysis"` reveal line with the **public address only** (never the secret) and a final `type:"screenshot"` reveal frame.
4. **Render:** `#asc-screen-canvas` paints the keyspace visualization + progress ring; the activity log appends each stats sample then the MATCH reveal; the `/agents-live` card shows the compact attempts/sec ticker.

## Build spec
Concrete, ordered steps. Each step names the file and what changes.
1. **Instrument the grinder for progress** — in `mcp-server/src/tools/vanity-grinder.js`, add an optional `onProgress({ iterations, elapsedMs, attemptsPerSec })` callback fired every `PROGRESS_EVERY` iterations (e.g. 50k) inside the existing yield point. Pure addition: when no callback is passed, behavior is unchanged (keep the existing return shape and pricing). Cover the callback firing in `tests/`.
2. **Live runner** — add a runner (worker or server route) that invokes `vanity_grinder` with `onProgress`, and for each progress sample renders a frame (server-side canvas, e.g. `@napi-rs/canvas` if already a dep, else a lightweight SVG→PNG) showing the spinning counter + expected-iterations ring, then `POST api/agent-screen-push` with `SCREEN_WORKER_SECRET`. Throttle pushes to ≤4/sec to respect the 90s frame TTL and Redis quota.
3. **Reveal step** — on grind completion, push one final `type:"analysis"` log line `MATCH · <address>` and a reveal frame that resolves the address character-by-character across 2–3 frames. The secret key (`privateKey64`/`mnemonic`) is returned to the **owner only** through the secure tool channel — never pushed to the screen stream, never logged in `agent_actions`.
4. **Trigger from the task bar** — accept a grind request ("grind a wallet starting with pump") routed through the agent runtime; validate prefix is base58 and length ≤ 6 (longer prefixes are astronomically expensive — clamp and warn in the log with the real expected iterations).
5. **Card mirror** — in `src/agents-live.js`, render the latest `analysis` activity line (attempts/sec) on the card so the wall shows the grind is live.
6. **Hand-off to launch** — on match, surface a real CTA in the log/UI: "Use this address to launch" linking the address + secret (owner-gated) into `api/pump/launch-agent.js` as `mint_address` + `mint_secret_key_b64`. Coin-agnostic plumbing only; the only coin promoted is $THREE.

## Files to create / modify
- `mcp-server/src/tools/vanity-grinder.js` — add `onProgress` callback to the grind loop (modify)
- `mcp-server/src/tools/__tests__/` or `tests/` — assert `onProgress` fires with monotonic `iterations` and a positive `attemptsPerSec` (new/modify)
- `workers/…` or `api/…` — live grind runner that renders frames and pushes to `agent-screen-push` (new)
- `src/agent-screen.js` — keyspace/reveal rendering polish for the grind frame + reveal CTA (modify)
- `src/agents-live.js` — compact attempts/sec ticker on the card (modify)

## Real integrations (no mocks, ever)
- Real `vanity_grinder` ed25519 grind with real `iterations`/`durationMs` — every number on screen comes from the actual search.
- Real `api/agent-screen-push` / `api/agent-screen-stream` transport.
- Real hand-off into `api/pump/launch-agent.js` (`mint_address` + `mint_secret_key_b64`).
- Credentials: `SCREEN_WORKER_SECRET` (must match the API). In `.env` / worker env. If missing, ask once then proceed.

## Every state designed
- **Loading:** "Spinning up the grinder…" skeleton with the prefix + real expected-iteration estimate shown before the first sample arrives.
- **Empty:** no active grind → the canvas invites it: "Ask this agent for a branded wallet — e.g. `grind pump`" with the live odds for common prefix lengths.
- **Error:** invalid prefix (non-base58 / too long) → actionable log line with the real reason and the expected cost; grind crash → "Grinder stalled — restarting" and a real restart, never a silent freeze; `dark` → reconnect overlay.
- **Populated:** the spinning keyspace + attempts/sec + expected ring, then the character-by-character MATCH reveal — the hero state.
- **Overflow:** 1-char prefix (instant — still show at least one suspense frame), 6-char prefix (huge — cap iterations via `maxIterations`, surface the real cap and partial progress), very long agent name (clamp), mid-grind network drop (frames resume on reconnect).

## Definition of done
- [ ] Reachable from `/agent-screen` (and mirrored on the `/agents-live` card) via real navigation / task request.
- [ ] Real grind stats visible in the network tab (SSE `frame`/`log` with real `iterations`/attempts-per-sec).
- [ ] Hover / active / focus states on the grind trigger + reveal CTA.
- [ ] All five states implemented.
- [ ] Secret key never appears in a screen frame, log entry, or `agent_actions` row — verified.
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); add a test for the `onProgress` callback and the attempts/sec computation (pure logic).
- [ ] Verified live in a browser against `npm run dev` (port 3000).
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag `feature`): "Watch an agent grind a branded Solana wallet live — real keyspace search at thousands of attempts a second, suspense building, then the matching address revealed on screen." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. The grinder is coin-agnostic runtime plumbing; never hardcode, name, or promote any other specific mint. A vanity prefix is a wallet, not a coin endorsement.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. Every counter is a real `iterations` value.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
