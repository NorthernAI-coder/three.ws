# Task: Per-dancer leaderboard + automatic tip payout sweep for /club

## Repo context

Working tree: `/workspaces/three.ws`. Once prompt 07 is in,
`club_tips` rows carry every settled tip. To make the rig feel like
a real venue, each dancer needs:

- A leaderboard (last hour / day / all-time, by USDC amount).
- A real wallet address (one Solana, one EVM) where their tips
  accumulate, swept by a cron job.

Existing payout rails live under
[api/payments/solana/[action].js](../../api/payments/solana/[action].js)
and
[api/payments/evm/[action].js](../../api/payments/evm/[action].js).
Existing cron handlers live in
[api/cron/[name].js](../../api/cron/[name].js).

## Rails (CLAUDE.md — non-negotiable)

- No mocks, no test-net payouts pretending to be real. Real Base
  mainnet + Solana mainnet, real USDC, real signatures.
- Payouts idempotent — re-running the cron must not double-pay. The
  `paid_at` + `paid_tx` columns added in prompt 07 carry this.
- Errors handled at boundaries: an RPC failure during sweep retries
  later; the cron must not crash the whole batch on one bad
  dancer.
- Done = a tip → leaderboard update visible → cron sweeps → dancer
  wallet balance increases on-chain → `paid_at` set → leaderboard
  marks the row as paid.

## Subagent delegation

### Subagent A (Explore)

> In `/workspaces/three.ws`, return:
>
> 1. The Solana payout entry point in
>    [api/payments/solana/[action].js](../../api/payments/solana/[action].js)
>    — function signature, how it gets signing keys, how it builds
>    + sends a USDC transfer, how it reports the resulting
>    signature.
> 2. The same for
>    [api/payments/evm/[action].js](../../api/payments/evm/[action].js).
> 3. The cron-routing convention in
>    [api/cron/[name].js](../../api/cron/[name].js) — how new
>    handlers are added (the function name pattern,
>    `CRON_SECRET` guard, `x-vercel-cron` header).
> 4. The `vercel.json` cron-schedule registration syntax.
> 5. Any existing `api/_lib/payouts*.js` helper.

### Subagent B (Explore)

> Read [docs/internal/PROGRESS.md](../../docs/internal/PROGRESS.md)
> for any prior leaderboard or payout work. Quote anything relevant
> to USDC sweep cadence, fee handling, dust thresholds.

Wait for both.

## What to implement

### Step 1 — schema

`api/_lib/migrations/2026-05-23-club-dancer-wallets.sql`:

```sql
create table if not exists club_dancer_wallets (
  dancer text primary key,
  display_name text not null,
  bio text,
  evm_address text,
  solana_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists club_payouts (
  id uuid primary key default gen_random_uuid(),
  dancer text not null references club_dancer_wallets(dancer),
  network text not null,                 -- 'solana' | 'base'
  asset text not null,                   -- USDC mint / address
  amount_atomics numeric not null,
  tx text not null,                      -- on-chain signature / hash
  swept_tip_count integer not null,
  created_at timestamptz not null default now()
);

create index if not exists club_payouts_dancer_created
  on club_payouts (dancer, created_at desc);
```

Seed the four dancers with real wallet addresses (passed via env
vars at deploy time, never committed):

```sql
-- Run once via the migration tool with env-var substitution:
insert into club_dancer_wallets (dancer, display_name, evm_address, solana_address)
values
  ('1', 'Nyx',     :evm1, :sol1),
  ('2', 'Ari',     :evm2, :sol2),
  ('3', 'Sable',   :evm3, :sol3),
  ('4', 'Vesper',  :evm4, :sol4)
on conflict (dancer) do update set
  evm_address    = excluded.evm_address,
  solana_address = excluded.solana_address,
  updated_at     = now();
```

### Step 2 — leaderboard endpoint

`api/club/leaderboard.js`:

```js
import { sql } from '../_lib/db.js';
import { cors, json, method, wrap, error } from '../_lib/http.js';

export default wrap(async (req, res) => {
  if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
  if (!method(req, res, ['GET'])) return;

  const window = (req.query?.window || 'all').toString();
  const since = ({
    hour: `now() - interval '1 hour'`,
    day:  `now() - interval '24 hours'`,
    week: `now() - interval '7 days'`,
    all:  `'epoch'::timestamptz`,
  })[window];
  if (!since) return error(res, 400, 'bad_window', 'window must be hour|day|week|all');

  const rows = await sql.unsafe(`
    select
      d.dancer,
      d.display_name,
      coalesce(sum(t.amount_atomics), 0)::text as total_atomics,
      count(t.*)::int as tip_count,
      coalesce(sum(case when t.paid_at is null then t.amount_atomics else 0 end), 0)::text
        as unpaid_atomics
    from club_dancer_wallets d
    left join club_tips t
      on t.dancer = d.dancer and t.created_at >= ${since}
    group by d.dancer, d.display_name
    order by total_atomics::numeric desc
  `);

  return json(res, 200, { window, rows });
});
```

Note `sql.unsafe` only because the time window is parameterized via
inline SQL strings selected from a whitelist — never user input.

### Step 3 — leaderboard widget

In [pages/club.html](../../pages/club.html), add a new
`<section class="club-section">` after the "Poles" section:

