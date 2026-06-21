# P18 · Subscriptions & Time-Pass Settlement

> **Workstream:** Monetization (revenue engine) · **Priority:** P0 · **Effort:** L · **Depends on:** none

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map). Note the $THREE-only rule and the two coin-agnostic exceptions.
2. three.ws monorepo: vanilla JS + Vite frontend, Vercel functions in `api/`, tests via `vitest` + Playwright (`npm test`), dev server `npm run dev`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.

## Context
The skill marketplace already advertises three purchase shapes per listing but only one is fully wired:

- `api/x402/skill-marketplace.js` — the Bazaar-cataloged listing endpoint. `rowToListing()` (line 103) surfaces `trial_uses`, `time_pass_hours`, and `time_pass_amount` columns from `agent_skill_prices`. **These terms are advertised but never enforced into a grant.**
- `api/_lib/skill-access.js` — `hasSkillAccess(userId, agentId, skill)` is the single source of truth for "may this user run this skill". It already honors: a confirmed `skill_purchases` row (with `valid_until` time-pass expiry, lines 50-57), an agent-level `user_agent_subscriptions` flat sub, a `creator_subscriptions`→`subscription_plans.included_skills` tier sub, and a trial via `consumeTrialUse()`. The read path for time-passes exists; **the write/grant path that sets `valid_until` from `time_pass_hours` does not.**
- `api/_lib/purchase-confirm.js` — confirms a skill/asset purchase, accrues the marketplace split + referral commission, and writes the `skill_purchases` row. This is where a confirmed payment becomes a grant.
- `api/cron/[name].js` → `handleRunSubscriptions` (line 2598) charges EVM USDC recurring subs via `agent_subscriptions` + `agent_delegations` (Base/Sepolia EIP-7710 delegation rail). `handleProcessSubscriptions` (line 2951) charges `creator_subscriptions` priced in `subscription_plans.price_usd`, counting `subscription_payments` failures to flip to `past_due` after 3. Both crons exist; quota tracking on a granted pass does not.
- `api/_lib/token/payments.js` — `verifyAndSettlePayment()` / `recordAllowancePayment()` settle into `token_payments` with UNIQUE(nonce) + UNIQUE(tx_signature) idempotency. `creatorEarnings()` reads the `seller` split leg back out. The marketplace split policy is `marketplace_sale` (90% seller / 5% treasury / 5% rewards) in `api/_lib/token/config.js`.
- `vercel.json` schedules `run-distribute-payments` (`30 * * * *`), `expire-pending-purchases` (`*/5 * * * *`), etc. **There is no cron entry for `run-subscriptions` or `process-subscriptions`** — the handlers are reachable by dispatch but unscheduled.

## Problem / opportunity
A creator can set a 24h `time_pass_hours` + `time_pass_amount` on a listing, the marketplace advertises it, an agent pays it — and nothing grants a time-boxed window or tracks remaining quota. Time-pass terms are decorative. Recurring subscription handlers exist but aren't on a schedule, so renewals never fire in production. The hold-or-pay economy is half-built: the read side checks expiry the write side never sets.

## Mission
Make time-passes and recurring subscriptions real end to end: a paid time-pass becomes a `valid_until`-bounded grant with optional per-pass call quota; recurring subs charge, renew, and expire on a schedule; every grant and charge is idempotent and settles through the existing `token_payments` ledger.

## Scope
**In scope:** time-pass purchase→grant→quota; quota decrement at the skill-execution boundary; recurring `creator_subscriptions` + `agent_subscriptions` renewal/expiry on a cron schedule; idempotent settlement; changelog entry.
**Out of scope:** new pricing UI redesign (a minimal "buy time-pass" affordance on the existing listing card is fine), new chains, EVM delegation rail changes beyond what `handleRunSubscriptions` already does.

