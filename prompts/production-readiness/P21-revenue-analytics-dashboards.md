# P21 · Revenue Attribution & Creator/Agent Analytics

> **Workstream:** Monetization (revenue engine) · **Priority:** P1 · **Effort:** M · **Depends on:** P19

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map). Note the $THREE-only rule and the two coin-agnostic exceptions.
2. three.ws monorepo: vanilla JS + Vite frontend, Vercel functions in `api/`, tests via `vitest` + Playwright (`npm test`), dev server `npm run dev`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.

## Context
Analytics today is admin totals over the x402 audit log — no creator/agent/endpoint attribution surfaced to the people who earn:

- `api/x402/admin/analytics.js` — admin-only (`requireAdmin`), `?period=1d|7d|30d|90d|all`. Calls `getPaymentStats({ since })` from `api/_lib/x402/audit-log.js`, which aggregates `x402_audit_log` rows where `event_type='payment_settled'`: total payments, total volume (USDC atomics → 6dp), unique payers, `by_route`, `by_network`, `by_day`, plus SIWX grant/access and bypass-by-reason. This is platform-wide x402 traffic, not per-creator revenue, and it reads the audit log, not the settle ledger.
- `api/_lib/token/payments.js` — the $THREE settle ledger. `token_payments` rows carry `purpose`, `splits` (jsonb legs), `ref_type`, `ref_id`, `user_id`, `payer_wallet`, `usd`, `price_usd`, `total_atomics`. `economyStats({ sinceDays })` already unrolls `splits` to `by_role` (treasury/rewards/seller) and `by_purpose`. `creatorEarnings({ sellerWallet })` sums the seller leg per wallet. `listPayments({ purpose, refType, refId, userId })` is keyset-paginated and filters by `ref_type`/`ref_id` — the attribution hooks already exist on the row.
- P19 adds per-agent attribution (`agent_id` on settle metadata + `agentEarnings`). This task builds the dashboards on top.
- `src/dashboard-next/pages/` — `analytics.js` (fetches `/api/billing/revenue`, `/api/widgets`, `/api/billing/summary`, `/api/monetization/revenue?period=`), `monetize.js`, `transactions.js`, `holders.js`, `three-token.js`. Existing revenue endpoints: `api/billing/revenue.js`, `api/billing/summary.js`, `api/monetization/revenue.js`, `api/admin/revenue.js`.

## Problem / opportunity
A creator can't answer "which of my endpoints/skills/agents made the most $THREE this week, and from whom?" Admin sees grand totals; creators see a flat earnings number (P19) with no breakdown by ref_type, endpoint, or counterpart. The attribution columns (`ref_type`, `ref_id`, `purpose`, per-leg `splits`) are written but never sliced into a creator-facing report. Evidence: `getPaymentStats` groups only by route/network/day for an admin; `economyStats` groups by role/purpose platform-wide; neither filters to a creator's own sales nor breaks revenue down by endpoint × counterpart. Without attribution, creators can't optimize what they sell.

## Mission
Build attribution queries over the existing `token_payments` settle ledger (and reconcile the x402 audit log for endpoint hit/conversion stats), and ship creator + agent revenue dashboards that break revenue down by endpoint/skill, by agent, by day, and by paying counterpart — scoped to the requesting creator, not admin-only.

## Scope
**In scope:** creator-scoped attribution reads (`api/_lib/token/payments.js`), a creator analytics endpoint, an agent revenue breakdown, dashboard panels in `analytics.js`/`monetize.js`. Reuse `economyStats`/`creatorEarnings`/`agentEarnings` shapes.
**Out of scope:** changing the admin analytics endpoint's contract (extend, don't break), new charting libs (use the existing dashboard render helpers), the buyback/distribute reporting.

