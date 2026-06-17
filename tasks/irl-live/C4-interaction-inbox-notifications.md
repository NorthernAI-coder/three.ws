# C4 — Interaction log, inbox & notifications

> Epic C · Size **L** · The feedback loop. Pairs with D3 (realtime broadcast).
> Depends on C1 (overview surfaces unread counts). New table + 2 endpoints + UI.

## Goal

Record every IRL interaction with a placed agent (view, tap, pay, message) and
give the owner an **inbox**: a chronological feed of who interacted, where, and
how much they paid — with unread counts and notification hooks (in-app, plus
optional push/Telegram via the existing alert plumbing). This is what makes the
dashboard feel alive and turns C1's "interaction count" into something readable.

## Why it matters

Right now an owner has zero feedback when a stranger across the city taps their
agent or pays it. No feedback = no reason to return. The inbox is the dopamine
loop and the audit trail for earnings. It also feeds C1's status/last-seen and
D3's realtime ambient reactions.

## Current state (real lines)

- No interaction storage exists. `irl_pins` (`api/irl/pins.js:32`) has no child
  table.
- B3 (planned) performs the real x402 pay from the IRL client; B2's tap card is
  where a `view`/`tap` originates. Those are the call sites that will POST here.
- Notifications: `api/_lib/notify.js:11` `insertNotification(userId, type, payload)`
  already exists (in-app). Telegram ops alerts plumbing exists
  (`TELEGRAM_ALERTS_CHAT_ID`, per memory) — reuse, don't reinvent.

## What to build

### 1. Table (idempotent `ensureTable`, mirror `api/irl/pins.js:29`)

```sql
CREATE TABLE IF NOT EXISTS irl_interactions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pin_id         UUID NOT NULL,
  agent_id       UUID,
  owner_user_id  UUID,                       -- denormalized for fast inbox query
  actor_device   TEXT,                       -- anon device token of the passer-by
  actor_user_id  UUID,                       -- set when the actor was signed in
  type           TEXT NOT NULL,              -- view | tap | pay | message
  amount         NUMERIC,                    -- atomic units when type='pay'
  currency_mint  TEXT,                       -- $THREE / USDC mint when type='pay'
  payload        JSONB DEFAULT '{}'::jsonb,  -- message body, tx sig, geo, etc.
  read_at        TIMESTAMPTZ,                -- NULL = unread
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS irl_ix_owner   ON irl_interactions (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS irl_ix_pin     ON irl_interactions (pin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS irl_ix_unread  ON irl_interactions (owner_user_id) WHERE read_at IS NULL;
```

### 2. `POST /api/irl/interactions` (log; public, rate-limited)

Called by the IRL client (B2/B3). Resolve `pin_id → owner_user_id, agent_id` from
`irl_pins` server-side (never trust the client for ownership). Validate `type ∈
{view,tap,pay,message}`. De-dupe spammy `view`s (one per device per pin per
~60 s) so the feed isn't flooded.

```js
const TYPES = new Set(['view','tap','pay','message']);
if (!TYPES.has(body.type)) return json(res, 400, { error:'invalid type' });
const [pin] = await sql`SELECT user_id, agent_id FROM irl_pins WHERE id=${body.pinId}`;
if (!pin) return json(res, 404, { error:'pin not found' });
const [row] = await sql`
  INSERT INTO irl_interactions
    (pin_id, agent_id, owner_user_id, actor_device, actor_user_id, type, amount, currency_mint, payload)
  VALUES (${body.pinId}, ${pin.agent_id}, ${pin.user_id}, ${body.deviceToken ?? null},
          ${actorUserId}, ${body.type}, ${body.amount ?? null}, ${body.currencyMint ?? null},
          ${JSON.stringify(body.payload ?? {})}::jsonb)
  RETURNING id, created_at`;
// fan-out notifications for high-signal events
if (body.type === 'pay' || body.type === 'message') {
  await insertNotification(pin.user_id, 'irl_interaction', { pin_id: body.pinId, type: body.type, amount: body.amount });
  // optional: Telegram alert via existing plumbing (skip silently if creds absent)
}
```

For `pay`, only log after the x402 settlement is verified (B3 passes the tx
signature in `payload.signature`) — never record an unpaid "pay".

### 3. `GET /api/irl/interactions?mine=1` (owner inbox; auth)

```js
const rows = await sql`
  SELECT i.*, p.avatar_name, p.lat, p.lng
  FROM irl_interactions i
  JOIN irl_pins p ON p.id = i.pin_id
  WHERE i.owner_user_id = ${session.id}
  ORDER BY i.created_at DESC LIMIT 100`;
const [{ unread }] = await sql`
  SELECT COUNT(*)::int AS unread FROM irl_interactions
  WHERE owner_user_id = ${session.id} AND read_at IS NULL`;
return json(res, 200, { interactions: rows, unread });
```

Add a `PATCH /api/irl/interactions { ids:[…] }` (or `?markRead=1`) to set
`read_at = NOW()` for the owner's rows.

### 4. Dashboard inbox UI

An **Inbox** surface (full modal like `widgets.js:574`, or a dashboard tab) and
an unread badge on each C1 card + the page header (`Inbox •3`). Each row:

```
💸  Someone paid 0.05 USDC   ·  "Greeter" @ Dolores Park  ·  2m ago     [view tx ↗]
👆  Tapped your agent        ·  "Greeter" @ Dolores Park  ·  5m ago
💬  "is this the meetup?"    ·  "Greeter" @ Dolores Park  ·  8m ago     [reply]
```

Group by type with icons; `pay` rows link to the Solana explorer via
`payload.signature`; `message` rows can reply (writes a `message` interaction back
or routes to chat). Mark rows read on open. Poll `interactions?mine=1` every
~20 s now; D1/D3 upgrade this to realtime push later.

### States (state-kit)

- Loading → `skeletonHTML(5, 'row')`.
- Empty → "No interactions yet — when someone taps or pays your agent IRL, it
  shows up here." + "View in IRL" CTA.
- Error → `errorStateHTML` + `attachRetry`.

## Data / API changes

- New table `irl_interactions` (idempotent ensure on first hit).
- New: `POST /api/irl/interactions` (public, rate-limited), `GET
  /api/irl/interactions?mine=1` (auth), `PATCH /api/irl/interactions` (auth, mark
  read). Register all three routes in `vercel.json`.
- Reuses `insertNotification` + existing Telegram alert plumbing.

## Acceptance checklist

- [ ] `irl_interactions` created idempotently; indexes present.
- [ ] POST resolves owner/agent server-side, validates `type`, de-dupes `view`,
      only logs verified `pay`s.
- [ ] GET inbox returns rows + `unread`; PATCH marks read.
- [ ] `pay`/`message` trigger `insertNotification`; Telegram optional + silent
      when creds absent.
- [ ] Dashboard inbox renders feed, unread badges on cards + header, explorer
      links, reply affordance; marks read on open.
- [ ] $THREE/USDC only in any logged `currency_mint`; loading/empty/error designed;
      no console errors.

## Out of scope

Realtime push (D1/D3 replaces the 20 s poll) and the co-located ambient reaction
animation (D3). Here the loop is poll-based but complete.

## Verify

`npm run dev` → POST a synthetic `pay` interaction for an owned pin (mock req/res
or curl) → confirm a notification row, the inbox shows it with the explorer link,
unread badge increments, and opening clears it.
