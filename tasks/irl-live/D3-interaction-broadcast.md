# D3 — Interaction broadcast

## Goal

When user **A** interacts with an IRL agent (tap / view profile / x402 pay /
message), broadcast it two ways:
1. **To the owner** — a realtime event lands in their inbox (pairs with C4),
   even though they may be on the other side of the world.
2. **To co-located viewers** — an *ambient reaction*: the agent emotes and a
   floating reaction (e.g. a 💜 burst, a "paid!" sparkle) plays for everyone
   currently viewing that geocell, so a busy agent visibly feels alive.

Define the flow `A → server → owner` and `A → server → nearby viewers`, on the
same channel D1/D2 opened.

## Why it matters

An interaction that only A sees is a dead end. Broadcasting it makes the agent a
*social object*: the owner gets the dopamine of "someone engaged with my agent
right now," and bystanders see activity that pulls them in. This is the feedback
loop that makes placing an agent worthwhile.

## Current state (real lines)

- `src/irl.js:1135` `openPinSheet()` — the tap card. Already wires View
  (`:1157`, opens `/agents/:id`) and Pay (`:1169`, real x402 via
  `withX402(window.ethereum, { maxPaymentUsd: 1.00 })` at `:1204`). These are the
  three interaction moments to instrument: **open**, **view**, **pay**.
- `src/irl-net.js` (D1) — the live channel; add an `interaction` emitter + handler.
- `multiplayer/src/rooms/IrlRoom.js` (D1) — already holds pins + viewers; add an
  `onMessage('interaction', …)` and an ambient reaction broadcast.
- C4 (`tasks/irl-live` sibling Epic C) defines the `irl_interactions` table + the
  owner inbox. **D3 is the realtime delivery layer for C4** — it does not invent
  the table; it writes to it and pushes a live event.
- B3 (`B3-real-interactions-profile-pay.md`) owns the *client-side* profile/pay
  wiring; D3 is the broadcast that fires *after* those succeed.

## What to build

### 1. Emit on interaction (client, `src/irl.js`)

```js
// In openPinSheet(): the agent was tapped/opened.
irlNet?.interaction({ type: 'open', pinId: pin.id, agentId: pin.agent_id });

// In the View handler (irl.js:1157): profile opened.
irlNet?.interaction({ type: 'view', pinId, agentId });

// In the Pay handler, ONLY after r.ok (irl.js:1207): real settled payment.
irlNet?.interaction({ type: 'pay', pinId, agentId, usd: paidUsd });
```

- Never emit `pay` optimistically — only after the x402 response is `ok` (a real
  on-chain settlement), so the owner's "earned" event is never a lie.
- `pay` carries no wallet address client-side; the server derives/records what it
  needs. Actor identity to the owner is the ephemeral session + optional handle,
  never raw GPS.

### 2. Route on the server (`IrlRoom.js`)

```js
this.onMessage('interaction', async (client, { type, pinId, agentId, usd }) => {
  if (!['open','view','pay','message'].includes(type)) return;
  if (!this._interactionOk(client.sessionId)) return; // rate-limit (see D4)
  const pin = this.state.pins.get(pinId);
  if (!pin) return;

  // (1) Persist + notify owner — write to irl_interactions (C4 schema) via the
  //     Vercel ingress, which also fans to the owner's live inbox channel.
  await ingest({ type, pinId, agentId, ownerToken: pin.ownerToken,
                 usd, actor: client.sessionId });

  // (2) Ambient reaction to everyone viewing THIS geocell.
  this.broadcast('reaction', { pinId, type, ts: Date.now() }, { afterNextPatch: false });
});
```

- `open`/`view` are common — debounce per (session, pin) so a jittery tap can't
  spam owner notifications or reaction bursts (e.g. max 1 `open` per pin per 5s).
- `pay` and `message` are rare/high-signal — always delivered, never debounced.

### 3. Ambient reaction render (client, `src/irl.js`)

```js
irlNet.on('reaction', ({ pinId, type }) => {
  const pin = nearbyPins.find(p => p.id === pinId);
  if (!pin?.group) return;
  playEmote(pin, type);          // agent waves (open) / bows (pay) on the GLB
  spawnFloatingReaction(pin, type); // 💜 for open/view, ✨"paid" for pay — CSS rise+fade
});
```

