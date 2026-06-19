# Moonshot 02 — Proof-of-Presence "World Lines" (IRL AR quests with on-chain proof)

> Read [00-README-orchestration.md](./00-README-orchestration.md) and the repo-root
> `CLAUDE.md` first. Ships a complete, privacy-respecting, on-chain feature — not a demo.

## The invention

An agent placed in the real world can leave a **World Line**: a persistent,
location-anchored AR quest. To complete it, a person must *physically travel* to the
spot, point their phone (WebXR), and complete an agent-driven interaction. When they do,
the agent's wallet **cryptographically signs a proof-of-presence** — a tamper-evident
attestation that *this device was at this place at this time and did this thing* — which
mints a collectible to the visitor. The signature is verifiable; the location is never
exposed beyond the privacy-preserving coarse cell the platform already enforces.

Think Pokémon GO, but every encounter is an autonomous AI agent, every reward is a
cryptographically-real collectible, and the whole thing rides on infrastructure
(agent wallets + IRL geocells + WebXR) that three.ws already runs in production.

Why it's gamechanging: it makes the platform's agents **matter in physical space** and
gives people a reason to walk to a place — a verifiable, ownable record of a real-world
encounter with an AI. No competitor has agent-signed proof-of-presence. It also turns
`/irl` from a presence map into a **game with stakes and rewards**.

## Real systems to build on (already wired)

- **IRL pins + proximity + interactions** — `api/irl/pins.js`, `api/irl/interactions.js`,
  `api/irl/report.js`, `api/cron/irl-reap.js`. World Lines extend pins; reuse the
  proximity read, the device-token identity, and the privacy/retention discipline.
- **Privacy-by-design geocells** — `multiplayer/src/rooms/IrlRoom.js`,
  `multiplayer/src/geohash.js` (precision-6 ~1 km cells; exact GPS never leaves the
  device). **You must preserve this invariant** — no precise coordinate ever enters a
  log, an alert, or a proof payload.
- **WebXR / AR placement** — `src/ar/webxr.js`, `src/ar/placement-capability.js`,
  `src/xr.js`, `pages/xr.html`. The quest is completed in an AR session.
- **Agent wallets (signing)** — `api/_lib/agent-wallet.js`. The agent signs the
  proof-of-presence with its own key; the public key + signature are the verifiable proof.
- **Collectibles / NFT** — `api/nft/`, `contracts/` (ERC-8004 identity attestation +
  the SPL patterns in `contracts/skill-license/`). The reward mints a real collectible.
- **$THREE economy** — optional reward top-ups in $THREE; pump.fun launch records
  (`api/pump/`) only as already permitted by CLAUDE.md.
- **Realtime** — `IrlRoom` ambient reactions for the "someone completed your World Line"
  flourish; `api/notifications/` + Telegram alert to the creator.
- **3D agents** — `src/viewer.js`, voice (`api/tts/speak.js`) so the agent *speaks* the
  quest prompt in AR.

## Scope — full path, every state, privacy intact

1. **Data model** — `irl_world_lines` (creator agent_id, pin_id/geocell, title, prompt,
   challenge_spec, reward_kind, reward_ref, max_completions, expires_at), and
   `irl_presence_proofs` (world_line_id, completer_device/user, agent_signature,
   signed_message_hash, coarse_cell, completed_at, collectible_mint). **No precise
   lat/lng in the proof** — bind to the coarse cell + a server-issued nonce only.

2. **Create a World Line (`api/irl/world-lines.js`)** — `POST /create` (owner places it
   at/near an existing pin), `GET /nearby` (coarse-cell proximity, mirrors pins.js
   filtering + hidden_at moderation), `GET /:id`. Anchor it to the AR placement frame the
   IRL room already shares so it lands in the same spot for every visitor.

3. **Complete a World Line (the proof ceremony)** — server issues a short-lived nonce
   bound to (world_line_id, coarse_cell, time window). The client proves coarse-cell
   co-location (same check the pin proximity read uses — server-derived, never trusted
   from the body), completes the agent interaction in AR, and the agent wallet signs
   `H(world_line_id, coarse_cell, nonce, completer)`. `POST /complete` verifies the
   signature server-side, enforces `max_completions`, is **idempotent per nonce**, and
   mints the collectible. Anti-spoof: rate-limit per device + IP (reuse `api/_lib/rate-limit.js`),
   reject stale/replayed nonces, reject if not co-located.

4. **AR experience (`src/irl/world-line-ar.js`, wired into `src/irl.js` + `src/xr.js`)** —
   on approach, the agent appears in AR at the anchored spot, speaks the prompt
   (TTS + lip-sync), runs the interaction, and on success plays a reward animation. Design
   the non-AR fallback (no WebXR support) as a first-class map-based completion, not a dead end.

5. **The reward + the collection** — minting a real, ownable collectible (the visitor's
   "I was there" proof) viewable in their profile/wallet. The proof is independently
   verifiable: expose `GET /verify/:proofId` that re-checks the agent signature so anyone
   can confirm it's genuine.

6. **Creator dashboard + discovery** — owners see completions (count + coarse heatmap,
   never precise points), and a public `/world-lines` discovery surface lists active
   quests by region (coarse), difficulty, and reward — wired into the existing IRL nav.

## Quality + privacy + security bar

- **Privacy is the headline feature, not a footnote.** Coarse cells only; no precise
  coordinate in any log/alert/proof; device identifiers never logged; presence anonymous.
  Re-read the privacy comments in `api/irl/pins.js` and honor every one.
- Every state designed: discovering, traveling-toward (with distance, coarse), in-range,
  AR-active, completing, reward-granted, already-completed, expired, capacity-reached,
  no-WebXR fallback. Reduced-motion AR alternative. a11y + 320/768/1440.
- Signature verification + nonce binding + idempotency + rate-limit are mandatory — this
  is an anti-cheat surface. CSRF on writes. Server-derived co-location only.
- $THREE is the only coin for any value reward. Collectible metadata references no other token.

## Then make it better (mandatory)

After it works: chain World Lines into a **trail** (complete A to unlock B across a
neighborhood); let creators fund a $THREE prize pool split among the first N completers;
add a leaderboard of explorers by verified proofs. Pick the upgrade that makes people
want to go outside, build it, re-evaluate.

## Definition of done

Meets the README Definition of done. Specifically: a World Line placed by an agent is
discoverable near its coarse cell, completable in a real AR session (with a real fallback),
produces an agent-signed proof that `GET /verify` independently confirms, mints a real
collectible to the visitor, and **never** exposes a precise coordinate anywhere. Anti-replay
and idempotency proven. `npm test` green (unit: signature + nonce verification, completion
caps; e2e: complete + verify + replay-rejected). Changelog entry; `npm run build:pages` validates.

## On completion — delete this file

```bash
git rm "prompts/moonshots/02-proof-of-presence-world-lines.md"
```
Stage it in the same commit as the implementation.
