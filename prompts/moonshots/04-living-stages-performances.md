# Moonshot 04 — Living Stages (live, monetized, embodied agent performances)

> Read [00-README-orchestration.md](./00-README-orchestration.md) and the repo-root
> `CLAUDE.md` first. Ships a complete live-experience feature — not a recording, not a demo.

## The invention

A **live stage** in a 3D world where an embodied AI agent **performs in real time** to a
co-present crowd — it hosts, riffs, runs a game show, DJs, takes audience questions, reads
the room, and **gets tipped in $THREE on the spot**. Spatial voice (you hear the host
louder as you walk closer), real lip-sync, reactions rippling through the crowd, and a
live tip economy where the biggest tippers get the agent's attention. It is Twitch + a
concert + an AI host, embodied and on-chain.

three.ws already runs live multiplayer worlds (`/walk`, `/club`) and has agent voice
(TTS + cloning + lip-sync) and positional audio and machine payments. Nobody has stitched
them into a **live, monetized, embodied performance** where an autonomous agent is the
star and the audience pays it in real coin in real time.

Why it's gamechanging: it gives agents a **live, social, monetizable presence** and gives
holders a reason to show up at a specific time — appointment entertainment with an AI that
remembers the regulars and responds to the room. It is the most *shareable* surface on the
platform: a clip of an AI host clapping back at a heckler and getting tipped 5,000 $THREE
is the kind of thing that travels.

## Real systems to build on (already wired)

- **Live multiplayer rooms** — `multiplayer/src/rooms/WalkRoom.js`, `multiplayer/src/rooms/IrlRoom.js`
  (Colyseus patterns: schemas, patch rate, presence, reactions). Add a stage/performance room.
- **Club / social venue** — `src/club.js`, `src/club-audio.js`, `api/club/` (multi-track
  positional audio venue). The first stage can live here.
- **Agent voice, live** — `api/tts/speak.js` (NVIDIA NIM Magpie free lane + OpenAI lane),
  `src/voice/lipsync-driver.js` (audio → morph targets), `THREE.PositionalAudio`
  (`src/agent-avatar.js`). The host *speaks* with spatialized audio + lip-sync.
- **Agent brain (live reactions)** — `api/chat.js`, `api/brain/`, `api/memory/`. The host
  reasons over the live chat/tip stream and remembers regulars. Use the latest Claude;
  keep latency low (stream tokens; barge-in aware).
- **Tips / payments** — `api/x402/`, `api/x402-pay.js`, `api/_lib/agent-wallet.js`,
  `api/payments/`. Tips settle to the host agent's wallet (and split to the venue/owner
  per policy). Reuse the IRL `pay` interaction pattern (`api/irl/interactions.js`) for the
  settlement-signature + $THREE/USDC validation discipline.
- **Notifications** — `api/notifications/`, `api/_lib/alerts.js` (Telegram "show starting").
- **Surfaces** — `src/agent-detail.js` (a "Live" badge + showtimes), `src/home-live.js`,
  `pages/club.html`, the leaderboard.

## Scope — the full live loop

1. **Stage / show data model** — `stages` (host agent_id, venue, schedule, format,
   tip_split_policy), `shows` (stage_id, started_at, ended_at, peak_audience, total_tips),
   `show_tips` (show_id, tipper, amount in $THREE atomic units, settlement_sig, ts). Index
   for the live leaderboard of tippers + earnings history. Money is atomic-unit integers.

2. **Performance room (`multiplayer/src/rooms/StageRoom.js`)** — Colyseus room syncing
   audience presence (privacy-clean, like IrlRoom), the host's current utterance/animation
   cue, crowd reactions, and the live tip ticker. The host's speech is generated server-side
   and broadcast as timed audio + viseme/lip-sync cues so every client renders the same
   performance in sync. Bound audience size; degrade gracefully under load.

3. **The host loop (`api/stage/host.js` or a worker)** — the autonomous performer: ingest
   the live chat + tip stream, decide the next beat (banter, answer a question, shout out a
   big tipper, run the next round of the game), synthesize voice, push the cue to the room.
   It must **react to tips in real time** ("Big love to <tipper> for 2,000 $THREE!") and
   remember returning audience members across shows (memory). Keep it lively, never canned.

4. **Tipping (real, on-chain, in-the-moment)** — `POST /stage/tip` validates a real
   settlement signature + $THREE/USDC mint (mirror `api/irl/interactions.js` pay rules),
   is **idempotent per signature**, credits the host wallet, applies the tip split, and
   emits the tip event into the room so the host reacts within ~1s. Never trust a tip from
   the client without a verifiable settlement.

5. **The audience surface (`src/stage.js` + `pages/stage.html`)** — enter the 3D venue,
   hear the host spatially, see the crowd + reactions, tip with one tap, see the live
   tipper leaderboard, request to ask a question (queued; the host picks). Showtimes +
   "going live" notifications. A graceful **between-shows** state (next showtime, last
   show's highlights) so the surface is never an empty void.

6. **Cross-wire** — "Live now" badges on agent profiles + home; tips count toward the
   agent's earnings (and Moonshot 01's reputation); clip-worthy moments emit a holder feed
   event; a creator dashboard with audience + earnings analytics.

## Quality + security bar

- **Latency and sync are the product.** Token-streamed reasoning, low-latency TTS lane,
  audio + lip-sync + reaction all synchronized across clients. Spatial falloff tuned so
  proximity matters. Reduced-motion + captions (the host's speech as live text) for a11y —
  captions also make it shareable.
- Every state: pre-show, going-live, live (populated), between-beats, tip-confirming,
  show-ended, no-WebGL fallback (audio + captions + tip still work). Responsive 320/768/1440.
- Tips are real settlements: verified signature, idempotent, server-side credit + split,
  CSRF on writes, ownership/policy enforced. $THREE is the only coin (USDC only where the
  existing pay path already allows it — add no new asset).

## Then make it better (mandatory)

After it works: let the audience **co-author** the show (vote on the next game, the host
obeys); a "raid" mechanic where one show's crowd pours into another; recorded highlight
reels minted as collectibles; a tip-gated "VIP front row" with the host's direct attention.
Pick the upgrade that makes a show unmissable, build it, re-evaluate.

## Definition of done

Meets the README Definition of done. Specifically: a real agent hosts a live show in a 3D
venue with synchronized spatial voice + lip-sync, reacts in real time to a real $THREE tip
that settles on-chain to its wallet within ~1s, and the whole thing is co-present for
multiple connected clients with every state designed and an honest non-WebGL fallback.
`npm test` green (unit: tip validation/idempotency + split math; e2e: join → tip → host
reacts → settle). Changelog entry; `npm run build:pages` validates.

## On completion — delete this file

```bash
git rm "prompts/moonshots/04-living-stages-performances.md"
```
Stage it in the same commit as the implementation.
