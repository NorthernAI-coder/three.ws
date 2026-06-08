# C1 — Build the `three-token-data.js` shared data hook (keystone)

**Track:** C — build next · **Priority:** P1 · **Effort:** ~half day · **Depends on:** none
**Unblocks:** C2, C4, C5 (and optionally C6). Build this first.

## Context

The $THREE holder feature set (Tasks 14/16/17 in `tasks/wow-sprint/`) all need a **single source of
truth** for $THREE data. That module — `src/pump/three-token-data.js` — **does not exist yet**.
Today the closest thing is inline boot logic in `src/dashboard-next/pages/three-token.js`
(~lines 112–117) that does `Promise.all([stats, revenue-share, activity, tokenConfig])`. Generalize
that into a reusable, subscribable store so every holder surface reads from one place and they don't
drift.

**Do not invent new fetch primitives.** Every backend it needs already exists.

### Existing endpoints it wraps (all live; `api/three-token/[action].js` dispatcher)

- `GET /api/three-token/stats` (public, edge-cached ~20s) → `{ token:{ mint, symbol, price_usd,
  price_change_24h, market_cap, volume_24h, holders, liquidity, supply, decimals, source },
  protocol:{ total_agents, total_revenue_usd, total_payments, revenue_share_pool_pct, agent_deploy_burn } }`
- `GET /api/three-token/revenue-share` (authed; `401` if not signed in) → pro-rata math
  `{ user_id, token_price, total_supply, total_holders, platform_revenue_usd, revenue_share_pool_pct,
  revenue_share_pool_usd, per_token_yield }`. **This is protocol-level math, NOT a per-wallet
  claimable balance.**
- `GET /api/three-token/activity` → `{ events: [...] }` (recent revenue events)
- `GET /api/three-token/burns` → `{ burns:[...], total_burned, burn_per_deploy }`
- `POST /api/wallet/balances` with `{ chain:'solana', address }` → per-wallet token balances (used
  to compute the holder's $THREE position). Helper: `getBalances` in `api/_lib/balances.js`.

### Existing client helpers to reuse

- `src/dashboard-next/api.js` — `get`, `post`, `requireUser`, `ApiError` (typed 401), `esc`, `relTime`.
- `$THREE` mint constant: confirm the canonical one in the client (e.g. `src/token-pay.js`
  `fetchTokenConfig`) — value is `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.
- Self-cleanup `MutationObserver` pattern already in `three-token.js` (~lines 430–435).

## What to build

Create `src/pump/three-token-data.js` exporting a factory that returns a subscribable store (a
plain store, **not** a React hook — this codebase is vanilla JS modules):

```js
createThreeTokenData({ pollMs = 30000 }) => {
  getState(): ThreeTokenState,        // last snapshot, synchronous
  subscribe(fn): () => void,          // fires on every refresh; returns unsubscribe
  refresh(): Promise<void>,           // force a full fetch now
  refreshPosition(): Promise<void>,   // re-fetch only the wallet position (after a trade/claim)
  destroy(): void,                    // clear interval + observers
}
```

`ThreeTokenState` — each field carries its **own** status so widgets render independent
loading/empty/error states:

```
{
  protocol:     { status: 'loading'|'ok'|'error', token:{...stats.token}, protocol:{...stats.protocol}, source, updatedAt },
  revenueShare: { status, ...revenue-share fields | unauthenticated: true },
  activity:     { status, events: [] },
  burns:        { status, burns: [], total_burned, burn_per_deploy },
  position:     { status: 'idle'|'loading'|'unauthenticated'|'zero'|'ok'|'error',
                  wallet, amount, usd, pctOfSupply, price }   // null until a wallet is known
}
```

Behavior:
- `protocol` ← `get('/api/three-token/stats')`; `activity` ← `.../activity`; `burns` ← `.../burns`.
- `revenueShare` ← `get('/api/three-token/revenue-share')`; treat `ApiError` 401 as
  `{ status:'ok', unauthenticated:true }`, not an error.
- `position` ← resolve the signed-in user's linked Solana wallet, then
  `post('/api/wallet/balances', { chain:'solana', address })`, find the `$THREE` mint row, compute
  `pctOfSupply = amount / protocol.token.supply`. `idle` until a wallet is known; `unauthenticated`
  if not signed in; `zero` if the wallet holds no $THREE; `ok` otherwise.
- Polling refreshes `protocol` + `activity` on `pollMs`. `position` refreshes on demand only
  (`refreshPosition`) — don't hammer `/api/wallet/balances` on every tick.
- `destroy()` clears the interval and any observer. Include the `MutationObserver` self-cleanup so
  a store tied to a detached DOM node tears itself down (copy the `three-token.js` pattern).
- All fetches go through `src/dashboard-next/api.js` (`get`/`post`) — never raw `fetch`.

## Acceptance criteria

- [ ] `src/pump/three-token-data.js` exists and exports `createThreeTokenData` with the signature
      above.
- [ ] Each state field exposes an independent `status`; 401 on revenue-share is handled as
      `unauthenticated`, not an error.
- [ ] Position computes real `amount`/`usd`/`pctOfSupply` from `/api/wallet/balances` for a
      connected wallet, and reports `zero`/`unauthenticated`/`idle` correctly otherwise.
- [ ] Polling refreshes protocol/activity only; position is on-demand.
- [ ] `destroy()` fully tears down (no leaked intervals/observers).
- [ ] A focused unit test covers state transitions (loading → ok, 401 → unauthenticated, zero
      balance → zero) with the network layer stubbed at the `api.js` boundary.
- [ ] No other module needs to fetch $THREE data directly anymore (this is the one place).

## Verification

1. `npx vitest run src/pump/three-token-data.test.js` (add this test).
2. Temporarily wire the store into `three-token.js` boot (or a scratch harness in dev) and confirm,
   in a real browser with a connected wallet, that protocol/activity/position populate from real
   API responses (Network tab shows the real calls).

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). Real endpoints only — no sample arrays, no fake balances. Only
$THREE. Design loading/empty/error states deliberately (the per-field `status` exists for exactly
this).

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/C1-three-token-data-hook.md`.
3. Commit your code **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "feat(pump): three-token-data shared store as single source of truth for $THREE; close C1"`
4. Do **not** push — the human controls pushes.