## Implementation guide
1. **Schema (`api/_lib/migrations/<date>_timepass-quota.sql`).** Add to `skill_purchases` (if absent): `pass_kind` enum/text (`one_time` | `time_pass`), `calls_total int null`, `calls_used int not null default 0`. Add a partial UNIQUE index keyed on the settling payment reference (e.g. `token_payments` nonce or `skill_purchases.payment_ref`) so a replayed settlement can't mint two grants. Reuse the existing `valid_until`.
2. **Grant on confirm (`api/_lib/purchase-confirm.js`).** When the confirmed listing row has `time_pass_hours > 0`, set `status='confirmed'`, `pass_kind='time_pass'`, `valid_until = now() + (time_pass_hours || ' hours')::interval`, and `calls_total` from a new optional `time_pass_calls` column (null = unlimited within the window). Keep the existing marketplace split + referral accrual. Make the grant write idempotent on the payment reference — re-running confirm for the same settled payment must not extend the window or reset quota.
3. **Quota enforcement (`api/_lib/skill-access.js`).** In `hasSkillAccess`, when a confirmed `time_pass` grant is matched, also return `calls_remaining` (null = unlimited). Add `consumeTimePassUse(userId, agentId, skill)` mirroring `consumeTrialUse`: atomic `UPDATE … SET calls_used = calls_used + 1 WHERE status='confirmed' AND pass_kind='time_pass' AND valid_until > now() AND (calls_total IS NULL OR calls_used < calls_total) RETURNING calls_total - calls_used`. The skill-execution endpoints that already call `consumeTrialUse` on success must call this on a time-pass hit. Expiry is honored by the existing `valid_until` check; quota-exhausted returns `owned:false, reason:'pass_exhausted'`.
4. **Settlement path.** A time-pass is a `marketplace_sale` priced at `time_pass_amount` atomics. Route it through the same quote→`verifyAndSettlePayment` path used for a one-time skill purchase (the existing `api/payments/purchase-skill.js` / `api/_lib/x402.js` flow), with `refType='time_pass'`, `refId=<purchase id>` so `creatorEarnings()` attributes it. Never invent a second settlement path.
5. **Recurring renewal/expiry.** Confirm `handleProcessSubscriptions` advances `current_period_end` by the plan period on a successful charge and flips to `expired`/`past_due` correctly; add an explicit expiry sweep (`UPDATE creator_subscriptions SET status='expired' WHERE status IN ('active','past_due') AND current_period_end < now() - grace`). Add both jobs to `vercel.json` crons: `process-subscriptions` hourly (`5 * * * *`), `run-subscriptions` hourly (`15 * * * *`). Keep the `requireCron` constant-time secret check — never weaken it.
6. **Frontend.** On the listing/skill card (dashboard skill view), when `time_pass_hours` is set show a "Buy <N>h pass — <amount> $THREE" action and, post-purchase, a live "expires in / N calls left" badge read from `hasSkillAccess`. Design loading, empty (no pass), active, and expired states.

## Definition of done
- [ ] Time-pass purchase grants a `valid_until` window + optional call quota; expiry and quota-exhaustion both deny with distinct reasons.
- [ ] `process-subscriptions` + `run-subscriptions` are scheduled in `vercel.json` and renew/expire correctly.
- [ ] Money paths covered by tests (verify, settle, split, idempotency); `npm test` passes.
- [ ] User-visible change → entry in `data/changelog.json`, then `npm run build:pages`.
- [ ] `git diff` self-reviewed; revenue math validated.

## Verification
- `vitest run` a new `tests/skill-access-timepass.test.js`: grant a pass, assert `calls_remaining` counts down, assert deny after `valid_until` and after quota exhaustion, assert double-confirm of one settled payment yields one grant.
- `curl` the marketplace listing → confirm `time_pass_hours`/`time_pass_amount` surface; drive a real `purchase-skill` → confirm flow on devnet and assert one `token_payments` row + one `skill_purchases` grant.
- Invoke `/api/cron/process-subscriptions` with the cron bearer; assert a due sub advances its period and a 3-fail sub flips `past_due`.

## Guardrails
- No mocks/fake data. Real on-chain verification + settlement. Idempotent (no double-charge / double-payout).
- $THREE only in copy; never hardcode a non-$THREE mint.
- Stage explicit paths; re-check `git status` before commit. Push only when asked, to BOTH remotes (`threeD`, `threews`).
- Watch the `npx vercel build` trap: never commit bundled `api/*.js`.
