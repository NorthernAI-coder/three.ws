# Task: Server-backed real-time tip feed for /club

## Repo context

Working tree: `/workspaces/three.ws`. Today the right-panel "Live
tips" widget at
[src/club.js:97-111](../../src/club.js) prepends rows into an
in-memory DOM list that lives only in the current browser tab. A
page refresh wipes it. Two simultaneous visitors don't see each
other's tips. The world feels dead.

The persistence path:

- Inserts on settlement in
  [api/x402/dance-tip.js](../../api/x402/dance-tip.js) `handler`.
- Reads via `GET /api/club/tips` (recent list).
- Live updates via `GET /api/club/tips/stream` (SSE).
- The /club page subscribes to SSE on boot.

## Rails (CLAUDE.md — non-negotiable)

- Real Neon Postgres. No in-memory ring buffer pretending to be a
  feed.
- Real SSE — not long-polling, not WebSocket-with-no-server. The
  rest of the repo uses node-postgres + the `sql` template from
  `api/_lib/db.js`; match that.
- Errors handled at boundaries: SSE disconnects gracefully on
  client navigation; the insert fires-and-forgets (the payment is
  already settled — a DB hiccup must not roll back the dance).
- Done = open `/club` in two tabs, tip from one, see the row appear
  in both within 500 ms.

## Subagent delegation

### Subagent A (Explore)

> In `/workspaces/three.ws`, return:
>
> 1. The `sql` template binding and migration directory pattern
>    (`api/_lib/db.js`, `api/_lib/migrations/*.sql`).
> 2. The most recent migration file as a style template.
> 3. Any existing SSE endpoint in the repo to crib from. Check
>    `api/` recursively; if none, fall back to the `api/_lib/http.js`
>    helpers and document what's missing.
> 4. How `paidEndpoint` in
>    [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js)
>    exposes the resolved `payer` / `requirement` to the handler
>    function.

Wait for A before Step 1.

## What to implement

### Step 1 — migration

`api/_lib/migrations/2026-05-22-club-tips.sql`:

```sql
create table if not exists club_tips (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null unique,
  dancer text not null,
  dance text not null,
  clip text,
  label text,
  payer text,
  network text,
  amount_atomics numeric,
  asset text,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  paid_at timestamptz,
  paid_tx text,
  created_at timestamptz not null default now()
);

create index if not exists club_tips_created_at_desc
  on club_tips (created_at desc);

create index if not exists club_tips_dancer_created
  on club_tips (dancer, created_at desc);
```

`paid_at` / `paid_tx` are for prompt 08 (payouts) — schema is added
here so the column doesn't need a second migration.

Apply via the project's standard migration runner.

### Step 2 — insert on settlement

In [api/x402/dance-tip.js](../../api/x402/dance-tip.js) `handler`,
after the ticket object is computed:

```js
import { sql } from '../_lib/db.js';

// fire-and-forget — the payment already settled, do not block the response
sql`
  insert into club_tips
    (ticket_id, dancer, dance, clip, label, payer, network,
     amount_atomics, asset, started_at, ends_at)
  values
    (${ticketId}, ${dancer}, ${style.key}, ${style.clip}, ${style.label},
     ${payer ?? null}, ${requirement?.network ?? null},
     ${requirement?.amount ?? null}, ${requirement?.asset ?? null},
     ${now}, ${ends})
  on conflict (ticket_id) do nothing
`.catch((err) => console.error('[club-tips] insert failed', err));
```

Note: `now` and `ends` are `Date` objects — Postgres accepts ISO via
the parameter binding. `ticketId` becomes a stable variable instead
of inlining `crypto.randomUUID()` into the response.

### Step 3 — GET /api/club/tips

`api/club/tips.js`:

```js
import { sql } from '../_lib/db.js';
import { cors, json, method, wrap, error } from '../_lib/http.js';

export default wrap(async (req, res) => {
  if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
  if (!method(req, res, ['GET'])) return;

  const limit = Math.min(Math.max(Number(req.query?.limit) || 20, 1), 100);
  const dancer = typeof req.query?.dancer === 'string'
    ? req.query.dancer.trim().slice(0, 4)
    : null;

  const rows = await (dancer
    ? sql`
        select ticket_id, dancer, dance, clip, label, payer, network,
               amount_atomics, asset, started_at, ends_at, created_at
        from club_tips
        where dancer = ${dancer}
        order by created_at desc
        limit ${limit}
      `
    : sql`
        select ticket_id, dancer, dance, clip, label, payer, network,
               amount_atomics, asset, started_at, ends_at, created_at
        from club_tips
        order by created_at desc
        limit ${limit}
      `);

  return json(res, 200, { tips: rows });
});
```