## Implementation guide
1. **Attribution reads (`api/_lib/token/payments.js`).** Add `creatorRevenueBreakdown({ sellerWallet, agentIds, sinceDays, groupBy })` where `groupBy ∈ {ref_type, ref_id, purpose, day, payer_wallet}`. Filter rows to the creator's sales: `splits @> [{role:'seller',address:sellerWallet}]` (jsonb-containment, index-friendly — same pattern `creatorEarnings` uses) OR the P19 `agent_id IN (...)`. Sum the seller-leg atomics per group. Return `{ since, total_atomics, by_endpoint[], by_agent[], by_day[], top_payers[] }`. Keep it pure SQL aggregation — never load all rows into JS to group.
2. **Endpoint hit + conversion (reconcile audit log).** For paid endpoints, join the settle ledger (revenue) with `getPaymentStats`-style `x402_audit_log` counts (`payment_settled` vs `payment_failed` per `route`) so a creator sees attempts, failures, and conversion per endpoint — revenue alone hides churned buyers. Add a `byRouteWithRevenue` read that pairs route hit-count with settled volume; restrict to the creator's owned routes/agents.
3. **Creator analytics endpoint (`api/three/[action].js` add `revenue-breakdown`, or `api/billing/revenue.js` extend).** Auth = session/bearer (mirror `api/three/[action].js` `handleEarnings` at line 288 and `skill-prices.js` ownership checks). Resolve the caller's seller wallet(s) + owned agent ids, call `creatorRevenueBreakdown`, return the breakdown. Window via `?sinceDays`. Never return another creator's rows.
4. **Agent revenue endpoint.** Per-agent slice for the agent owner: revenue by skill/endpoint for one agent over a window, built on P19's `agentEarnings` + the new breakdown. Powers the agent profile's earnings tab.
5. **Dashboards.** In `src/dashboard-next/pages/analytics.js`, add a "Revenue by endpoint / by agent / over time" section fed by the new endpoint — bar list per endpoint (volume + conversion), a sparkline per day, a top-payers list. In `monetize.js`, add the per-agent breakdown beside P19's earnings card. Design loading (skeleton rows), empty ("no sales yet — list a skill"), populated, and error (actionable retry) states. Numbers in $THREE with the USD equivalent from `price_usd` on the row — never a hardcoded price.
6. **Admin parity (optional, additive).** Extend `getPaymentStats` with an optional `groupBy: 'ref_type'|'purpose'` so the admin endpoint can also show settle-ledger attribution, without breaking its current response shape.

## Definition of done
- [ ] Creator/agent breakdowns are scoped to the requester and sourced from `token_payments` (+ audit-log conversion), no new revenue table.
- [ ] Endpoint view shows volume AND conversion (settled vs failed) per owned route.
- [ ] Money paths covered by tests (verify, settle, split, idempotency); `npm test` passes — including that breakdown sums equal the flat `creatorEarnings` total.
- [ ] User-visible change → entry in `data/changelog.json`, then `npm run build:pages`.
- [ ] `git diff` self-reviewed; revenue math validated (Σ by_endpoint == Σ by_agent == total).

## Verification
- `vitest run tests/revenue-breakdown.test.js`: seed `token_payments` with seller legs across two endpoints/agents/days, assert each `groupBy` partitions correctly and totals reconcile with `creatorEarnings`; assert a foreign seller's rows never leak.
- `npm run dev`, `/dashboard/analytics` as a creator with sales: network tab shows the real breakdown endpoint; bars/sparkline render; switching `?sinceDays` re-queries.
- Confirm a non-owner gets 403 (or empty) for another creator's agent revenue.

## Guardrails
- No mocks/fake data. Real on-chain verification + settlement. Idempotent (no double-charge / double-payout).
- $THREE only in copy; never hardcode a non-$THREE mint.
- Stage explicit paths; re-check `git status` before commit. Push only when asked, to BOTH remotes (`threeD`, `threews`).
- Watch the `npx vercel build` trap: never commit bundled `api/*.js`.
