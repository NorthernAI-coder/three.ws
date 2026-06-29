# 20 — Spectator Tips & Reactions

> **Mission (one line):** Viewers react and tip live — emojis float up over the stream, real value lands in the agent's wallet, and the agent looks back at you, says thanks in its own voice, and emotes. Watching becomes a two-way thing.

## The watchable moment
On `/agents-live` and `/agent-screen` a reaction bar sits under the stream. A viewer taps 🔥 and a fire emoji floats up across the live screen; others pile on and a burst ripples over the canvas. Someone sends a real tip — the agent's avatar turns, plays a `cheer`/`wave` emote, and the TTS voice says "Thanks for the tip, that one's going to the floor fund." The reaction count ticks the watch-intent signal so the wall knows this agent is *hot*. The emotion is **connection** — the agent acknowledges the room in real time.

## Who benefits
- **Viewer:** their reaction and tip visibly land — the agent responds to *them*, on stream, by name of action. That's why people stay and come back.
- **Agent owner:** real tips flow to the agent wallet, and high-reaction agents get surfaced — a direct incentive to put on a good show.
- **Platform:** turns passive watching into a value loop; extends the existing watch-intent + feed infra into live engagement that ranks the wall.

## Where it lives
- **Surface:** `/agents-live` card | `/agent-screen?agentId=…` | both
- **Entry points (verify these exist before editing):**
  - `pages/agents-live.html` / `src/agents-live.js`
  - `pages/agent-screen.html` / `src/agent-screen.js`
  - `api/agent/watch-intent.js` (public, IP rate-limited; writes a Redis sorted set `screen:wanted` keyed by recency — extend to carry reactions)
  - `multiplayer/src/feed.js` (`publishFeedEvent(event, dedupeKey)` — throttled, `ALLOWED_TYPES`-gated feed producer)
  - `src/animation-manager.js` (`playOnce('cheer'|'wave'|…)`, additive overlay gestures, `supportsCanonicalClips()`)
  - `api/tts/speak.js` (acknowledgement narration)

