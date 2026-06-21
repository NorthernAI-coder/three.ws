# P19 · Agent Revenue Ledger & Automated Payouts

> **Workstream:** Monetization (revenue engine) · **Priority:** P0 · **Effort:** L · **Depends on:** P18

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map). Note the $THREE-only rule and the two coin-agnostic exceptions.
2. three.ws monorepo: vanilla JS + Vite frontend, Vercel functions in `api/`, tests via `vitest` + Playwright (`npm test`), dev server `npm run dev`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.

## Context
A marketplace sale already routes 90% to the seller, but earnings live in two disconnected places and the per-agent rollup + automated payout are missing:

- `api/_lib/token/config.js` — `SPLIT_POLICIES.marketplace_sale` = `seller 9000 / treasury 500 / rewards 500` bps. `applySplit()` distributes atomics with the remainder to the highest-bps leg (no dust). $THREE sales settle this way.
- `api/_lib/token/payments.js` — `settlePayment()` writes `token_payments` with a `splits` jsonb array (`{role,bps,address,atomics}`), `ref_type`, `ref_id`, UNIQUE(nonce)+UNIQUE(tx_signature). `creatorEarnings({ sellerWallet })` already sums the `seller` leg across all sales via `splits @> [{role:'seller',address}]` jsonb containment — this is the $THREE-settled earnings read. It's a per-WALLET read with no per-AGENT attribution.
- `api/_lib/agent-wallet.js` — `triggerSkillPayment()` is the EVM rail: it charges an agent for a paid skill, paying `marketplace_skills.price_per_call_usd` to the author's `user_wallets` primary EVM address via `delegatedSpend()`, recording in `agent_payments` (status pending→confirmed/failed). A separate, USD/wei-denominated revenue stream from the $THREE rail.
- `api/agents/[id].js` dispatches `sub === 'wallet' && action === 'withdraw'` to the wallet handler; `api/agents/solana-wallet.js` owns the custodial Solana wallet (provision, balance, spend-limit-guarded withdraw via `agent-trade-guards.js`). `getOrCreateAgentSolanaWallet` / `ensureAgentWallet` provision custodial keys.
- Existing payout plumbing to reuse, not reinvent: `api/cron/[name].js` → `handleProcessWithdrawals` (line 3191, also aliased `monetization-payouts`) already pulls `agent_withdrawals` rows (status `pending`→`processing`→`completed`), pages ops on rows stranded in `processing` >15m (no blind retry — double-pay risk), and sends via `transferSolanaUSDC` / `sendEvmUsdc`. `api/_lib/monetization.js`, `api/billing/withdrawals/`, `api/monetization/withdrawals.js`, and migration `20260621120000_revenue-integrity.sql` define the withdrawal model.

## Problem / opportunity
A seller's $THREE earnings are computable only per-wallet (`creatorEarnings`), but the product surface is the agent. There's no per-agent earnings rollup, no "this agent earned X this week" view, and no automated payout that sweeps an agent's accrued seller-leg balance to its owner. The EVM `agent_payments` stream and the $THREE `token_payments` stream never reconcile into one earnings number. Creators can't see or collect what their agents made without manual SQL.

## Mission
Ship a per-agent earnings ledger (a materialized rollup keyed by agent, sourced from the existing settle ledgers), a payout that sweeps accrued earnings to the owner through the existing `agent_withdrawals` rail, and an agent-earnings dashboard view — all idempotent, no second source of truth for the underlying sales.

## Scope
**In scope:** per-agent earnings rollup reads, an agent-earnings API + dashboard panel, a payout that creates `agent_withdrawals` rows from accrued unpaid earnings and lets the existing `handleProcessWithdrawals` cron settle them, idempotency so a sale is paid out once.
**Out of scope:** changing split ratios, new withdrawal transport (reuse `transferSolanaUSDC`/`sendEvmUsdc`), the buyback/distribute loop (`run-distribute-payments` is separate).