### Step 4 — SSE /api/club/tips/stream

`api/club/tips-stream.js`:

```js
import { sql } from '../_lib/db.js';
import { cors, wrap, error } from '../_lib/http.js';

const HEARTBEAT_MS = 15_000;
const POLL_MS = 800;

export default wrap(async (req, res) => {
  if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
  res.statusCode = 200;
  res.setHeader('content-type', 'text/event-stream');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.setHeader('x-accel-buffering', 'no');

  let cursor = new Date();
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  send('hello', { ts: Date.now() });

  const heartbeat = setInterval(() => res.write(':hb\n\n'), HEARTBEAT_MS);

  const poll = setInterval(async () => {
    try {
      const rows = await sql`
        select ticket_id, dancer, dance, clip, label, payer, network,
               amount_atomics, asset, started_at, ends_at, created_at
        from club_tips
        where created_at > ${cursor}
        order by created_at asc
        limit 50
      `;
      for (const row of rows) {
        cursor = row.created_at > cursor ? row.created_at : cursor;
        send('tip', row);
      }
    } catch (err) {
      console.error('[club-tips-stream] poll failed', err);
    }
  }, POLL_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(poll);
    res.end();
  });
});
```

The 800 ms poll is the cheapest reliable path against Neon without
adding LISTEN/NOTIFY plumbing. If LISTEN/NOTIFY is already wired in
this repo (subagent A surfaces this), use it instead.

Add a `vercel.json` route entry that gives this endpoint
`maxDuration: 300` so the connection can stay open up to 5 minutes
on Vercel (`Hobby` plan limit). The client reconnects automatically
via `EventSource` after disconnect.

### Step 5 — client subscription

In [src/club.js](../../src/club.js):

```js
async function loadInitialTips() {
  const r = await fetch('/api/club/tips?limit=20');
  if (!r.ok) return;
  const { tips } = await r.json();
  for (const t of tips.reverse()) renderTipRow(t);
}

function subscribeTipStream() {
  let es = null;
  const open = () => {
    es = new EventSource('/api/club/tips/stream');
    es.addEventListener('tip', (e) => {
      try { renderTipRow(JSON.parse(e.data), { live: true }); } catch {}
    });
    es.onerror = () => {
      es?.close();
      setTimeout(open, 1500);  // reconnect — backoff naive, fine for now
    };
  };
  open();
  window.addEventListener('beforeunload', () => es?.close());
}
```

Call both in `bootstrap()` after the venue load resolves. Move the
existing `pushFeed(...)` body into `renderTipRow(...)` so the local
tip echo and the SSE echo share rendering.

Dedupe: when a tip lands locally (via the X402 modal callback),
remember its `ticket_id` and skip the SSE row if it arrives. A small
`Set` of last 50 ids handles this.

### Step 6 — error/timeout UX

- If `/api/club/tips` returns non-OK, show "Couldn't load tip
  history" in the feed, retry once after 4s.
- If SSE never connects after 3 retries, show a "live updates
  paused" badge in the feed header.

### Step 7 — tests

`tests/api/club-tips.test.js`:

- Mock `sql`; assert `GET /api/club/tips` returns the rows.
- Assert the `dancer` query param filters and clamps.

`tests/api/club-tips-stream.test.js`:

- Use `node:http` to spin up the handler on a free port.
- Connect with the `eventsource` package, insert a row via the
  mocked `sql`, assert the consumer receives a `tip` event with
  the right `ticket_id`.

`tests/api/dance-tip.test.js`:

- Assert the settlement path inserts into `club_tips` (use a
  test-double `sql` collector).
- Assert duplicate ticket_ids no-op (the `on conflict do nothing`
  clause).

### Step 8 — manual end-to-end

1. Open `/club` in two browser tabs.
2. Tip from tab A.
3. Tab B's feed shows the row within ~1s (poll cadence).
4. Refresh tab A — the row is still there (loaded from DB).
5. Kill the SSE endpoint mid-stream; tab B shows "live updates
   paused"; restart and the badge clears.

## Definition of done

- Migration applied, `club_tips` table live.
- Settlement inserts rows.
- `GET /api/club/tips` returns them.
- `GET /api/club/tips/stream` SSE pushes new ones.
- `/club` subscribes on boot, preloads history, dedupes local echo.
- Two-tab manual test passes.
- `npm test` green.

## Constraints

- Do not block the dance-tip response on the DB insert — the user
  has already paid; a DB hiccup must not surface as a 5xx.
- Do not store anything PII in `club_tips` beyond the payer
  wallet address (already public on-chain).
- Do not poll faster than 800ms — Neon connection budget matters.
- Do not skip the `x-accel-buffering: no` header — without it
  Vercel's gateway buffers the stream and breaks SSE.
