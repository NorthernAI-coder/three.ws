# C1 — Owner dashboard overview (live IRL agent monitoring)

> Epic C · Size **M** · Extends `src/dashboard-next/pages/irl-placements.js`.
> Foundation for C2–C6 — every per-agent action surface links off this card.

## Goal

Turn the flat "My Placed Avatars" list into a real **monitoring overview**. Each
placed-agent card surfaces, at a glance: live $THREE/SOL balance, online/visible
status, last-seen + last-interaction time, lifetime interaction count, and a
human location label. From each card the owner opens the management surfaces
(skills, reputation, location, outfit, inbox) built in C2–C6.

## Why it matters

A pin you can't observe is dead weight. Owners place an agent somewhere they
aren't standing, then leave. The dashboard is their only window onto whether
the agent is working, earning, and being interacted with. Without live signal
the product is a write-only toy. This card is the home base for the whole epic.

## Current state (real lines)

- `src/dashboard-next/pages/irl-placements.js:131` `mount(el)` renders skeletons
  (`:141`), fetches `GET /api/irl/pins?mine=1` (`:145`), renders `cardHtml` (`:97`),
  then reverse-geocodes each pin one-at-a-time (`:169`). Remove + caption edit are
  wired via delegation (`:184`).
- `api/irl/pins.js:80` the `?mine=1` branch already selects
  `id, lat, lng, heading, avatar_url, avatar_name, caption, agent_id, placed_at, expires_at`.
  **`agent_id` is already returned** — the link to the agent record exists.
- Balance source: `api/agents/solana-wallet.js:257` `handlePublicWalletRead`
  returns `{ data: { wallet, balance, lamports, balance_error } }` (no auth, 60 s
  cached). Route: `GET /api/agents/:id/solana`.
- No status/last-seen/interaction-count exists yet — C4 introduces `irl_interactions`.

## What to build

### 1. `GET /api/irl/agent-summary?mine=1` (new, in `api/irl/pins.js` or sibling)

One round-trip that joins each owned pin to its agent + derived activity, so the
card paints without N balance calls blocking first render.

```js
// auth required; returns one row per owned pin
const rows = await sql`
  SELECT p.id AS pin_id, p.agent_id, p.lat, p.lng, p.heading, p.caption,
         p.avatar_url, p.avatar_name, p.placed_at, p.expires_at,
         a.name AS agent_name, a.meta->>'solana_address' AS solana_address,
         a.meta->>'solana_asset'  AS solana_asset,
         COALESCE(ix.total, 0)            AS interaction_count,
         ix.last_at                       AS last_interaction_at
  FROM irl_pins p
  LEFT JOIN agent_identities a ON a.id = p.agent_id AND a.deleted_at IS NULL
  LEFT JOIN (
     SELECT pin_id, COUNT(*)::int AS total, MAX(created_at) AS last_at
     FROM irl_interactions GROUP BY pin_id          -- table from C4
  ) ix ON ix.pin_id = p.id
  WHERE p.user_id = ${session.id}
  ORDER BY p.placed_at DESC LIMIT 100`;
```

If `irl_interactions` is not yet created (C4 not shipped), wrap the LEFT JOIN in a
`to_regclass('irl_interactions') IS NOT NULL` guard and fall back to `0`/`NULL` —
never 500. Status is **derived**: `online` if a nearby-fetch touched the pin in
the last 5 min (C4/D1 will write `last_seen_at`); until then derive `visible` from
`expires_at > NOW()`.

### 2. Card upgrade in `irl-placements.js`

Keep `mountShell` + `requireUser` + `get()` exactly as-is. Replace the
hand-rolled skeleton/empty/error with **state-kit**:

```js
import { skeletonHTML, emptyStateHTML, errorStateHTML, ensureStateKitStyles, attachRetry }
  from '../../shared/state-kit.js';

ensureStateKitStyles();
list.innerHTML = `<div class="irl-grid">${skeletonHTML(3, 'row')}</div>`;
// error → errorStateHTML({ title:'Couldn't load your IRL agents', scope:'irl' }); attachRetry(list, render)
// empty → emptyStateHTML({ title:'No agents placed yet', body:'…', actions:[{label:'Open IRL', href:'/irl', primary:true}] })
```

Extend `cardHtml(pin, geo)` with a stats strip (skeleton values first, hydrated
after). Render a **balance chip** (`—` skeleton → `0.42 SOL` / `Balance
unavailable` on `balance_error`), a **status dot** (green online / amber visible /
grey expired), **last interaction** (`relTime`), and an **interaction count**.
Add a tab/link row on each card to the C2–C6 surfaces:

```
[Skills] [Reputation] [Location] [Outfit] [Inbox •3]   View in IRL ↗   Remove
```

Each is an anchor/button carrying `data-pin="${pin.id}" data-agent="${pin.agent_id}"`.
Disable Skills/Reputation/Outfit (with a tooltip) when `agent_id` is null — an
anonymously-placed avatar has no agent record to manage.

### 3. Balance hydration (parallel, non-blocking)

After cards paint, fan out exactly like `widgets.js:78` does with stats:

```js
const bals = await Promise.allSettled(rows.map(r =>
  r.agent_id ? get(`/api/agents/${encodeURIComponent(r.agent_id)}/solana`) : Promise.reject('no-agent')));
bals.forEach((res, i) => applyBalanceToCard(card(i),
  res.status === 'fulfilled' ? res.value.data : { balance_error: 'unavailable' }));
```

Render `balance_error` as the literal "Balance unavailable" chip (per the
wallet-card convention) — never show a misleading `0`.

## Data / API changes

- New: `GET /api/irl/agent-summary?mine=1` → `{ agents: [...] }` (auth). Register
  its route in `vercel.json` (mirror the `/api/irl/pins` entry).
- No `irl_pins` schema change. Reuses `agent_identities.meta.solana_address`.
- Reuses existing `GET /api/agents/:id/solana` for balance.

## Acceptance checklist

- [ ] `GET /api/irl/agent-summary?mine=1` returns agents w/ counts; degrades to
      `0`/`null` when `irl_interactions` absent; never 500s.
- [ ] Card shows balance chip, status dot, last-seen, interaction count, location.
- [ ] Balance hydrates in parallel after first paint; `balance_error` → "Balance
      unavailable", not `0`.
- [ ] state-kit skeleton/empty/error with working Retry.
- [ ] Each card links to C2–C6 surfaces (disabled + tooltip when `agent_id` null).
- [ ] Reverse-geocode label preserved; 320 / 768 / 1440px clean; no console errors.

## Out of scope

Realtime push of status (D1/D3), the management panels themselves (C2–C6), and
the interaction table itself (C4) — this card only *reads* and *links*.

## Verify

`npm run dev` → `/dashboard/irl-placements` with ≥1 placed agent: confirm the
Network tab shows one `agent-summary` call + parallel `…/solana` calls, balance
chips resolve to real on-chain values, and every card link navigates.