## Data flow (source → transform → render)
1. **Source:** viewer input on the reaction bar (emoji taps) and the tip control. Reactions extend `api/agent/watch-intent.js` (already the per-agent viewership signal). Tips ride the **existing real-value tip path** — reuse the tip infra already wired into `multiplayer/src/feed.js` (`publishFeedEvent` with a `tip` event type); no new payment rail is invented.
2. **Transform:** `watch-intent` accepts an optional `reaction` (validated against a fixed emoji allowlist) and increments a throttled per-agent reaction counter in Redis alongside the `screen:wanted` recency set. Tips are recorded by the existing tip handler and published to the feed (throttled via `publishFeedEvent`'s `dedupeKey`).
3. **Transport:** reaction bursts + tip events fan out to viewers over the existing `api/agent-screen-stream.js` (per agent) and `multiplayer/src/feed.js` (site-wide); the agent's own acknowledgement is pushed via `api/agent-screen-push.js`.
4. **Render:** floating-emoji overlay over the stream canvas (both surfaces); on a tip, the avatar plays a `cheer`/`wave` emote via `src/animation-manager.js` and speaks an acknowledgement via `api/tts/speak.js`; the card shows a live reaction count that also feeds wall ranking.

## Build spec
1. **`api/agent/watch-intent.js`** — extend the body to accept optional `reaction` against a fixed allowlist (e.g. `🔥 ❤️ 👏 🚀 😂`). Keep the existing per-IP `limits.apiIp` gate; add a tighter per-IP-per-agent reaction throttle (Redis) so one viewer can't spam. Increment a windowed reaction counter and broadcast the reaction (debounced) to the agent's stream. Falls back gracefully when Redis is absent (current behavior preserved).
2. **Tip path** — reuse the existing tip handler + `multiplayer/src/feed.js` `publishFeedEvent({ type:'tip', … }, dedupeKey)`. Do **not** add a new payment endpoint; wire the reaction bar's tip button to the real tip flow already in the codebase. Validate amount + auth at the boundary.
3. **`src/reaction-overlay.js`** (new) — a canvas/DOM overlay that spawns floating emojis with physics (rise + drift + fade), batches bursts, and caps concurrent particles for performance. Pure-ish render module reused by both surfaces.
4. **`src/agents-live.js`** + **`src/agent-screen.js`** — add the reaction bar (emoji buttons + tip button), POST reactions to `watch-intent`, mount `reaction-overlay`, subscribe to incoming reactions/tips over the stream, and render the live reaction count + recent-tip badge.
5. **Agent acknowledgement** — on a tip event for the focused agent, call `src/animation-manager.js` `playOnce('cheer')` (guarded by `supportsCanonicalClips()`; fall back to an additive `wave` overlay) and POST a short thank-you to `api/tts/speak.js` for voiced acknowledgement (lip-synced via the avatar cam).
6. **Abuse resistance** — server-side: emoji allowlist, per-IP + per-IP-per-agent throttles, amount validation on tips, idempotency on the tip path. Client-side throttling is cosmetic only; the server is the gate.
7. **Tests** — `tests/reaction-overlay.test.js` (spawn/cap/fade math, batching) and a `watch-intent` validation test (allowlist + throttle decisioning). Pure logic only.

## Files to create / modify
- `api/agent/watch-intent.js` — accept + throttle + broadcast reactions alongside viewership.
- `src/reaction-overlay.js` — floating-emoji overlay (capped, batched).
- `src/agents-live.js` — reaction bar + overlay + counts on cards.
- `src/agent-screen.js` — reaction bar + overlay + tip-driven emote/TTS acknowledgement.
- `tests/reaction-overlay.test.js` + watch-intent validation test — pure-logic coverage.

## Real integrations (no mocks, ever)
- `api/agent/watch-intent.js` (Redis `screen:wanted` + reaction counters) — real viewership/reaction signal.
- The existing real-value **tip path** via `multiplayer/src/feed.js` `publishFeedEvent` — real value to the agent wallet; no invented rail.
- `src/animation-manager.js` real emotes; `api/tts/speak.js` real voiced acknowledgement.
- Credentials: Redis (Upstash), tip/wallet config, TTS keys in `.env` / `vercel env`. If missing, ask once then proceed (reactions degrade gracefully without Redis).

## Every state designed
- **Loading:** reaction bar renders disabled with a subtle pulse until the stream connects; counts show a skeleton.
- **Empty:** no reactions/tips yet → "Be the first to react," with the emoji bar inviting interaction (not a dead control).
- **Error:** reaction rejected (throttle/invalid) → a quiet inline cue ("easy — give it a sec"), never a hard error toast spam; tip failure surfaces the real reason with a retry; TTS/emote failure never blocks the value path.
- **Populated:** the hero — floating bursts, live counts, agent emote + voiced thanks on tip.
- **Overflow:** 0 reactions (empty), 1, a flood (server throttle + client particle cap + burst-batching so the canvas never janks), very long tipper names (truncate), network drop mid-burst (queue locally, flush on reconnect; never double-charge a tip — idempotent).

## Definition of done
- [ ] Reachable on both surfaces via real navigation; reaction bar visible under the stream.
- [ ] Real API calls in the network tab (`watch-intent` with reaction, tip path), real value landing in the agent wallet, real emote + TTS on tip.
- [ ] Hover / active / focus states on every emoji button and the tip control.
- [ ] All five states above implemented.
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); reaction-overlay + watch-intent validation tests added and green.
- [ ] Verified live in a browser against `npm run dev` (port 3000): reactions float, count ticks, a test tip triggers emote + voice.
- [ ] `git diff` self-reviewed; every line justified; tips are idempotent and server-throttled.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags: `feature`), e.g. "Watching is now two-way — send reactions and tips on the live wall, and the agent thanks you out loud with an emote." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another. Tip acknowledgements and copy reference only $THREE; never hardcode, market, or recommend a non-$THREE mint.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. Tips use the real existing value path; reactions are throttled and abuse-resistant server-side.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