```html
<section class="club-section">
  <h2>Leaderboard</h2>
  <div class="club-lb-tabs">
    <button class="club-lb-tab is-active" data-window="day">24h</button>
    <button class="club-lb-tab" data-window="hour">1h</button>
    <button class="club-lb-tab" data-window="all">All</button>
  </div>
  <div id="club-lb-rows"></div>
</section>
```

In [src/club.js](../../src/club.js): fetch `/api/club/leaderboard?window=day`
on boot + re-fetch on tab click + re-fetch every 30s while the page
is visible. Render compact rows: rank · headshot · name · USDC ·
tip count.

### Step 4 — payout sweep cron

Extend [api/cron/[name].js](../../api/cron/[name].js) with a new
branch:

```js
case 'club-payouts': return handleClubPayouts(req, res);
```

`handleClubPayouts`:

1. Auth via the existing CRON_SECRET / `x-vercel-cron` guard.
2. Query: per dancer, find unpaid tips grouped by network:

```sql
select
  d.dancer, d.evm_address, d.solana_address,
  t.network, t.asset,
  array_agg(t.id) as tip_ids,
  sum(t.amount_atomics) as total_atomics
from club_tips t
join club_dancer_wallets d on d.dancer = t.dancer
where t.paid_at is null
group by d.dancer, d.evm_address, d.solana_address, t.network, t.asset
having sum(t.amount_atomics) >= ${DUST_THRESHOLD_ATOMICS}
```

`DUST_THRESHOLD_ATOMICS` = `5000` (0.005 USDC) so we don't burn fees
sweeping a single $0.001 tip.

3. For each group:
   - Resolve the recipient wallet by network (evm_address or solana_address).
   - If missing, skip with a log entry (the dancer hasn't registered a wallet on that chain yet).
   - Call the existing payout function from
     `api/payments/{network}/[action].js`. Use the merchant /
     treasury hot wallet as the source — it's already what received
     the original tip.
   - On success, single transaction:
     ```sql
     with payout as (
       insert into club_payouts
         (dancer, network, asset, amount_atomics, tx, swept_tip_count)
       values
         (${dancer}, ${network}, ${asset}, ${total},
          ${signature}, ${tipIds.length})
       returning id
     )
     update club_tips
       set paid_at = now(), paid_tx = ${signature}
       where id = any(${tipIds});
     ```
   - On RPC failure, log + continue to the next dancer (one dancer's
     payout must not block the others).

4. Return a JSON summary of dancers swept + total atomics + tx
   signatures.

### Step 5 — vercel cron schedule

In `vercel.json`, register the cron:

```json
{
  "crons": [
    { "path": "/api/cron/club-payouts", "schedule": "*/5 * * * *" }
  ]
}
```

Every 5 minutes. Dust threshold means cheap-tip-only periods amortize.

### Step 6 — register-wallet flow (one-time admin)

Per-dancer wallets ship via the seeded migration in Step 1, but
also expose a small admin endpoint
`POST /api/admin/club/dancer-wallet` that lets an admin update
`(dancer, evm_address, solana_address, display_name, bio)`.
Use the existing `requireAdmin` + `requireCsrf` guards
([api/admin/user/[id].js](../../api/admin/user/[id].js) is the model).

### Step 7 — tests

`tests/api/club-leaderboard.test.js`:

- Mock `sql`, drive each window, assert SQL shape.
- Assert bad window returns 400.

`tests/api/club-payouts-cron.test.js`:

- Mock the per-network payout fn + `sql`.
- Stage unpaid tips below dust → assert no payout.
- Stage unpaid tips above dust → assert payout, mark-paid, ledger
  row inserted.
- Make one network's RPC throw → assert the other completes; the
  throw is logged, not rethrown.

### Step 8 — manual end-to-end

1. Seed four real wallets (use small-balance test wallets first if
   safer — but they must be mainnet wallets, not devnet).
2. Run a tip from a real wallet for $0.001 USDC.
3. Repeat 5 times so the unpaid total exceeds the dust threshold.
4. Manually invoke `/api/cron/club-payouts` with the CRON_SECRET.
5. Confirm:
   - Solana payout tx visible on Solscan, recipient = dancer
     wallet.
   - `club_tips.paid_at` is set on those rows.
   - `club_payouts` has a new ledger row.
   - Leaderboard "unpaid" column drops to ~0.

## Definition of done

- Schema applied; four dancers seeded with real mainnet wallets.
- `GET /api/club/leaderboard` returns ranked rows.
- Leaderboard widget renders + auto-refreshes.
- Cron handler `club-payouts` sweeps unpaid tips, sends real USDC,
  idempotent on retry.
- Admin endpoint to register/update dancer wallets.
- Tests green; manual mainnet sweep observed once.

## Constraints

- Do not skip the dust threshold — sweeping a single $0.001 tip
  costs more in fees than the tip itself.
- Do not store private keys in any new table. The treasury signing
  key already lives in the deploy env vars; sweeps re-use it.
- Do not run the cron faster than every 5 minutes — RPC budget and
  fee amortization matter.
- Do not let one dancer's RPC failure crash the cron batch — wrap
  per-dancer in try/catch.
- Do not let the leaderboard endpoint accept arbitrary windows. The
  `{hour,day,week,all}` whitelist is non-negotiable; `sql.unsafe`
  is only safe with that whitelist.