- `playEmote(pin, type)` triggers a quick animation on the loaded GLB if it has a
  matching clip, else a soft scale/bounce on the group — always *something*, never
  a no-op. Reuse the walk emote pattern (`schemas.js` `emote`/`emoteTs`).
- `spawnFloatingReaction` is a billboard projected like the name labels
  (`updateLabels()` `irl.js:1254`): rise 40px, fade over 1.2s, `transform`/
  `opacity` only (no layout), `will-change` set, auto-removed.
- Co-located viewers see the *placer's* interaction, not their own only — that's
  the point: the agent looks busy because real people are engaging it.

### 4. Owner live delivery (`A → server → owner`)

- The owner is almost never in the same geocell room, so we can't reach them via
  the geocell broadcast. The Vercel `ingest` (above) writes `irl_interactions`
  (C4) and pushes to an **owner channel**: either a per-owner Colyseus room the
  dashboard subscribes to, or a server-sent stream the C4 inbox already opens.
  D3 fires the event; C4 owns the inbox UI and the unread/notification surface.

## Event flow summary

```
A taps/pays pin P (owned by O, in geocell G)
   │ irlNet.interaction({type,pinId,agentId,usd})
   ▼
IrlRoom(G).onMessage('interaction')
   ├─ ingest() → POST {vercel}/api/irl/interactions  → INSERT irl_interactions (C4)
   │                                                  → push to O's inbox channel (C4)
   └─ broadcast('reaction') → every viewer in G sees the agent emote + 💜/✨
```

## Message shapes

| Direction | Type | Payload |
|---|---|---|
| client→server | `interaction` | `{ type:'open'|'view'|'pay'|'message', pinId, agentId, usd? }` |
| server→client (geocell) | `reaction` | `{ pinId, type, ts }` |
| server→owner-channel | `interaction` (C4) | `{ pinId, agentId, type, usd?, actor, ts }` |

## Data / API changes

- Writes go to **`irl_interactions`** (defined by C4) — D3 does not redefine it.
  Columns it relies on: `pin_id, agent_id, owner_token/owner_user_id, type, usd,
  actor_session, created_at`.
- New `POST /api/irl/interactions` ingress (or reuse C4's): validates the room's
  shared secret, inserts the row, returns fast. Vercel can't hold the owner WS,
  so the live-to-owner push is the Colyseus host's job, triggered by the ingress.

## Connecting / reconnecting / offline states (state-kit)

- If A is in poll-fallback (no WS): the interaction still **records** via the
  normal REST path (pay already hits x402; open/view POST to
  `/api/irl/interactions` directly) so the owner's inbox is never lossy — only the
  *ambient reaction* is skipped (no live channel to broadcast on). Degrade the
  flourish, never the record.
- Reaction rendering guards on `pin.group` existing; a reaction for a pin that
  scrolled out of range is silently dropped.

## Acceptance checklist

- [ ] A pays pin P (real x402 ok) → owner's C4 inbox gets a live `pay` event with the USD amount.
- [ ] A co-located viewer B sees pin P's agent emote + a "paid" reaction within ~1s.
- [ ] `open`/`view` debounced (no notification/reaction spam from rapid taps).
- [ ] `pay`/`message` never debounced or dropped.
- [ ] No raw GPS or wallet address of A reaches the owner or other viewers.
- [ ] Poll-fallback: interaction still recorded for the owner; only the ambient flourish is skipped.
- [ ] Reactions are pure transform/opacity, auto-cleaned, no layout jank.
- [ ] No console errors.

## Out of scope

- The inbox UI, unread counts, notification permissions → **C4**. The pay/profile
  wiring itself → **B3**. Presence counts → **D2**. Abuse caps/rate-limit policy
  details → **D4** (D3 just calls the limiter).

## Verify

`npm run dev:walk-all`, two `/irl` profiles at one geocell + the C4 dashboard open
on a third: tap and (devnet/testnet) pay from A, confirm B sees the emote+reaction
and the dashboard inbox lights up live.