## Implementation guide
1. **Attribution key.** Every settle write must carry the agent. Audit the marketplace settle call sites (`api/payments/purchase-confirm.js`, `api/_lib/x402.js`, the P18 time-pass path) and ensure `ref_type` distinguishes the sale kind and `ref_id` resolves to an agent. Add `agent_id` to the quote/settle metadata so `token_payments` can be grouped by agent without re-parsing `splits`. Backfill via the existing `ref_id`→agent mapping where derivable.
2. **Ledger read (`api/_lib/token/payments.js`).** Add `agentEarnings({ agentId, sellerWallet, limit, before })` next to `creatorEarnings`: sum the `seller` leg for sales attributed to this agent (join on the new `agent_id` or via `ref_id`). Return `{ total_atomics, paid_atomics, unpaid_atomics, sale_count, mint, decimals, items[] }`. `paid_atomics` is the sum already covered by `agent_withdrawals` so `unpaid_atomics` is the sweepable balance.
3. **Reconcile EVM stream.** Have `agentEarnings` also surface the `agent_payments` (EVM) confirmed inflows for the agent so the dashboard shows both rails, clearly labelled by currency ($THREE vs USDC). Do not merge the numbers — show both, never invent a converted total.
4. **Payout creation (`api/_lib/monetization.js` or new `api/agents/[id]/payout.js`).** Owner-authorized (session/bearer + agent-ownership check, mirror `skill-prices.js`). Computes `unpaid_atomics`, applies the agent's spend limits (`agent-trade-guards.js`), inserts an `agent_withdrawals` row (status `pending`, destination = owner's payout wallet from `billing/payout-wallets`). Idempotency: a `UNIQUE` claim keyed on the agent + a settlement watermark (e.g. last paid `token_payments.created_at`) so two concurrent payout calls create one withdrawal. The existing `handleProcessWithdrawals` cron settles it — do not send funds inline.
5. **Payout cron.** Add an optional auto-sweep: extend `handleProcessWithdrawals` (or a thin sibling) to also enqueue payouts for agents whose `unpaid_atomics` crosses a per-agent threshold. Reuse the stranded-row ops alert and the no-blind-retry rule already in that handler. Schedule it in `vercel.json` if not already covered by `monetization-payouts`.
6. **Dashboard (`src/dashboard-next/pages/monetize.js`).** It already fetches `/api/billing/revenue`, `/api/billing/withdrawals`, `/api/billing/payout-wallets`, `/api/billing/summary`. Add a per-agent earnings card: lifetime + window earned, unpaid balance, a "Withdraw to owner wallet" action calling the payout endpoint, and a recent-sales table from `agentEarnings.items`. Design loading (skeleton), empty (no sales → "list a skill to start earning"), populated, and in-flight-withdrawal states.

## Definition of done
- [ ] `agentEarnings` returns correct total / paid / unpaid sourced from the existing ledgers (no new sales table).
- [ ] Payout creates exactly one `agent_withdrawals` row per sweepable balance; the existing cron settles it; a sale is paid out at most once.
- [ ] Money paths covered by tests (verify, settle, split, idempotency); `npm test` passes.
- [ ] User-visible change → entry in `data/changelog.json`, then `npm run build:pages`.
- [ ] `git diff` self-reviewed; revenue math validated (sum of seller legs == total earned; unpaid == total − paid).

## Verification
- `vitest run tests/agent-earnings.test.js`: seed `token_payments` with seller legs for an agent, assert totals; create a payout twice concurrently, assert one `agent_withdrawals` row; mark it completed, assert `unpaid_atomics` drops to 0.
- `npm run dev`, open `/dashboard/monetize` for an agent with sales: network tab shows real `agentEarnings` data; trigger withdraw, confirm a `pending` row appears.
- Invoke `/api/cron/process-withdrawals` (cron bearer) on devnet; confirm it claims the row, settles, and writes `completed` with a tx signature.

## Guardrails
- No mocks/fake data. Real on-chain verification + settlement. Idempotent (no double-charge / double-payout).
- $THREE only in copy; never hardcode a non-$THREE mint.
- Stage explicit paths; re-check `git status` before commit. Push only when asked, to BOTH remotes (`threeD`, `threews`).
- Watch the `npx vercel build` trap: never commit bundled `api/*.js`.
